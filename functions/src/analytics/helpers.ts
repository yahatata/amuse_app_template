// import * as admin from "firebase-admin";

/**
 * 営業日を計算する
 * @param createdAt 作成日時
 * @param storeCloseHour 店舗締め時間（時）
 * @returns YYYY-MM-DD形式の営業日
 */
export function resolveBusinessDate(createdAt: Date, storeCloseHour: number): string {
  // JST（UTC+9）に変換
  const jstOffset = 9 * 60; // 9時間を分に変換
  const jstDate = new Date(createdAt.getTime() + jstOffset * 60000);
  
  // 現在時刻が店舗締め時間より前の場合は前日の営業日
  if (jstDate.getHours() < storeCloseHour) {
    const businessDate = new Date(jstDate.getTime() - 24 * 60 * 60 * 1000);
    return businessDate.toISOString().split('T')[0];
  } else {
    // 店舗締め時間以降は当日の営業日
    return jstDate.toISOString().split('T')[0];
  }
}

/**
 * 支払い方法の配賦を計算する
 * @param paymentMethodsByCategory カテゴリ別支払い方法
 * @param categoryAmounts カテゴリ別金額
 * @returns 支払い方法別金額
 */
export function distributePaymentMethods(
  paymentMethodsByCategory: any,
  categoryAmounts: Map<string, number>
): Map<string, number> {
  const paymentTotals = new Map<string, number>();
  
  // デフォルトの支払い方法
  const defaultPaymentMethod = 'cash';
  
  // オブジェクト形式のpaymentMethodsByCategoryを処理
  if (paymentMethodsByCategory && typeof paymentMethodsByCategory === 'object') {
    // 各カテゴリの支払い方法を取得
    categoryAmounts.forEach((amount, category) => {
      const method = paymentMethodsByCategory[category];
      if (method && typeof method === 'string') {
        // 有効な支払い方法のリスト（sideGameChipを追加）
        const validMethods = ['cash', 'credit_card', 'electronic_money', 'pointA', 'pointB', 'sideGameTip', 'sideGameChip'];
        const validMethod = validMethods.includes(method) ? method : defaultPaymentMethod;
        
        const currentTotal = paymentTotals.get(validMethod) || 0;
        paymentTotals.set(validMethod, currentTotal + amount);
      } else {
        // カテゴリに対応する支払い方法がない場合はデフォルト
        const currentTotal = paymentTotals.get(defaultPaymentMethod) || 0;
        paymentTotals.set(defaultPaymentMethod, currentTotal + amount);
      }
    });
  } else {
    // paymentMethodsByCategoryが無効な場合はデフォルトの支払い方法で全額を配賦
    const totalAmount = Array.from(categoryAmounts.values()).reduce((sum, amount) => sum + amount, 0);
    if (totalAmount > 0) {
      paymentTotals.set(defaultPaymentMethod, totalAmount);
    }
  }
  
  return paymentTotals;
}

/**
 * トーナメント売上を計算する
 * @param tournamentData トーナメントデータ
 * @returns 合計売上
 */
export function calculateTournamentSales(tournamentData: any): number {
  if (!tournamentData || typeof tournamentData !== 'object') {
    return 0;
  }
  
  const entryFee = tournamentData.entryFee || 0;
  const reentryCount = tournamentData.reentryCount || 0;
  const reentryFee = tournamentData.reentryFee || 0;
  const addonCount = tournamentData.addonCount || 0;
  const addonFee = tournamentData.addonFee || 0;
  
  return entryFee + (reentryFee * reentryCount) + (addonFee * addonCount);
}

/**
 * 安全な加算を行う
 * @param current 現在の値
 * @param increment 加算する値
 * @returns 加算後の値
 */
export function safeAdd(current: number | undefined, increment: number): number {
  return (current || 0) + increment;
}

/**
 * 安全なMap更新を行う
 * @param map Mapオブジェクト
 * @param key キー
 * @param value 値
 */
export function safeMapUpdate(map: Map<string, number>, key: string, value: number): void {
  const current = map.get(key) || 0;
  map.set(key, current + value);
}

/**
 * カテゴリ別金額を計算する
 * @param billData todaysBillsのデータ
 * @returns カテゴリ別金額
 */
export function calculateCategoryAmounts(billData: any): Map<string, number> {
  const categoryAmounts = new Map<string, number>();
  
  // items
  const items = billData.items || [];
  let itemsTotal = 0;
  items.forEach((item: any) => {
    itemsTotal += (item.totalPrice || 0);
  });
  if (itemsTotal > 0) {
    categoryAmounts.set('items', itemsTotal);
  }
  
  // sideGameChip (action='purchase'のみ)
  const sideGameChips = billData.sideGameChip || [];
  let sideGameChipTotal = 0;
  sideGameChips.forEach((chip: any) => {
    if (chip.action === 'purchase') {
      sideGameChipTotal += (chip.totalPrice || 0);
    }
  });
  if (sideGameChipTotal > 0) {
    categoryAmounts.set('sideGameChip', sideGameChipTotal);
  }
  
  // extraCost
  const extraCosts = billData.extraCost || [];
  let extraCostTotal = 0;
  extraCosts.forEach((cost: any) => {
    extraCostTotal += (cost.price || cost.totalPrice || 0);
  });
  if (extraCostTotal > 0) {
    categoryAmounts.set('extraCost', extraCostTotal);
  }
  
  // tournaments
  const tournaments = billData.tournaments || {};
  let tournamentsTotal = 0;
  Object.values(tournaments).forEach((tournament: any) => {
    tournamentsTotal += calculateTournamentSales(tournament);
  });
  if (tournamentsTotal > 0) {
    categoryAmounts.set('tournaments', tournamentsTotal);
  }
  
  return categoryAmounts;
}
