import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { logOpsError, logOpsSuccess } from "../../../shared/logging/logOpsError";

export interface UndoRegisterForTournamentParams {
  tournamentId: string;
  playerUid: string;
  playerName: string;
  rollBackBy: string;
  /** 伝票の billId。bills の entryCount を戻すために必要 */
  billId?: string;
  /** テンプレートID。bills/{billId}/tournaments/{templateId} の更新に必要 */
  templateId?: string;
}

/**
 * トーナメント登録（LIFF 参加申し込み）操作を巻き戻す
 */
export async function undoRegisterForTournament(params: UndoRegisterForTournamentParams): Promise<void> {
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
      const waitingRef = db
        .collection('scheduledTournaments')
        .doc(params.tournamentId)
        .collection('tablesSeat')
        .doc('waiting');
      const usersListRef = db
        .collection('scheduledTournaments')
        .doc(params.tournamentId)
        .collection('views')
        .doc('usersList');
      const tablesSeatRef = db
        .collection('scheduledTournaments')
        .doc(params.tournamentId)
        .collection('tablesSeat');

      const [mainViewDoc, waitingDoc, usersListDoc, tablesSeatSnap, billTournamentDoc] = await Promise.all([
        transaction.get(mainViewRef),
        transaction.get(waitingRef),
        transaction.get(usersListRef),
        transaction.get(tablesSeatRef.limit(200)),
        billTournamentRef ? transaction.get(billTournamentRef) : Promise.resolve(null),
      ]);

      if (!mainViewDoc.exists) {
        throw new Error('Main view not found');
      }
      const mainViewData = mainViewDoc.data()!;
      const currentEntries = mainViewData.entries || 0;
      const currentPlayersIn = mainViewData.playersIn || 0;
      const currentWaitingCount = mainViewData.waitingCount || 0;

      let wasInWaiting = false;
      if (waitingDoc.exists) {
        const waitingData = waitingDoc.data()!;
        const waiting = waitingData.waiting || {};
        if (waiting[params.playerUid] != null) {
          wasInWaiting = true;
        }
      }

      // 着席済みかどうか: tablesSeat の各卓を走査（waiting 以外）
      let seatDocRef: FirebaseFirestore.DocumentReference | null = null;
      let seatData: Record<string, unknown> | null = null;
      let seatKeyUserId: string | null = null;
      let seatKeyPokerName: string | null = null;
      let seatKeyOkibakeEntryId: string | null = null;
      for (const doc of tablesSeatSnap.docs) {
        if (doc.id === 'waiting') continue;
        const data = doc.data();
        const seats = data.seats || {};
        for (const [k, v] of Object.entries(seats)) {
          if (k.endsWith('UserId') && v === params.playerUid) {
            seatDocRef = doc.ref;
            seatData = data;
            seatKeyUserId = k;
            seatKeyPokerName = k.replace('UserId', 'PokerName');
            seatKeyOkibakeEntryId = k.replace('UserId', 'OkibakeEntryId');
            break;
          }
        }
        if (seatDocRef) break;
      }

      // 1. views/main を更新
      transaction.update(mainViewRef, {
        entries: Math.max(0, currentEntries - 1),
        playersIn: Math.max(0, currentPlayersIn - 1),
        waitingCount: Math.max(0, currentWaitingCount - (wasInWaiting ? 1 : 0)),
        updatedAt: now,
      });

      // 2. waiting から削除（在籍していた場合）
      if (waitingDoc.exists && wasInWaiting) {
        const waitingData = waitingDoc.data()!;
        const waiting = { ...(waitingData.waiting || {}) };
        delete waiting[params.playerUid];
        const newCount = Object.keys(waiting).length;
        transaction.set(waitingRef, {
          waiting,
          count: newCount,
          updatedAt: now,
        }, { merge: true });
      }

      // 3. 着席していた場合は席を空ける
      if (seatDocRef && seatData && seatKeyUserId && seatKeyPokerName) {
        const seats = { ...(seatData.seats as Record<string, unknown>) };
        seats[seatKeyUserId] = null;
        seats[seatKeyPokerName] = null;
        if (seatKeyOkibakeEntryId) {
          seats[seatKeyOkibakeEntryId] = null;
        }
        transaction.update(seatDocRef, {
          seats,
          updatedAt: now,
        });
      }

      // 4. usersList から削除
      if (usersListDoc.exists) {
        const usersListData = usersListDoc.data()!;
        const users = { ...(usersListData.users || {}) };
        delete users[params.playerUid];
        transaction.update(usersListRef, {
          users,
          updatedAt: now,
        });
      }

      // 5. bills の entryCount を 0 に戻す（金銭の巻き戻し）
      if (billTournamentRef != null && billTournamentDoc?.exists) {
        transaction.update(billTournamentRef, {
          entryCount: 0,
          registeredAt: null,
          updatedAt: now,
        });
        if (billRef != null) {
          transaction.update(billRef, { updatedAt: now });
        }
      }
    });

    logOpsSuccess({
      message: 'undoRegisterForTournament 成功',
      functionEntry: 'undoRegisterForTournament',
      context: {
        tournamentId: params.tournamentId,
        playerUid: params.playerUid,
      },
    });
  } catch (error) {
    logOpsError({
      message: 'Error undoing register for tournament:',
      functionEntry: 'undoRegisterForTournament',
      cause: error,
      context: {
        tournamentId: params.tournamentId,
        playerUid: params.playerUid,
        billId: params.billId,
        templateId: params.templateId,
      },
    });
    throw error;
  }
}
