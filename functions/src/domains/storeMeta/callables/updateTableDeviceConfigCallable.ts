import { getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { z } from 'zod';

import { requireAdmin } from '../../../shared/devices';
import { logOpsError, logOpsSuccess } from '../../../shared/logging/logOpsError';

const updateTableDeviceConfigSchema = z.object({
  actionHistoryViewEnabled: z.boolean().optional(),
  actionHistoryRollbackEnabled: z.boolean().optional(),
});

export const updateTableDeviceConfigCallable = onCall(async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError('unauthenticated', '認証が必要です');
  }

  const db = getFirestore();

  try {
    await requireAdmin(db, request.auth.uid);

    const validated = updateTableDeviceConfigSchema.parse(request.data);
    if (
      validated.actionHistoryViewEnabled == null &&
      validated.actionHistoryRollbackEnabled == null
    ) {
      throw new HttpsError(
        'invalid-argument',
        '更新対象の設定が指定されていません',
      );
    }

    const configDoc = await db.collection('storeMeta').doc('config').get();
    const existingTableDevice = configDoc.data()?.tableDevice as
      | Record<string, unknown>
      | undefined;
    const effectiveViewEnabled =
      validated.actionHistoryViewEnabled ??
      (typeof existingTableDevice?.actionHistoryViewEnabled === 'boolean'
          ? existingTableDevice.actionHistoryViewEnabled
          : true);
    const effectiveRollbackEnabled =
      validated.actionHistoryRollbackEnabled ??
      (typeof existingTableDevice?.actionHistoryRollbackEnabled === 'boolean'
          ? existingTableDevice.actionHistoryRollbackEnabled
          : false);
    if (!effectiveViewEnabled && effectiveRollbackEnabled) {
      throw new HttpsError(
        'invalid-argument',
        'actionHistoryRollbackEnabled を true にする場合は actionHistoryViewEnabled も true にしてください',
      );
    }

    const tableDeviceUpdate: Record<string, unknown> = {};
    if (validated.actionHistoryViewEnabled != null) {
      tableDeviceUpdate.actionHistoryViewEnabled =
        validated.actionHistoryViewEnabled;
    }
    if (validated.actionHistoryRollbackEnabled != null) {
      tableDeviceUpdate.actionHistoryRollbackEnabled =
        validated.actionHistoryRollbackEnabled;
    }

    await db.collection('storeMeta').doc('config').set({
      tableDevice: tableDeviceUpdate,
    }, { merge: true });

    logOpsSuccess({
      message: 'updateTableDeviceConfigCallable 成功',
      functionEntry: 'updateTableDeviceConfigCallable',
      context: {
        actionHistoryViewEnabled:
          validated.actionHistoryViewEnabled ?? null,
        actionHistoryRollbackEnabled:
          validated.actionHistoryRollbackEnabled ?? null,
      },
    });

    return {
      success: true,
      message: '卓端末設定を更新しました',
      tableDevice: {
        actionHistoryViewEnabled:
          validated.actionHistoryViewEnabled ?? null,
        actionHistoryRollbackEnabled:
          validated.actionHistoryRollbackEnabled ?? null,
      },
    };
  } catch (error) {
    if (error instanceof HttpsError) {
      throw error;
    }
    if (error instanceof z.ZodError) {
      throw new HttpsError(
        'invalid-argument',
        error.errors.map((entry) => entry.message).join(', '),
      );
    }

    logOpsError({
      message: 'updateTableDeviceConfigCallable failed',
      functionEntry: 'updateTableDeviceConfigCallable',
      cause: error,
    });
    throw new HttpsError('internal', '卓端末設定の更新に失敗しました');
  }
});
