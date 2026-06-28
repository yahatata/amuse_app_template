import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { logOpsError, logOpsSuccess } from "../../../shared/logging/logOpsError";
import { appendAvgStackToMainViewUpdate } from '../../../shared/tournament/calculateAvgStack';
import {
  type FallbackSeatInput,
  isSeatSlotEmpty,
  readSeatSlot,
  removeUserFromBustedUserInTransaction,
  resolveBustUndoRestorePlan,
  tournamentBustedUserRef,
} from '../lib/bustUndoSeat';

export interface UndoBustAndReentryParams {
  tournamentId: string;
  playerUid: string;
  playerName: string;
  tableId: string;
  seatNumber: number;
  rollBackBy: string;
  operationLogId: string;
  /** 伝票の billId。bills の reentryCount を戻すために必要 */
  billId?: string;
  /** テンプレートID。bills/{billId}/tournaments/{templateId} の更新に必要 */
  templateId?: string;
  fallbackSeat?: FallbackSeatInput;
}

/**
 * バスト＆リ・エントリー操作を巻き戻す。
 * 巻き戻し後は「バストする前」の状態＝エントリー済みでトーナメントに参加中（席に座っている）に戻す。
 */
export async function undoBustAndReentry(params: UndoBustAndReentryParams): Promise<void> {
  const db = getFirestore();
  const now = Timestamp.now();
  const tournamentSnap = await db.collection('scheduledTournaments').doc(params.tournamentId).get();
  const snapshot = tournamentSnap.data()?.snapshot ?? {};
  const seatNumStr = String(params.seatNumber).padStart(2, '0');
  const originalSeatKey = `seat${seatNumStr}`;

  try {
    const originalTableSnap = await db
      .collection('scheduledTournaments')
      .doc(params.tournamentId)
      .collection('tablesSeat')
      .doc(params.tableId)
      .get();
    if (!originalTableSnap.exists) {
      throw new HttpsError('failed-precondition', '席テーブルが存在しません');
    }
    const originalSeats =
      typeof originalTableSnap.data()?.seats === 'object' &&
      originalTableSnap.data()?.seats != null
        ? (originalTableSnap.data()!.seats as Record<string, unknown>)
        : {};
    const originalSeatEmpty = isSeatSlotEmpty(readSeatSlot(originalSeats, seatNumStr));

    const restorePlan = await resolveBustUndoRestorePlan({
      db,
      tournamentId: params.tournamentId,
      operationLogId: params.operationLogId,
      participantType: 'normal',
      originalTableId: params.tableId,
      originalSeatKey,
      originalSeatEmpty,
      fallbackSeat: params.fallbackSeat,
    });

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
      const restoreSeatRef = db
        .collection('scheduledTournaments')
        .doc(params.tournamentId)
        .collection('tablesSeat')
        .doc(restorePlan.tableId);
      const bustedRef = tournamentBustedUserRef(db, params.tournamentId);

      const reads = [
        transaction.get(mainViewRef),
        transaction.get(restoreSeatRef),
        transaction.get(bustedRef),
      ] as Promise<FirebaseFirestore.DocumentSnapshot>[];
      if (billTournamentRef) reads.push(transaction.get(billTournamentRef));

      const results = await Promise.all(reads);
      const mainViewDoc = results[0];
      const seatDoc = results[1];
      const bustedDoc = results[2];
      const billTournamentDoc = billTournamentRef ? results[3] : null;

      if (!mainViewDoc.exists) {
        throw new Error('Main view not found');
      }
      if (!seatDoc.exists) {
        throw new HttpsError('failed-precondition', '戻し先テーブルが存在しません');
      }

      const seatData = seatDoc.data() ?? {};
      const seats =
        typeof seatData.seats === 'object' && seatData.seats != null
          ? { ...(seatData.seats as Record<string, unknown>) }
          : {};
      const restoreSuffix = restorePlan.seatSuffix;

      if (!isSeatSlotEmpty(readSeatSlot(seats, restoreSuffix))) {
        throw new HttpsError('failed-precondition', '戻し先席は使用中です');
      }

      if (!restorePlan.usedFallback) {
        const originalSeatRef = db
          .collection('scheduledTournaments')
          .doc(params.tournamentId)
          .collection('tablesSeat')
          .doc(params.tableId);
        const originalSeatDoc = await transaction.get(originalSeatRef);
        const originalSeatData = originalSeatDoc.data() ?? {};
        const originalSeatMap =
          typeof originalSeatData.seats === 'object' && originalSeatData.seats != null
            ? (originalSeatData.seats as Record<string, unknown>)
            : {};
        if (!isSeatSlotEmpty(readSeatSlot(originalSeatMap, seatNumStr))) {
          throw new HttpsError(
            'failed-precondition',
            '元席の状態が変わったため Bust 取り消しできません。再度お試しください。'
          );
        }
      }

      const mainViewData = mainViewDoc.data()!;
      const currentReentries = mainViewData.reentries || 0;
      const currentPlayersBusted = mainViewData.playersBusted || 0;

      transaction.update(
        mainViewRef,
        appendAvgStackToMainViewUpdate(
          {
            reentries: Math.max(0, currentReentries - 1),
            playersBusted: Math.max(0, currentPlayersBusted - 1),
            updatedAt: now,
          },
          mainViewData,
          snapshot,
        ),
      );

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

      seats[`seat${restoreSuffix}UserId`] = params.playerUid;
      seats[`seat${restoreSuffix}PokerName`] = params.playerName;
      seats[`seat${restoreSuffix}OkibakeEntryId`] = null;
      transaction.update(restoreSeatRef, {
        seats,
        updatedAt: now,
      });

      removeUserFromBustedUserInTransaction(
        transaction,
        bustedRef,
        bustedDoc.exists,
        params.playerUid,
        now
      );
    });

    logOpsSuccess({
      message: 'undoBustAndReentry 成功',
      functionEntry: 'undoBustAndReentry',
      context: {
        tournamentId: params.tournamentId,
        playerUid: params.playerUid,
        tableId: params.tableId,
        billId: params.billId,
        templateId: params.templateId,
        usedFallback: restorePlan.usedFallback,
      },
    });
  } catch (error) {
    logOpsError({
      message: 'Error undoing bust and reentry operation:',
      functionEntry: 'undoBustAndReentry',
      cause: error,
      context: {
        tournamentId: params.tournamentId,
        playerUid: params.playerUid,
        tableId: params.tableId,
        seatNumber: params.seatNumber,
        billId: params.billId,
        templateId: params.templateId,
      },
    });
    throw error;
  }
}
