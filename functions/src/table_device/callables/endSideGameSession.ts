import * as admin from 'firebase-admin';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { z } from 'zod';

import {
  buildSeatClearUpdateFromSeats,
  requireSideGameTableMutationCaller,
  resolveTableStatusAfterSideGameEnd,
  serverTimestamp,
} from '../lib/shared';
import { logOpsError, logOpsSuccess } from '../../shared/logging/logOpsError';

const schema = z.object({
  tableId: z.string().min(1),
});

export const endSideGameSession = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', '認証が必要です');
  }

  let deviceId: string | undefined;
  try {
    const { tableId } = schema.parse(request.data);
    const db = admin.firestore();
    const { device } = await requireSideGameTableMutationCaller({
      callerUid: request.auth.uid,
      requestedTableId: tableId,
    });
    deviceId = device.id;

    const restoredStatus = await resolveTableStatusAfterSideGameEnd(db, tableId);

    const result = await db.runTransaction(async (transaction) => {
      const tableRef = db.collection('tables').doc(tableId);
      const sideGameRef = db.collection('sideGame').doc(tableId);
      const [tableDoc, sideGameDoc] = await Promise.all([
        transaction.get(tableRef),
        transaction.get(sideGameRef),
      ]);

      if (!tableDoc.exists) {
        throw new HttpsError('not-found', '卓が見つかりません');
      }
      if (!sideGameDoc.exists) {
        throw new HttpsError('not-found', 'サイドゲーム情報が見つかりません');
      }

      const tableData = tableDoc.data() ?? {};
      const sideGameData = sideGameDoc.data() ?? {};
      const maxSeats = Number(sideGameData.maxSeats ?? tableData.maxSeats ?? 6);
      const seats =
        (sideGameData.seats as Record<string, unknown> | undefined) ?? {};
      const seatClearUpdate = buildSeatClearUpdateFromSeats(seats, maxSeats);

      transaction.update(sideGameRef, {
        ...seatClearUpdate,
        active: false,
        updatedAt: serverTimestamp(),
      });

      transaction.update(tableRef, {
        status: restoredStatus,
        updatedAt: serverTimestamp(),
      });

      return {
        success: true,
        tableId,
        restoredStatus,
      };
    });

    logOpsSuccess({
      message: 'endSideGameSession 成功',
      functionEntry: 'endSideGameSession',
      context: {
        deviceId,
        tableId,
        restoredStatus: result.restoredStatus,
      },
    });

    return result;
  } catch (error) {
    logOpsError({
      message: 'endSideGameSession 失敗',
      functionEntry: 'endSideGameSession',
      cause: error,
      context: {
        deviceId,
      },
    });

    if (error instanceof HttpsError) {
      throw error;
    }
    if (error instanceof z.ZodError) {
      throw new HttpsError('invalid-argument', error.errors.map((e) => e.message).join(', '));
    }
    throw new HttpsError(
      'internal',
      error instanceof Error ? error.message : 'サイドゲーム終了に失敗しました',
    );
  }
});
