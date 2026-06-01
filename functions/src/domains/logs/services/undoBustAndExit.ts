import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { logOpsError, logOpsSuccess } from "../../../shared/logging/logOpsError";
import {
  type FallbackSeatInput,
  isSeatSlotEmpty,
  readSeatSlot,
  removeUserFromBustedUserInTransaction,
  resolveBustUndoRestorePlan,
  tournamentBustedUserRef,
} from '../lib/bustUndoSeat';

export interface UndoBustAndExitParams {
  tournamentId: string;
  playerUid: string;
  playerName: string;
  tableId: string;
  seatNumber: number;
  rollBackBy: string;
  operationLogId: string;
  /** 伝票の billId。bills の place を戻すために必要 */
  billId?: string;
  fallbackSeat?: FallbackSeatInput;
}

/**
 * バスト＆退場操作を巻き戻す
 */
export async function undoBustAndExit(params: UndoBustAndExitParams): Promise<void> {
  const db = getFirestore();
  const now = Timestamp.now();
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

      const reads: Promise<FirebaseFirestore.DocumentSnapshot>[] = [
        transaction.get(mainViewRef),
        transaction.get(restoreSeatRef),
        transaction.get(bustedRef),
      ];
      if (params.billId) {
        reads.push(transaction.get(db.collection('bills').doc(params.billId)));
      }

      const results = await Promise.all(reads);
      const mainViewDoc = results[0];
      const seatDoc = results[1];
      const bustedDoc = results[2];
      const billDoc = params.billId ? results[3] : null;

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
      const currentPlayersBusted = mainViewData.playersBusted || 0;
      const currentPlayersIn = mainViewData.playersIn || 0;

      transaction.update(mainViewRef, {
        playersBusted: Math.max(0, currentPlayersBusted - 1),
        playersIn: currentPlayersIn + 1,
        updatedAt: now,
      });

      const restoreSeatNumber = parseInt(restorePlan.seatSuffix, 10);

      if (params.billId && billDoc?.exists) {
        const billRef = db.collection('bills').doc(params.billId);
        transaction.update(billRef, {
          'place.table': restorePlan.tableId,
          'place.seat': restoreSeatNumber,
          updatedAt: now,
        });
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
      message: 'undoBustAndExit 成功',
      functionEntry: 'undoBustAndExit',
      context: {
        tournamentId: params.tournamentId,
        playerUid: params.playerUid,
        tableId: params.tableId,
        billId: params.billId,
        usedFallback: restorePlan.usedFallback,
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
