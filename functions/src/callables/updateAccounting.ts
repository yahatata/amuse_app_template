/**
 * updateAccounting callable（新世界版）
 * 
 * P1-07: 会計後調整APIとして再設計
 * 
 * - 旧実装（todaysBillsベース、items/extraCost/tournaments/sideGameChipを更新、totalPriceを再計算）を削除
 * - 新実装（billsベース、postEventAdjustment / postEventCancel / postEventReopen を内部で使用）に置き換え
 * - 会計後調整APIとして、/events + postEvents.totalAdjustmentsIncl などを更新
 */

import { getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { z } from 'zod';
<<<<<<< HEAD
import { getCallerDeviceByUid, hasRequiredOption, isActive } from '../lib/devicePermissions';
=======
import { logger } from 'firebase-functions';
import { postEventAdjustment, postEventCancel, postEventReopen } from '../helpers/billsApi';
>>>>>>> billsmigration/draft

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
<<<<<<< HEAD
 * 会計内容を修正するCloud Function
 * 管理者権限またはaccountingオプションを持つデバイスのみが実行可能
=======
 * 会計後調整を行うCloud Function
 * 管理者権限を持つユーザーのみが実行可能
>>>>>>> billsmigration/draft
 */
export const updateAccounting = onCall(async (request) => {
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
    const validatedData = UpdateAccountingSchema.parse(request.data);
    const { billId, idempotencyKey, eventType, eventPayload, reason } = validatedData;

    let result: any;

<<<<<<< HEAD
    // 請求書の存在確認
    const billDoc = await billRef.get();
    if (!billDoc.exists) {
      throw new HttpsError('not-found', '指定された請求書が見つかりません');
    }

    const billData = billDoc.data()!;
    const currentStatus = billData.status || 'open';

    // 会計完了済みの場合のみ修正可能
    if (currentStatus !== 'settled') {
      throw new HttpsError('failed-precondition', '会計完了済みの請求書のみ修正可能です');
    }

    // 修正前のデータを保存
    const oldData = {
      extraCost: billData.extraCost || [],
      tournaments: billData.tournaments || {},
      items: billData.items || [],
      sideGameChip: billData.sideGameChip || [],
      totalPrice: billData.totalPrice || 0,
    };

    // 新しいデータを準備
    const newData: any = {
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    // 入店料の更新
    if (extraCost !== undefined) {
      newData.extraCost = extraCost;
    }

    // トーナメント参加費の更新
    if (tournaments !== undefined) {
      newData.tournaments = tournaments;
    }

    // フード・ドリンクの更新
    if (items !== undefined) {
      newData.items = items;
    }

    // サイドゲームチップの更新
    if (sideGameChip !== undefined) {
      newData.sideGameChip = sideGameChip;
    }

    // 新しい合計金額を計算
    let newTotalPrice = 0;

    // 入店料の合計
    const finalExtraCost = extraCost !== undefined ? extraCost : oldData.extraCost;
    for (const cost of finalExtraCost) {
      newTotalPrice += cost.price;
    }

    // トーナメント参加費の合計
    const finalTournaments = tournaments !== undefined ? tournaments : oldData.tournaments;
    for (const tournamentEntry of Object.values(finalTournaments)) {
      newTotalPrice += (tournamentEntry as any).entryFee;
    }

    // フード・ドリンクの合計
    const finalItems = items !== undefined ? items : oldData.items;
    for (const item of finalItems) {
      newTotalPrice += item.price * item.quantity;
    }

    // サイドゲームチップの合計
    const finalSideGameChip = sideGameChip !== undefined ? sideGameChip : oldData.sideGameChip;
    for (const chip of finalSideGameChip) {
      newTotalPrice += chip.price;
    }

    newData.totalPrice = newTotalPrice;

    // トランザクションで更新
    await db.runTransaction(async (transaction) => {
      // todaysBillsを更新
      transaction.update(billRef, newData);

      // accountingHistoryに修正記録を追加
      const accountingHistoryId = billData.accountingHistoryId;
      if (accountingHistoryId) {
        const accountingHistoryRef = db.collection('accountingHistory').doc(accountingHistoryId);
        
        // 修正履歴を追加
        const correctionRecord = {
          type: 'correction',
          oldData: oldData,
          newData: {
            extraCost: finalExtraCost,
            tournaments: finalTournaments,
            items: finalItems,
            sideGameChip: finalSideGameChip,
            totalPrice: newTotalPrice,
          },
          reason: reason,
          correctedBy: callerUid,
          correctedAt: new Date(), // FieldValue.serverTimestamp()の代わりにDateオブジェクトを使用
        };

        transaction.update(accountingHistoryRef, {
          corrections: admin.firestore.FieldValue.arrayUnion(correctionRecord),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
=======
    if (eventType === 'adjustment') {
      // postEventAdjustment を呼び出す
      if (!eventPayload || eventPayload.sign === undefined || eventPayload.amountIncl === undefined) {
        throw new HttpsError('invalid-argument', 'adjustment の場合、sign と amountIncl は必須です');
>>>>>>> billsmigration/draft
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

    logger.info('updateAccounting success', {
      op: 'updateAccounting',
      billId,
      eventType,
      eventId: result.eventId,
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
    logger.error('updateAccounting failed', {
      op: 'updateAccounting',
      code: 'internal',
      reason: error?.message || String(error),
    });
    throw new HttpsError('internal', '会計後調整に失敗しました', error.message);
  }
});
