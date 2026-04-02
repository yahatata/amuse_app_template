import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { logOpsError } from "../../../shared/logging/logOpsError";

export interface UndoBustAndExitParams {
  tournamentId: string;
  playerUid: string;
  playerName: string;
  tableId: string;
  seatNumber: number;
  rollBackBy: string;
  /** 伝票の billId。bills の place を戻すために必要 */
  billId?: string;
}

/**
 * バスト＆退場操作を巻き戻す
 */
export async function undoBustAndExit(params: UndoBustAndExitParams): Promise<void> {
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

      const reads: Promise<FirebaseFirestore.DocumentSnapshot>[] = [
        transaction.get(mainViewRef),
        transaction.get(seatRef),
      ];
      if (params.billId) {
        reads.push(transaction.get(db.collection('bills').doc(params.billId)));
      }

      const results = await Promise.all(reads);
      const mainViewDoc = results[0];
      const seatDoc = results[1];
      const billDoc = params.billId ? results[2] : null;

      if (!mainViewDoc.exists) {
        throw new Error('Main view not found');
      }
      const mainViewData = mainViewDoc.data()!;
      const currentPlayersBusted = mainViewData.playersBusted || 0;
      const currentPlayersIn = mainViewData.playersIn || 0;

      transaction.update(mainViewRef, {
        playersBusted: Math.max(0, currentPlayersBusted - 1),
        playersIn: currentPlayersIn + 1,
        updatedAt: now,
      });

      if (params.billId && billDoc?.exists) {
        const billRef = db.collection('bills').doc(params.billId);
        transaction.update(billRef, {
          'place.table': params.tableId,
          'place.seat': params.seatNumber,
          updatedAt: now,
        });
      }

      if (seatDoc.exists) {
        const seatData = seatDoc.data()!;
        const seats = seatData.seats || {};
        const seatNumStr = String(params.seatNumber).padStart(2, '0');
        const seatKey = `seat${seatNumStr}UserId`;
        const nameKey = `seat${seatNumStr}PokerName`;
        if (seats[seatKey] !== undefined || seats[nameKey] !== undefined) {
          const updatedSeats = { ...seats };
          updatedSeats[seatKey] = params.playerUid;
          updatedSeats[nameKey] = params.playerName;
          transaction.update(seatRef, {
            seats: updatedSeats,
            updatedAt: now,
          });
        }
      }
    });

    console.log(`Bust and exit operation undone for player ${params.playerName} in tournament ${params.tournamentId}`);
  } catch (error) {
    logOpsError({
      message: 'Error undoing bust and exit operation:',
      failureType: 'business',
      functionEntry: 'undoBustAndExit',
      cause: error,
    });
    throw error;
  }
}
