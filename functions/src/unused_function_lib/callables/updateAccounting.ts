/**
 * updateAccounting callable（新世界版）
 * 
 * P1-07: 会計後調整APIとして再設計
 * 
 * - 旧実装（todaysBillsベース、items/extraCost/tournaments/sideGameChipを更新、totalPriceを再計算）を削除
 * - 新実装（billsベース、postEventAdjustment / postEventCancel / postEventReopen を内部で使用）に置き換え
 * - 会計後調整APIとして、/events + postEvents.totalAdjustmentsIncl などを更新
 */

import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { z } from 'zod';
import { getCallerDeviceByUid, hasRequiredOption, isActive } from '../../../shared/devices';
import { logOpsError, logOpsSuccess } from '../../../shared/logging/logOpsError';
import { postEventAdjustment } from '../repos/postEventAdjustment';
import { postEventCancel } from '../repos/postEventCancel';
import { postEventReopen } from '../repos/postEventReopen';

// 会計後調整のスキーマ
const UpdateAccountingSchema = z.object({
  billId: z.string().min(1, '請求書IDは必須です'),
  idempotencyKey: z.string().min(1, 'idempotencyKeyは必須です'),
  eventType: z.enum(['adjustment', 'cancel', 'reopen']),
  eventPayload: z.object({
    // adjustment の場合
    sign: z.union([z.literal(1), z.literal(-1)]).optional(), // +1: 追加徴収、-1: 減額
    amountIncl: z.number().min(0).optional(), // 調整額（税込、正の値）
    reason: z.string().optional(),
    // cancel / reopen の場合
  }).optional(),
  reason: z.string().optional(), // cancel / reopen の場合の理由
});

/**
 * 会計後調整を行うCloud Function
 * 管理者権限またはaccountingオプションを持つデバイスのみが実行可能
 */
export const updateAccounting = onCall(async (request) => {
  // 認証チェック
  if (!request.auth) {
    throw new HttpsError('unauthenticated', '認証が必要です');
  }

  const adminId = request.auth.uid;

  try {
    // デバイス権限の確認（role: admin または options.accounting: true）
    const device = await getCallerDeviceByUid(adminId);
    if (!device || !isActive(device.status)) {
      throw new HttpsError('permission-denied', 'デバイスが見つからないか、アクティブではありません');
    }

    const hasPermission = device.role === 'admin' || hasRequiredOption(device.options, 'accounting');
    if (!hasPermission) {
      throw new HttpsError('permission-denied', '会計管理の権限がありません');
    }

    // 入力データの検証
    const validatedData = UpdateAccountingSchema.parse(request.data);
    const { billId, idempotencyKey, eventType, eventPayload, reason } = validatedData;

    let result: any;

    if (eventType === 'adjustment') {
      // postEventAdjustment を呼び出す
      if (!eventPayload || eventPayload.sign === undefined || eventPayload.amountIncl === undefined) {
        throw new HttpsError('invalid-argument', 'adjustment の場合、sign と amountIncl は必須です');
      }

      result = await postEventAdjustment({
        billId,
        idempotencyKey,
        eventPayload: {
          sign: eventPayload.sign,
          amountIncl: eventPayload.amountIncl,
          reason: eventPayload.reason,
        },
        createdBy: adminId,
      });

    } else if (eventType === 'cancel') {
      // postEventCancel を呼び出す
      result = await postEventCancel({
        billId,
        idempotencyKey,
        reason: reason || eventPayload?.reason,
        createdBy: adminId,
      });

    } else if (eventType === 'reopen') {
      // postEventReopen を呼び出す
      result = await postEventReopen({
        billId,
        idempotencyKey,
        reason: reason || eventPayload?.reason,
        createdBy: adminId,
      });

    } else {
      throw new HttpsError('invalid-argument', `Unknown eventType: ${eventType}`);
    }

    logOpsSuccess({
      message: 'updateAccounting 成功',
      functionEntry: 'updateAccounting',
      context: {
        op: 'updateAccounting',
        billId,
        eventType,
        eventId: result.eventId,
        code: 'internal',
      },
    });


    return {
      success: true,
      message: `会計後調整（${eventType}）を完了しました`,
      billId: result.billId,
      eventId: result.eventId,
      ...result,
    };

  } catch (error: any) {
    if (error instanceof z.ZodError) {
      throw new HttpsError('invalid-argument', '入力データが無効です', error.errors);
    }
    if (error instanceof HttpsError) {
      throw error;
    }
    logOpsError({
      message: 'updateAccounting failed',
      functionEntry: 'updateAccounting',
      cause: error,
      context: {
        op: 'updateAccounting',
        code: 'internal',
      },
    });
    throw new HttpsError('internal', '会計後調整に失敗しました', error.message);
  }
});
