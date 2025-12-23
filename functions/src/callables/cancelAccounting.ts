/**
 * cancelAccounting callable
 * 
 * P1-07: pre-settlement 専用の「会計開始取り消し API」として再設計
 * 
 * - `/bills/{billId}` ベース
 * - 対象 status: `open`, `in_progress`, `settling` のみ許可
 * - `status` を `'open'` に戻す
 * - `ops.accountingStartedAt` / `ops.accountingStartedBy` をクリア
 * - `/bills/{billId}/events` には何も書き込まない（pre-settlement のキャンセルは事後イベントの対象外）
 * - 会計後のキャンセルは `updateAccounting`（新世界版）＋`postEventCancel` を通じて扱う
 */

import { getFirestore } from 'firebase-admin/firestore';
import * as admin from 'firebase-admin';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { z } from 'zod';
<<<<<<< HEAD
import { getCallerDeviceByUid, hasRequiredOption, isActive } from '../lib/devicePermissions';
=======
import { logger } from 'firebase-functions';
>>>>>>> billsmigration/draft

// 会計キャンセルのスキーマ（pre-settlement 専用）
const CancelAccountingSchema = z.object({
  billId: z.string().min(1, '請求書IDは必須です'),
  reason: z.string().optional(), // 任意
});

/**
 * 会計開始を取り消すCloud Function（pre-settlement 専用）
 * 管理者権限を持つユーザーのみが実行可能
 */
export const cancelAccounting = onCall(async (request) => {
  // 認証チェック
  if (!request.auth) {
    throw new HttpsError('unauthenticated', '認証が必要です');
  }

  const callerUid = request.auth.uid;

  try {
<<<<<<< HEAD
    // デバイス権限の確認（role: admin または options.accounting: true）
    const device = await getCallerDeviceByUid(callerUid);
    if (!device || !isActive(device.status)) {
      throw new HttpsError('permission-denied', 'デバイスが見つからないか、アクティブではありません');
    }
=======
    const db = getFirestore();

    // デバイス権限の確認（role: adminのみ）
    const deviceQuery = await db.collection('devices')
      .where('uid', '==', adminId)
      .where('role', '==', 'admin')
      .limit(1)
      .get();
>>>>>>> billsmigration/draft

    const hasPermission = device.role === 'admin' || hasRequiredOption(device.options, 'accounting');
    if (!hasPermission) {
      throw new HttpsError('permission-denied', '会計管理の権限がありません');
    }

    // 入力データの検証
    const validatedData = CancelAccountingSchema.parse(request.data);
    const { billId, reason } = validatedData;

    const billRef = db.collection('bills').doc(billId);

    // トランザクションでキャンセル処理
    await db.runTransaction(async (tx) => {
      // 1) 請求書の存在確認
      const billSnap = await tx.get(billRef);
      if (!billSnap.exists) {
        throw new HttpsError('not-found', '指定された請求書が見つかりません');
      }

      const billData = billSnap.data()!;
      const currentStatus = billData.status || 'open';

      // 2) pre-settlement 状態のみ許可（open, in_progress, settling）
      const allowedStatuses = ['open', 'in_progress', 'settling'];
      if (!allowedStatuses.includes(currentStatus)) {
        throw new HttpsError(
          'failed-precondition',
          `会計開始取り消しは pre-settlement 状態のみ可能です。現在の状態: ${currentStatus}。許可された状態: ${allowedStatuses.join(', ')}`
        );
      }

      const now = admin.firestore.Timestamp.now();

      // 3) /bills/{billId} を更新
      // - status を 'open' に戻す
      // - ops.accountingStartedAt / ops.accountingStartedBy をクリア
      // - 必要に応じて ops.accountingCanceledAt / ops.accountingCanceledBy を追加
      const updateData: Record<string, any> = {
        status: 'open',
        'ops.accountingStartedAt': admin.firestore.FieldValue.delete(),
        'ops.accountingStartedBy': admin.firestore.FieldValue.delete(),
        'ops.accountingCanceledAt': now,
        'ops.accountingCanceledBy': adminId,
        updatedAt: now,
      };

<<<<<<< HEAD
      // accountingHistoryにキャンセル記録を追加
      const accountingHistoryId = billData.accountingHistoryId;
      if (accountingHistoryId) {
        const accountingHistoryRef = db.collection('accountingHistory').doc(accountingHistoryId);
        
        const cancelRecord = {
          type: 'cancel',
          reason: reason,
          cancelledBy: callerUid,
          cancelledAt: admin.firestore.FieldValue.serverTimestamp(),
          includeRefund: includeRefund,
          refundAmount: includeRefund ? refundAmount : 0,
        };

        transaction.update(accountingHistoryRef, {
          status: 'cancelled',
          cancelRecord: cancelRecord,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }

      // ユーザーの退店状態を復元 & ポイント/サイドゲームチップを返還
      const userId = billData.userId;
      if (userId) {
        const userRef = db.collection('users').doc(userId);
        
        // ポイント/サイドゲームチップの返還処理
        const paymentMethodsByAmount = billData.paymentMethodsByAmount || {};
        const paymentMethodsByCategory = billData.paymentMethodsByCategory || {};
        const categoryAmounts: Record<string, number> = {};

        // 各カテゴリの金額を計算
        const extraCosts = billData.extraCost || [];
        categoryAmounts['extraCost'] = extraCosts.reduce((sum: number, item: any) => sum + (item.price || 0), 0);

        const tournaments = billData.tournaments || {};
        categoryAmounts['tournaments'] = Object.values(tournaments).reduce((sum: number, item: any) => sum + (item.entryFee || 0), 0);

        const items = billData.items || [];
        categoryAmounts['items'] = items.reduce((sum: number, item: any) => sum + ((item.price || 0) * (item.quantity || 0)), 0);

        const sideGameChips = billData.sideGameChip || [];
        categoryAmounts['sideGameChip'] = sideGameChips.reduce((sum: number, item: any) => sum + (item.price || 0), 0);

        // 返還する金額を計算
        const refundAmounts: Record<string, number> = {
          pointA: Math.floor(paymentMethodsByAmount.pointA ?? 0),
          pointB: Math.floor(paymentMethodsByAmount.pointB ?? 0),
          sideGameChip: Math.floor(paymentMethodsByAmount.sideGameChip ?? 0),
        };

        if (Object.keys(paymentMethodsByAmount).length === 0 && Object.keys(paymentMethodsByCategory).length > 0) {
          for (const [category, paymentValue] of Object.entries(paymentMethodsByCategory)) {
            const categoryAmount = categoryAmounts[category] || 0;
            if (categoryAmount <= 0) continue;

            if (typeof paymentValue === 'string') {
              if (paymentValue === 'pointA' || paymentValue === 'pointB') {
                refundAmounts[paymentValue] += categoryAmount;
              } else if (paymentValue === 'sideGameChip') {
                const chips = Math.ceil(categoryAmount /  SIDE_GAME_CHIP_EXCHANGE_RATE);
                refundAmounts.sideGameChip += chips;
              }
            } else if (Array.isArray(paymentValue)) {
              for (const split of paymentValue) {
                if (!split || typeof split !== 'object') continue;
                const method = split.method;
                const amount = Number(split.amount) || 0;
                if (amount <= 0) continue;

                if (method === 'pointA' || method === 'pointB') {
                  refundAmounts[method] += amount;
                } else if (method === 'sideGameChip') {
                  const chips = amount % SIDE_GAME_CHIP_EXCHANGE_RATE === 0
                    ? Math.round(amount / SIDE_GAME_CHIP_EXCHANGE_RATE)
                    : Math.ceil(amount / SIDE_GAME_CHIP_EXCHANGE_RATE);
                  refundAmounts.sideGameChip += chips;
                }
              }
            }
          }
        }

        // ユーザーの状態を更新
        const userUpdates: Record<string, any> = {
          isStaying: true,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        };

        // ポイント/サイドゲームチップを返還
        for (const [fieldName, amount] of Object.entries(refundAmounts)) {
          if (amount > 0) {
            userUpdates[fieldName] = admin.firestore.FieldValue.increment(amount);
          }
        }

        transaction.update(userRef, userUpdates);

        // visitLogsの最新の完了ログを未完了に戻す
        const visitLogsSnapshot = await userRef.collection('visitLogs')
          .where('checkOutAt', '!=', null)
          .orderBy('checkInAt', 'desc')
          .limit(1)
          .get();

        if (!visitLogsSnapshot.empty) {
          const visitLogDoc = visitLogsSnapshot.docs[0];
          transaction.update(visitLogDoc.ref, {
            checkOutAt: null,
            stayMinutes: null,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        }
      }

      // 返金処理が選択された場合
      if (includeRefund && refundAmount > 0) {
        // todaysBillsに返金情報を追加
        transaction.update(billRef, {
          refundAmount: refundAmount,
          refundedAt: admin.firestore.FieldValue.serverTimestamp(),
          refundedBy: callerUid,
        });

        // accountingHistoryに返金記録を追加
        if (accountingHistoryId) {
          const accountingHistoryRef = db.collection('accountingHistory').doc(accountingHistoryId);
          const refundRecord = {
            type: 'refund',
            amount: refundAmount,
            refundedBy: callerUid,
            refundedAt: admin.firestore.FieldValue.serverTimestamp(),
            reason: `キャンセルに伴う返金: ${reason}`,
          };

          transaction.update(accountingHistoryRef, {
            refundRecord: refundRecord,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        }
      }
=======
      tx.update(billRef, updateData);
    });

    logger.info('cancelAccounting success', {
      op: 'cancelAccounting',
      billId,
      reason: reason || null,
>>>>>>> billsmigration/draft
    });

    return {
      success: true,
      message: '会計開始を取り消しました',
      billId: billId,
    };

  } catch (error: any) {
    if (error instanceof z.ZodError) {
      throw new HttpsError('invalid-argument', '入力データが無効です', error.errors);
    }
    if (error instanceof HttpsError) {
      throw error;
    }
    logger.error('cancelAccounting failed', {
      op: 'cancelAccounting',
      code: 'internal',
      reason: error?.message || String(error),
    });
    throw new HttpsError('internal', '会計開始取り消しに失敗しました', error.message);
  }
});
