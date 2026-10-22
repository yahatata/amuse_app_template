/**
 * cancelAccounting callable
 *
 * P1-07 + D-2C:
 * - pre-settlement 専用の会計開始取り消し
 * - previousStatus へ復元
 * - activeAccountingStartIdempotencyKey 対応 document を cancelled 化
 * - 同一 key の再 start を拒否（削除しない）
 */

import { getFirestore } from 'firebase-admin/firestore';
import * as admin from 'firebase-admin';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { z } from 'zod';
import { getCallerDeviceByUid, hasRequiredOption, isActive } from '../../../shared/devices';
import { logOpsError, logOpsSuccess } from '../../../shared/logging/logOpsError';
import { FunctionCustomError, mapFunctionCustomErrorToHttpsCode } from '../../../shared/logging/functionCustomError';
import {
  ACTIVE_ACCOUNTING_START_IDEMPOTENCY_KEY_FIELD,
  isIdempotencyCancelled,
} from '../repos/accountingStartIdempotency';
import { shouldDualWrite, legacyUpdateBillUpdate } from '../repos/dualWrite';

const CancelAccountingSchema = z.object({
  billId: z.string().min(1, '請求書IDは必須です'),
  reason: z.string().optional(),
});

/**
 * 会計開始を取り消すCloud Function（pre-settlement 専用）
 */
export const cancelAccounting = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', '認証が必要です');
  }

  const adminId = request.auth.uid;
  const db = getFirestore();

  try {
    const device = await getCallerDeviceByUid(adminId);
    if (!device || !isActive(device.status)) {
      throw new HttpsError('permission-denied', 'デバイスが見つからないか、アクティブではありません');
    }

    const hasPermission = device.role === 'admin' || hasRequiredOption(device.options, 'accounting');
    if (!hasPermission) {
      throw new HttpsError('permission-denied', '会計管理の権限がありません');
    }

    const validatedData = CancelAccountingSchema.parse(request.data);
    const { billId, reason } = validatedData;

    const billRef = db.collection('bills').doc(billId);

    let restoredStatus: 'open' | 'in_progress' = 'open';
    let cancelledIdempotencyKey: string | null = null;

    await db.runTransaction(async (tx) => {
      const billSnap = await tx.get(billRef);
      if (!billSnap.exists) {
        throw new HttpsError('not-found', '指定された請求書が見つかりません');
      }

      const billData = billSnap.data()!;
      const currentStatus = billData.status || 'open';

      const allowedStatuses = ['open', 'in_progress', 'settling'];
      if (!allowedStatuses.includes(currentStatus)) {
        throw new FunctionCustomError({
          errorKey: 'ACCOUNTING_INVALID_STATE',
          message: `会計開始取り消しは pre-settlement 状態のみ可能です。現在の状態: ${currentStatus}。許可された状態: ${allowedStatuses.join(', ')}`,
          context: { billId, currentStatus, allowedStatuses, op: 'cancelAccounting' },
        });
      }

      const now = admin.firestore.Timestamp.now();
      const ops = billData.ops || {};
      const storedPrevious = ops.accountingStartPreviousStatus;
      restoredStatus =
        storedPrevious === 'open' || storedPrevious === 'in_progress'
          ? storedPrevious
          : 'open';

      const activeKey =
        typeof ops.activeAccountingStartIdempotencyKey === 'string' &&
        ops.activeAccountingStartIdempotencyKey.length > 0
          ? ops.activeAccountingStartIdempotencyKey
          : null;

      // active key があるときだけ対応 document を cancelled 化（無関係な key は触らない）
      if (activeKey) {
        cancelledIdempotencyKey = activeKey;
        const idemRef = billRef.collection('idempotency').doc(activeKey);
        const idemSnap = await tx.get(idemRef);
        if (idemSnap.exists) {
          const idemData = idemSnap.data()!;
          if (!isIdempotencyCancelled(idemData)) {
            tx.set(
              idemRef,
              {
                ...idemData,
                status: 'cancelled',
                cancelledAt: now,
                cancelledBy: adminId,
              },
              { merge: true },
            );
          }
        }
        // document が無い場合は no-op（状態復元は続行）
      }

      tx.update(billRef, {
        status: restoredStatus,
        'ops.accountingStartedAt': null,
        'ops.accountingStartedBy': null,
        'ops.accountingStartPreviousStatus': null,
        [ACTIVE_ACCOUNTING_START_IDEMPOTENCY_KEY_FIELD]: null,
        'ops.accountingCanceledAt': now,
        'ops.accountingCanceledBy': adminId,
        updatedAt: now,
      });
    });

    if (await shouldDualWrite()) {
      try {
        await legacyUpdateBillUpdate(db, {
          billId,
          updates: { status: restoredStatus },
        });
      } catch (error: unknown) {
        logger.warn('dualWrite cancelAccounting failed', {
          op: 'cancelAccounting',
          billId,
          restoredStatus,
          reason: error instanceof Error ? error.message : String(error),
        });
      }
    }

    logOpsSuccess({
      message: 'cancelAccounting 成功',
      functionEntry: 'cancelAccounting',
      operation: 'cancelAccountingCallable',
      context: {
        billId,
        adminId,
        reason: reason || null,
        restoredStatus,
        cancelledIdempotencyKey,
        cancelRequested: true,
      },
    });

    return {
      success: true,
      message: '会計開始を取り消しました',
      billId,
    };
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      throw new HttpsError('invalid-argument', '入力データが無効です', error.errors);
    }
    if (error instanceof FunctionCustomError) {
      logOpsError({
        message: 'cancelAccounting failed',
        functionEntry: 'cancelAccounting',
        operation: 'cancelAccountingCatch',
        cause: error,
      });
      throw new HttpsError(
        mapFunctionCustomErrorToHttpsCode(error.errorKey),
        error.message,
        { errorKey: error.errorKey, context: error.context },
      );
    }
    if (error instanceof HttpsError) {
      throw error;
    }
    logOpsError({
      message: 'cancelAccounting failed',
      functionEntry: 'cancelAccounting',
      operation: 'cancelAccountingGenericCatch',
      cause: error,
      context: {
        op: 'cancelAccounting',
        code: 'internal',
      },
    });
    throw new HttpsError(
      'internal',
      '会計開始取り消しに失敗しました',
      error instanceof Error ? error.message : String(error),
    );
  }
});
