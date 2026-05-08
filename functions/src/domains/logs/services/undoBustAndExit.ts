import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { logOpsError, logOpsSuccess } from "../../../shared/logging/logOpsError";

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

    logOpsSuccess({
      message: 'undoBustAndExit 成功',
      functionEntry: 'undoBustAndExit',
      context: {
        tournamentId: params.tournamentId,
        playerUid: params.playerUid,
        tableId: params.tableId,
        billId: params.billId,
      },
    });
  } catch (error) {
    logOpsError({
      message: 'Error undoing bust and exit operation:',
      functionEntry: 'undoBustAndExit',
      cause: error,
      context: {
        tournamentId: params.tournamentId,
        playerUid: params.playerUid,
        tableId: params.tableId,
        seatNumber: params.seatNumber,
        billId: params.billId,
      },
    });
    throw error;
  }
}
