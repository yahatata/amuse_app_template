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
import { logger } from 'firebase-functions';

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

  const adminId = request.auth.uid;

  try {
    const db = getFirestore();

    // デバイス権限の確認（role: adminのみ）
    const deviceQuery = await db.collection('devices')
      .where('uid', '==', adminId)
      .where('role', '==', 'admin')
      .limit(1)
      .get();

    if (deviceQuery.empty) {
      throw new HttpsError('permission-denied', '管理者権限がありません');
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

      tx.update(billRef, updateData);
    });

    logger.info('cancelAccounting success', {
      op: 'cancelAccounting',
      billId,
      reason: reason || null,
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
