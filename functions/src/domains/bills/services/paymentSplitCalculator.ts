/**
 * 支払い分割計算のpure関数（Cloud Functions側）
 * 
 * Flutter側の payment_split_calculator.dart と同じロジックを実装します。
 * ソース・オブ・トゥルースとして、クライアント側の計算結果と照合するために使用します。
 * 
 * ⚠️ 重要: 以下の定数は lib/globalConstant.dart と同期必須
 * - SIDE_GAME_CHIP_EXCHANGE_RATE
 * - CATEGORY_PAYMENT_METHODS
 * - DEFAULT_POINT_PRIORITY
 */

// サイドゲームチップ換算率（globalConstant.dartと同期必須）
const SIDE_GAME_CHIP_EXCHANGE_RATE = 10.0;

// カテゴリ別支払い方法制限（globalConstant.dartと同期必須）
const CATEGORY_PAYMENT_METHODS: Record<string, string[]> = {
  extraCost: ['cash', 'credit_card', 'electronic_money'],
  sideGameChip: ['cash', 'credit_card', 'electronic_money'],
  items: ['cash', 'credit_card', 'electronic_money', 'pointA', 'pointB', 'sideGameChip'],
  tournaments: ['cash', 'credit_card', 'electronic_money', 'pointA', 'pointB'],
};

// ポイント使用優先順位（デフォルト値、globalConstant.dartと同期必須）
export const DEFAULT_POINT_PRIORITY = ['pointA', 'pointB', 'sideGameChip'];

// 計算結果の型定義
export interface CategoryBreakdown {
  pointsUsed: number; // ポイントで支払った額（円換算）
  baseMethodAmount: number; // 実決済手段で支払った額
}

export interface PaymentSplitResult {
  usedPoints: Record<string, number>; // 使用したポイント（円換算値、sideGameChipも含む）
  cashLikeAmount: number; // 実決済手段で支払う合計額
  categoryBreakdown: Record<string, CategoryBreakdown>; // カテゴリごとの内訳
}

interface CalculatePaymentSplitParams {
  selectedBaseMethod: 'cash' | 'credit_card' | 'electronic_money';
  bill: Record<string, number>; // カテゴリ別の金額（合計）
  balances: Record<string, number>; // ユーザーのポイント残高（pointA, pointB, sideGameChip）
  pointPriority?: string[]; // ポイント使用優先順位の配列（デフォルト: DEFAULT_POINT_PRIORITY）
  categoryPaymentMethods?: Record<string, string[]>; // カテゴリ別支払い方法（デフォルト: CATEGORY_PAYMENT_METHODS）
  sideGameChipExchangeRate?: number;
  categoryOrder?: string[];
}

/**
 * 支払い分割を計算するpure関数
 */
export function calculatePaymentSplit(params: CalculatePaymentSplitParams): PaymentSplitResult {
  const {
    selectedBaseMethod,
    bill,
    balances,
    pointPriority = DEFAULT_POINT_PRIORITY,
    categoryPaymentMethods = CATEGORY_PAYMENT_METHODS,
    sideGameChipExchangeRate = SIDE_GAME_CHIP_EXCHANGE_RATE,
    categoryOrder = ['extraCost', 'sideGameChip', 'tournaments', 'items'],
  } = params;

  // 入力検証
  if (!['cash', 'credit_card', 'electronic_money'].includes(selectedBaseMethod)) {
    throw new Error(
      'selectedBaseMethod must be one of: cash, credit_card, electronic_money',
    );
  }

  // ポイント残高のコピー（カテゴリ間で共有）
  const remainingBalances: Record<string, number> = {};
  for (const [key, value] of Object.entries(balances)) {
    remainingBalances[key] = value;
  }

  // 結果用のマップ
  const usedPoints: Record<string, number> = {};
  const categoryBreakdown: Record<string, CategoryBreakdown> = {};
  let totalCashLikeAmount = 0;

  // カテゴリごとに処理
  for (const category of categoryOrder) {
    const categoryTotal = bill[category] || 0;
    if (categoryTotal <= 0) {
      // 金額が0のカテゴリはスキップ
      categoryBreakdown[category] = {
        pointsUsed: 0,
        baseMethodAmount: 0,
      };
      continue;
    }

    // このカテゴリで使える支払い手段を取得
    const allowedMethods = categoryPaymentMethods[category] || [];

    let remainingAmount = categoryTotal;
    let categoryPointsUsed = 0;

    // pointPriorityの順にポイントを使用
    for (const pointType of pointPriority) {
      if (remainingAmount <= 0) break;

      // このポイントがこのカテゴリで使えるか確認
      if (!allowedMethods.includes(pointType)) continue;

      // 残高を取得（円換算値）
      let availableBalance = remainingBalances[pointType] || 0;

      let pointAmountToUse = 0;

      if (pointType === 'sideGameChip') {
        // sideGameChipはチップ数を円に換算
        const availableBalanceInYen = availableBalance * sideGameChipExchangeRate;

        // 使用可能なポイント額を計算（残額と残高の小さい方）
        const maxUsableInYen = availableBalanceInYen > remainingAmount
          ? remainingAmount
          : Math.floor(availableBalanceInYen);

        // 100チップ区切りで切り捨て（チップ数として）
        const maxUsableChips = Math.floor(maxUsableInYen / sideGameChipExchangeRate);
        const usableChipsRounded = Math.floor(maxUsableChips / 100) * 100; // 100チップ区切りで切り捨て

        // 円換算
        pointAmountToUse = Math.floor(usableChipsRounded * sideGameChipExchangeRate);
      } else {
        // pointA, pointBは円単位
        // 使用可能なポイント額を計算（残額と残高の小さい方）
        const maxUsable = availableBalance > remainingAmount
          ? remainingAmount
          : Math.floor(availableBalance);

        // 1000円区切りで切り捨て
        pointAmountToUse = Math.floor(maxUsable / 1000) * 1000;
      }

      if (pointAmountToUse > 0) {
        categoryPointsUsed += pointAmountToUse;
        remainingAmount -= pointAmountToUse;

        // 使用したポイントを記録（円換算値）
        usedPoints[pointType] = (usedPoints[pointType] || 0) + pointAmountToUse;

        // 残高を更新
        if (pointType === 'sideGameChip') {
          // チップ数として減算
          remainingBalances[pointType] =
            (remainingBalances[pointType] || 0) - (pointAmountToUse / sideGameChipExchangeRate);
        } else {
          // 通常のポイントは円単位で減算
          remainingBalances[pointType] =
            (remainingBalances[pointType] || 0) - pointAmountToUse;
        }
      }
    }

    // 残った額はselectedBaseMethodで支払い
    const baseMethodAmount = remainingAmount;
    totalCashLikeAmount += baseMethodAmount;

    categoryBreakdown[category] = {
      pointsUsed: categoryPointsUsed,
      baseMethodAmount: baseMethodAmount,
    };
  }

  const result: PaymentSplitResult = {
    usedPoints,
    cashLikeAmount: totalCashLikeAmount,
    categoryBreakdown,
  };

  // ガード: 計算結果の整合性チェック
  // 各カテゴリの合計（ポイント + 実決済手段）が元の金額と一致することを確認
  let totalBill = 0;
  let totalCalculated = 0;
  for (const category of categoryOrder) {
    const categoryTotal = bill[category] || 0;
    totalBill += categoryTotal;

    const breakdown = categoryBreakdown[category];
    if (breakdown) {
      totalCalculated += breakdown.pointsUsed + breakdown.baseMethodAmount;
    }
  }

  if (totalCalculated !== totalBill) {
    throw new Error(
      `計算結果の整合性エラー: 計算合計(${totalCalculated}) != 元の合計(${totalBill})`,
    );
  }

  return result;
}

