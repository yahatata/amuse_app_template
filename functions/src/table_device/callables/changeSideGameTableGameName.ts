import * as admin from 'firebase-admin';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { z } from 'zod';

import {
  requireSideGameTableMutationCaller,
  resolveSideGameTypes,
  serverTimestamp,
} from '../lib/shared';
import { logOpsError, logOpsSuccess } from '../../shared/logging/logOpsError';

const schema = z.object({
  tableId: z.string().min(1),
  gameName: z.string().min(1),
});

export const changeSideGameTableGameName = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', '認証が必要です');
  }

  let deviceId: string | undefined;
  try {
    const { tableId, gameName } = schema.parse(request.data);
    const db = admin.firestore();
    const { device } = await requireSideGameTableMutationCaller({
      callerUid: request.auth.uid,
      requestedTableId: tableId,
    });
    deviceId = device.id;

    const sideGameTypes = await resolveSideGameTypes(db);
    if (!sideGameTypes.includes(gameName)) {
      throw new HttpsError('invalid-argument', '無効なサイドゲーム名です');
    }

    await db.runTransaction(async (transaction) => {
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

      transaction.update(tableRef, {
        status: gameName,
        updatedAt: serverTimestamp(),
      });
      transaction.update(sideGameRef, {
        gameName,
        updatedAt: serverTimestamp(),
      });
    });

    logOpsSuccess({
      message: 'changeSideGameTableGameName 成功',
      functionEntry: 'changeSideGameTableGameName',
      context: {
        deviceId,
        tableId,
        gameName,
      },
    });

    return {
      success: true,
      tableId,
      gameName,
    };
  } catch (error) {
    logOpsError({
      message: 'changeSideGameTableGameName 失敗',
      functionEntry: 'changeSideGameTableGameName',
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
      error instanceof Error ? error.message : 'サイドゲーム名の変更に失敗しました',
    );
  }
});
