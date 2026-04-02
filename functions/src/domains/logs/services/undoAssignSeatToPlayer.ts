import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { logOpsError } from "../../../shared/logging/logOpsError";

export interface UndoAssignSeatToPlayerParams {
  tournamentId: string;
  playerUid: string;
  playerName: string;
  tableId: string;
  seatNumber: number;
  rollBackBy: string;
}

/**
 * プレイヤーへのシート割当操作を巻き戻す
 */
export async function undoAssignSeatToPlayer(params: UndoAssignSeatToPlayerParams): Promise<void> {
  const db = getFirestore();
  const now = Timestamp.now();
  
  try {
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
      const waitingRef = db
        .collection('scheduledTournaments')
        .doc(params.tournamentId)
        .collection('tablesSeat')
        .doc('waiting');

      const [mainViewDoc, seatDoc, waitingDoc] = await Promise.all([
        transaction.get(mainViewRef),
        transaction.get(seatRef),
        transaction.get(waitingRef),
      ]);

      if (!mainViewDoc.exists) {
        throw new Error('Main view not found');
      }
      const mainViewData = mainViewDoc.data()!;
      const currentSeatedCount = mainViewData.seatedCount || 0;
      const currentWaitingCount = mainViewData.waitingCount || 0;

      transaction.update(mainViewRef, {
        seatedCount: Math.max(0, currentSeatedCount - 1),
        waitingCount: currentWaitingCount + 1,
        updatedAt: now,
      });

      if (seatDoc.exists) {
        const seatData = seatDoc.data()!;
        const seats = seatData.seats || {};
        const seatNumStr = String(params.seatNumber).padStart(2, '0');
        const seatKey = `seat${seatNumStr}UserId`;
        const nameKey = `seat${seatNumStr}PokerName`;
        if (seats[seatKey] !== undefined || seats[nameKey] !== undefined) {
          const updatedSeats = { ...seats };
          updatedSeats[seatKey] = null;
          updatedSeats[nameKey] = null;
          transaction.update(seatRef, {
            seats: updatedSeats,
            updatedAt: now,
          });
        }
      }

      const currentWaiting = waitingDoc.exists ? (waitingDoc.data()!.waiting || {}) : {};
      const updatedWaiting = { ...currentWaiting };
      const maxOrder = Object.values(updatedWaiting)
        .filter((v): v is { order?: number } => typeof v === 'object' && v !== null)
        .reduce((max, v) => Math.max(max, v.order ?? 0), 0);
      updatedWaiting[params.playerUid] = {
        pokerName: params.playerName,
        joinedAt: now,
        order: maxOrder + 1,
        updatedAt: now,
      };
      transaction.set(waitingRef, {
        waiting: updatedWaiting,
        count: Object.keys(updatedWaiting).length,
        updatedAt: now,
      });
    });
    
    console.log(`Assign seat to player operation undone for player ${params.playerName} in tournament ${params.tournamentId}`);
    
  } catch (error) {
    logOpsError({
      message: 'Error undoing assign seat to player operation:',
      failureType: 'business',
      functionEntry: 'undoAssignSeatToPlayer',
      cause: error,
    });
    throw error;
  }
}
