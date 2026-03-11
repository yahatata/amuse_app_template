import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { z } from 'zod';
import { getFirestore } from 'firebase-admin/firestore';
import { calculatePaymentSplit } from '../services/paymentSplitCalculator';
import { getStoreConfig } from '../../../shared/config/configLoader';
import { DEFAULT_POINT_PRIORITY } from '../../../shared/config/defaults';

// 入力スキーマ
const VerifyPaymentSplitSchema = z.object({
  billId: z.string().min(1, '請求書IDは必須です'),
  clientResult: z.object({
    usedPoints: z.record(z.number()),
    cashLikeAmount: z.number(),
    categoryBreakdown: z.record(
      z.object({
        pointsUsed: z.number(),
        baseMethodAmount: z.number(),
      })
    ),
  }),
  selectedBaseMethod: z.enum(['cash', 'credit_card', 'electronic_money']),
  pointPriority: z.array(z.string()).optional(), // デフォルト値を使用可能
});

/**
 * 支払い分割計算の照合
 * クライアント側の計算結果を検証し、不一致の場合はサーバー側の結果を返す
 */
export const verifyPaymentSplit = onCall(async (request) => {
  // 認証チェック
  if (!request.auth) {
    throw new HttpsError('unauthenticated', '認証が必要です');
  }

  try {
    const db = getFirestore();
    
    // 入力検証
    const validatedData = VerifyPaymentSplitSchema.parse(request.data);
    const config = await getStoreConfig();
    const { billId, clientResult, selectedBaseMethod } = validatedData;
    const pointPriority = validatedData.pointPriority ?? config.billing?.paymentPolicy?.pointPriority ?? DEFAULT_POINT_PRIORITY;

    // 請求書を取得
    const billRef = db.collection('bills').doc(billId);
    const billDoc = await billRef.get();

    if (!billDoc.exists) {
      throw new HttpsError('not-found', '指定された請求書が見つかりません');
    }

    const billData = billDoc.data()!;
    const userId = billData.party?.userId;

    if (!userId) {
      throw new HttpsError('invalid-argument', 'ユーザーIDが見つかりません');
    }

    // ユーザーの残高を取得
    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      throw new HttpsError('not-found', 'ユーザー情報が見つかりません');
    }

    const userData = userDoc.data()!;
    const balances: Record<string, number> = {
      pointA: userData.pointA || 0,
      pointB: userData.pointB || 0,
      sideGameChip: userData.sideGameChip || 0,
    };

    // カテゴリごとの金額を計算（Bills スキーマ準拠）
    const categoryAmounts: Record<string, number> = {};

    // extraCost → extras サブコレクションから取得
    const extrasSnap = await billRef.collection('extras').get();
    categoryAmounts['extraCost'] = extrasSnap.docs.reduce(
      (sum, doc) => sum + (doc.data().amountIncl || 0),
      0
    );

    // items → items サブコレクションから取得
    const itemsSnap = await billRef.collection('items').get();
    categoryAmounts['items'] = itemsSnap.docs
      .filter((doc) => {
        const data = doc.data();
        // voided: true のアイテムは算出対象外
        return data.voided !== true;
      })
      .reduce(
        (sum, doc) => sum + (doc.data().totalPriceIncl || 0),
        0
      );

    // sideGameChip → sideGameChips サブコレクションから取得（action='purchase'のみ）
    const sideGameChipsSnap = await billRef.collection('sideGameChips').get();
    categoryAmounts['sideGameChip'] = sideGameChipsSnap.docs
      .filter(doc => doc.data().action === 'purchase')
      .reduce((sum, doc) => sum + (doc.data().amountIncl || 0), 0);

    // tournaments → tournaments サブコレクションから取得
    const tournamentsSnap = await billRef.collection('tournaments').get();
    categoryAmounts['tournaments'] = tournamentsSnap.docs.reduce((sum, doc) => {
      const data = doc.data();
      return sum + 
        (data.entryFeeIncl || 0) * (data.entryCount || 0) +
        (data.reentryFeeIncl || 0) * (data.reentryCount || 0) +
        (data.addonFeeIncl || 0) * (data.addonCount || 0);
    }, 0);

    // キー名（"extraCost","tournaments","items","sideGameChip"）は従来のまま

    // サーバー側で計算を実行
    const serverResult = calculatePaymentSplit({
      selectedBaseMethod,
      bill: categoryAmounts,
      balances,
      pointPriority,
      categoryPaymentMethods: config.billing?.paymentPolicy?.categoryPaymentMethods,
      sideGameChipExchangeRate: config.billing?.sideGameChipRate,
    });

    // クライアント側とサーバー側の結果を比較
    const isMatch = compareResults(clientResult, serverResult);

    if (isMatch) {
      // 完全一致の場合はクライアント側の結果をそのまま返す
      return {
        success: true,
        verified: true,
        result: clientResult,
        message: '計算結果が一致しました',
      };
    } else {
      // 不一致の場合はサーバー側の結果を正として返す
      console.warn('支払い分割計算の不一致を検出', {
        billId,
        clientResult,
        serverResult,
      });

      return {
        success: true,
        verified: false,
        result: serverResult,
        message: '計算結果が不一致でした。サーバー側の計算結果を使用します。',
        differences: {
          clientUsedPoints: clientResult.usedPoints,
          serverUsedPoints: serverResult.usedPoints,
          clientCashLikeAmount: clientResult.cashLikeAmount,
          serverCashLikeAmount: serverResult.cashLikeAmount,
        },
      };
    }
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      throw new HttpsError('invalid-argument', '入力データが無効です', error.errors);
    }
    if (error instanceof HttpsError) {
      throw error;
    }
    console.error('支払い分割照合エラー:', error);
    throw new HttpsError('internal', '支払い分割照合に失敗しました', error.message);
  }
});

/**
 * クライアント側とサーバー側の計算結果を比較
 */
function compareResults(
  client: typeof VerifyPaymentSplitSchema._type.clientResult,
  server: ReturnType<typeof calculatePaymentSplit>
): boolean {
  // usedPointsの比較
  const clientPoints = client.usedPoints;
  const serverPoints = server.usedPoints;

  // キーの集合が同じか確認
  const clientKeys = new Set(Object.keys(clientPoints));
  const serverKeys = new Set(Object.keys(serverPoints));

  if (clientKeys.size !== serverKeys.size) {
    return false;
  }

  for (const key of clientKeys) {
    if (!serverKeys.has(key)) {
      return false;
    }
    // 数値の比較（浮動小数点誤差を考慮して1円以内の差は許容）
    if (Math.abs(clientPoints[key] - serverPoints[key]) > 1) {
      return false;
    }
  }

  // cashLikeAmountの比較
  if (Math.abs(client.cashLikeAmount - server.cashLikeAmount) > 1) {
    return false;
  }

  // categoryBreakdownの比較
  const clientBreakdown = client.categoryBreakdown;
  const serverBreakdown = server.categoryBreakdown;

  const clientCategoryKeys = new Set(Object.keys(clientBreakdown));
  const serverCategoryKeys = new Set(Object.keys(serverBreakdown));

  if (clientCategoryKeys.size !== serverCategoryKeys.size) {
    return false;
  }

  for (const category of clientCategoryKeys) {
    if (!serverCategoryKeys.has(category)) {
      return false;
    }

    const clientCat = clientBreakdown[category];
    const serverCat = serverBreakdown[category];

    if (
      Math.abs(clientCat.pointsUsed - serverCat.pointsUsed) > 1 ||
      Math.abs(clientCat.baseMethodAmount - serverCat.baseMethodAmount) > 1
    ) {
      return false;
    }
  }

  return true;
}

