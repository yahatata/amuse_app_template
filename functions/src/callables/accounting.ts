import * as admin from 'firebase-admin';
import { z } from 'zod';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

const db = admin.firestore();

// サイドゲームチップ換算率（globalConstant.dartと同期）
const SIDE_GAME_CHIP_EXCHANGE_RATE = 10.0; // サイドゲームチップ1 = 10円相当

// 支払い方法の表示名を取得するヘルパー関数
function _getPaymentMethodDisplayName(paymentMethod: string): string {
  switch (paymentMethod) {
    case 'pointA':
      return 'ポイントA';
    case 'pointB':
      return 'ポイントB';
    case 'sideGameTip':
      return 'サイドゲームチップ';
    default:
      return paymentMethod;
  }
}

// 支払い分割のスキーマ
const PaymentSplitSchema = z.object({
  method: z.enum(['cash', 'credit_card', 'electronic_money', 'pointA', 'pointB', 'sideGameTip']),
  amount: z.number().min(0, '金額は0以上である必要があります'),
});

// Zodスキーマで入力データを検証
const StartAccountingSchema = z.object({
  billId: z.string().min(1, '請求書IDは必須です'),
  // 後方互換性のため string | PaymentSplit[] の両方を許可
  paymentMethodsByCategory: z.record(
    z.union([
      z.enum(['cash', 'credit_card', 'electronic_money', 'pointA', 'pointB', 'sideGameTip']),
      z.array(PaymentSplitSchema)
    ])
  ),
});

const CompleteAccountingSchema = z.object({
  billId: z.string().min(1, '請求書IDは必須です'),
});

/**
 * 会計開始処理
 * 管理者権限を持つユーザーのみが実行可能
 */
export const startAccounting = onCall(async (request) => {
  // 認証チェック
  if (!request.auth) {
    throw new HttpsError('unauthenticated', '認証が必要です');
  }

  const adminId = request.auth.uid;

  try {
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
    const validatedData = StartAccountingSchema.parse(request.data);
    const { billId, paymentMethodsByCategory } = validatedData;

    const billRef = db.collection('todaysBills').doc(billId);

    // 請求書が存在するか確認
    const billDoc = await billRef.get();
    if (!billDoc.exists) {
      throw new HttpsError('not-found', '指定された請求書が見つかりません');
    }

    const billData = billDoc.data()!;
    const currentStatus = billData.status || 'open';

    // 既に会計済みの場合はエラー
    if (currentStatus === 'settled') {
      throw new HttpsError('failed-precondition', 'この請求書は既に会計済みです');
    }

    const userId = billData.userId;

    // カテゴリごとの金額を計算
    const categoryAmounts: Record<string, number> = {};

    // extraCost（入店料）
    const extraCosts = billData.extraCost || [];
    categoryAmounts['extraCost'] = extraCosts.reduce((sum: number, item: any) => sum + (item.price || 0), 0);

    // tournaments（トーナメント参加費）
    const tournaments = billData.tournaments || {};
    categoryAmounts['tournaments'] = Object.values(tournaments).reduce((sum: number, item: any) => sum + (item.entryFee || 0), 0);

    // items（フード・ドリンク）
    const items = billData.items || [];
    categoryAmounts['items'] = items.reduce((sum: number, item: any) => sum + ((item.price || 0) * (item.quantity || 0)), 0);

    // sideGameChip（サイドゲームチップ、action='purchase'のみ）
    const sideGameChips = billData.sideGameChip || [];
    categoryAmounts['sideGameChip'] = sideGameChips
      .filter((item: any) => item.action === 'purchase')
      .reduce((sum: number, item: any) => sum + (item.price || 0), 0);

    // ポイント/サイドゲームチップで支払う場合の残高確認と差し引き処理
    if (userId) {
      const userRef = db.collection('users').doc(userId);
      const userDoc = await userRef.get();
      
      if (!userDoc.exists) {
        throw new HttpsError('not-found', 'ユーザー情報が見つかりません');
      }

      const userData = userDoc.data()!;
      const balanceDeductions: Record<string, number> = {
        pointA: 0,
        pointB: 0,
        sideGameTip: 0,
      };

      // カテゴリごとに支払い方法を確認し、差し引く金額を計算
      for (const [category, paymentValue] of Object.entries(paymentMethodsByCategory)) {
        const categoryAmount = categoryAmounts[category] || 0;
        
        if (categoryAmount > 0) {
          // 文字列の場合（単一支払い方法）- 既存の動作
          if (typeof paymentValue === 'string') {
            if (paymentValue === 'pointA' || paymentValue === 'pointB' || paymentValue === 'sideGameTip') {
              // サイドゲームチップの場合は円→チップ枚数に換算
              if (paymentValue === 'sideGameTip') {
                const requiredChips = Math.ceil(categoryAmount / SIDE_GAME_CHIP_EXCHANGE_RATE);
                balanceDeductions[paymentValue] += requiredChips;
              } else {
                balanceDeductions[paymentValue] += categoryAmount;
              }
            }
          }
          // 配列の場合（分割支払い）- 新機能
          else if (Array.isArray(paymentValue)) {
            for (const split of paymentValue) {
              if (split.method === 'pointA' || split.method === 'pointB' || split.method === 'sideGameTip') {
                // split.amountはすでにFlutter側で換算済み
                balanceDeductions[split.method] += split.amount;
              }
            }
          }
        }
      }

      // 残高確認
      for (const [fieldName, amount] of Object.entries(balanceDeductions)) {
        if (amount > 0) {
          const currentBalance = userData[fieldName] || 0;
          if (currentBalance < amount) {
            // サイドゲームチップの場合、チップ枚数を表示
            let displayAmount = amount;
            let displayBalance = currentBalance;
            let unit = '';
            
            if (fieldName === 'sideGameTip') {
              unit = '枚';
              displayAmount = amount;
              displayBalance = currentBalance;
            } else {
              unit = '円';
              displayAmount = amount;
              displayBalance = currentBalance;
            }
            
            throw new HttpsError(
              'failed-precondition', 
              `${_getPaymentMethodDisplayName(fieldName)}の残高が不足しています。現在の残高: ${displayBalance}${unit}、必要な金額: ${displayAmount}${unit}`
            );
          }
        }
      }

      // 残高から差し引き
      const updates: Record<string, any> = {
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };
      for (const [fieldName, amount] of Object.entries(balanceDeductions)) {
        if (amount > 0) {
          updates[fieldName] = admin.firestore.FieldValue.increment(-amount);
        }
      }
      if (Object.keys(updates).length > 1) { // updatedAt以外にフィールドがある場合のみ更新
        await userRef.update(updates);
      }
    }

    // 会計開始時刻とカテゴリ別支払い方法を記録（statusは変更しない）
    await billRef.update({
      accountingStartedAt: admin.firestore.FieldValue.serverTimestamp(),
      accountingStartedBy: adminId,
      paymentMethodsByCategory: paymentMethodsByCategory,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return { 
      success: true, 
      message: '会計を開始しました',
      billId: billId,
      status: 'open'
    };
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      throw new HttpsError('invalid-argument', '入力データが無効です', error.errors);
    }
    if (error instanceof HttpsError) {
      throw error;
    }
    console.error('会計開始エラー:', error);
    throw new HttpsError('internal', '会計開始に失敗しました', error.message);
  }
});

/**
 * 会計完了処理
 * 管理者権限を持つユーザーのみが実行可能
 */
export const completeAccounting = onCall(async (request) => {
  // 認証チェック
  if (!request.auth) {
    throw new HttpsError('unauthenticated', '認証が必要です');
  }

  const adminId = request.auth.uid;

  try {
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
    const validatedData = CompleteAccountingSchema.parse(request.data);
    const { billId } = validatedData;

    const billRef = db.collection('todaysBills').doc(billId);

    // 請求書が存在するか確認
    const billDoc = await billRef.get();
    if (!billDoc.exists) {
      throw new HttpsError('not-found', '指定された請求書が見つかりません');
    }

    const billData = billDoc.data()!;
    const currentStatus = billData.status || 'open';

    // 会計開始していない場合はエラー
    if (!billData.accountingStartedAt) {
      throw new HttpsError('failed-precondition', 'この請求書はまだ会計開始されていません');
    }
    
    // 既に会計済みの場合はエラー
    if (currentStatus === 'settled') {
      throw new HttpsError('failed-precondition', 'この請求書は既に会計済みです');
    }

    // 会計履歴を作成
    const accountingHistoryRef = db.collection('accountingHistory').doc();
    await accountingHistoryRef.set({
      billId: billId,
      pokerName: billData.pokerName,
      totalPrice: billData.totalPrice,
      accountingStartedAt: billData.accountingStartedAt,
      accountingCompletedAt: admin.firestore.FieldValue.serverTimestamp(),
      accountingStartedBy: billData.accountingStartedBy,
      accountingCompletedBy: adminId,
      paymentMethodsByCategory: billData.paymentMethodsByCategory || {}, // カテゴリ別支払い方法を記録
      // カテゴリ別の詳細データも保存
      extraCost: billData.extraCost || [],
      tournaments: billData.tournaments || {},
      items: billData.items || [],
      sideGameChip: billData.sideGameChip || [],
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // 会計完了
    await billRef.update({
      status: 'settled',
      settledAt: admin.firestore.FieldValue.serverTimestamp(),
      accountingCompletedAt: admin.firestore.FieldValue.serverTimestamp(),
      accountingCompletedBy: adminId,
      accountingHistoryId: accountingHistoryRef.id,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // 退店処理
    const userId = billData.userId;
    if (userId) {
      const userRef = db.collection('users').doc(userId);
      await userRef.update({
        isStaying: false,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      // visitLogsの最新の未完了ログを更新
      const visitLogsSnapshot = await userRef.collection('visitLogs')
        .where('checkOutAt', '==', null)
        .orderBy('checkInAt', 'desc')
        .limit(1)
        .get();

      if (!visitLogsSnapshot.empty) {
        const visitLogDoc = visitLogsSnapshot.docs[0];
        const checkInAt = visitLogDoc.data().checkInAt;
        const checkOutAt = admin.firestore.Timestamp.now();
        const stayMinutes = checkInAt 
          ? Math.floor((checkOutAt.toMillis() - checkInAt.toMillis()) / 60000)
          : null;

        await visitLogDoc.ref.update({
          checkOutAt: admin.firestore.FieldValue.serverTimestamp(),
          stayMinutes: stayMinutes,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }
    }

    console.log('会計完了成功 - 戻り値を返します');
    return { 
      success: true, 
      message: '会計を完了しました',
      billId: billId,
      status: 'settled',
      accountingHistoryId: accountingHistoryRef.id
    };
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      throw new HttpsError('invalid-argument', '入力データが無効です', error.errors);
    }
    if (error instanceof HttpsError) {
      throw error;
    }
    console.error('会計完了エラー:', error);
    throw new HttpsError('internal', '会計完了に失敗しました', error.message);
  }
});
