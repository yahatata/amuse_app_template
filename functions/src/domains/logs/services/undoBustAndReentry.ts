import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { logOpsError } from "../../../shared/logging/logOpsError";

export interface UndoBustAndReentryParams {
  tournamentId: string;
  playerUid: string;
  playerName: string;
  tableId: string;
  seatNumber: number;
  rollBackBy: string;
  /** 伝票の billId。bills の reentryCount を戻すために必要 */
  billId?: string;
  /** テンプレートID。bills/{billId}/tournaments/{templateId} の更新に必要 */
  templateId?: string;
}

/**
 * バスト＆リ・エントリー操作を巻き戻す。
 * 巻き戻し後は「バストする前」の状態＝エントリー済みでトーナメントに参加中（席に座っている）に戻す。
 */
export async function undoBustAndReentry(params: UndoBustAndReentryParams): Promise<void> {
  const db = getFirestore();
  const now = Timestamp.now();
  
  try {
    const billRef = params.billId ? db.collection('bills').doc(params.billId) : null;
    const billTournamentRef =
      params.billId && params.templateId
        ? billRef!.collection('tournaments').doc(params.templateId)
        : null;

    await db.runTransaction(async (transaction) => {
      const mainViewRef = db
        .collection('scheduledTournaments')
        .doc(params.tournamentId)
        .collection('views')
        .doc('main');
      const seatRef = db
        .collection('scheduledTournaments')
        .doc(params.tournamentId)
        .collection('tablesSeat')
        .doc(params.tableId);

      const reads = [
        transaction.get(mainViewRef),
        transaction.get(seatRef),
      ] as Promise<FirebaseFirestore.DocumentSnapshot>[];
      if (billTournamentRef) reads.push(transaction.get(billTournamentRef));

      const results = await Promise.all(reads);
      const mainViewDoc = results[0];
      const seatDoc = results[1];
      const billTournamentDoc = billTournamentRef ? results[2] : null;

      if (!mainViewDoc.exists) {
        throw new Error('Main view not found');
      }
      const mainViewData = mainViewDoc.data()!;
      const currentReentries = mainViewData.reentries || 0;

      // リエントリー回数だけ戻す。playersIn は減らさない（巻き戻し後はプレイヤーが席に戻るため）
      transaction.update(mainViewRef, {
        reentries: Math.max(0, currentReentries - 1),
        updatedAt: now,
      });

      // bills/{billId}/tournaments/{templateId} の reentryCount を 1 減らす（金銭の巻き戻し）。todaysBills は廃止済みのため bills のみ更新
      if (billTournamentRef != null && billTournamentDoc?.exists) {
        const data = billTournamentDoc.data()!;
        const current = data.reentryCount ?? 0;
        const newReentryCount = Math.max(0, current - 1);
        const clearLastReentryAt = newReentryCount === 0;
        transaction.update(billTournamentRef, {
          reentryCount: newReentryCount,
          updatedAt: now,
          ...(clearLastReentryAt ? { lastReentryAt: null } : {}),
        });
        if (billRef != null) {
          transaction.update(billRef, { updatedAt: now });
        }
      }

      // 巻き戻し後は「バストする前」＝その席にプレイヤーが座っている状態に戻す（席を空けずに復元する）
      if (seatDoc.exists) {
        const seatData = seatDoc.data()!;
        const seats = seatData.seats || {};
        const seatNumStr = String(params.seatNumber).padStart(2, '0');
        const seatKey = `seat${seatNumStr}UserId`;
        const nameKey = `seat${seatNumStr}PokerName`;
        const updatedSeats = { ...seats };
        updatedSeats[seatKey] = params.playerUid;
        updatedSeats[nameKey] = params.playerName;
        transaction.update(seatRef, {
          seats: updatedSeats,
          updatedAt: now,
        });
      }
    });
    
    console.log(`Bust and reentry operation undone for player ${params.playerName} in tournament ${params.tournamentId}`);
    
  } catch (error) {
    logOpsError({
      message: 'Error undoing bust and reentry operation:',
      failureType: 'business',
      functionEntry: 'unknown',
      cause: error,
    });
    throw error;
  }
}
