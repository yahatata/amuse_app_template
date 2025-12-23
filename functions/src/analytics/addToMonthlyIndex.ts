import { Transaction } from "firebase-admin/firestore";
import * as admin from "firebase-admin";
import { calculateCategoryAmounts, distributePaymentMethods } from "./helpers";

export async function addToMonthlyIndex(
  transaction: Transaction,
  month: string,
  billData: any,
  businessDate: string,
  monthlyDoc?: FirebaseFirestore.DocumentSnapshot
): Promise<void> {
  const monthlyRef = admin.firestore().collection('analyticsMonthly').doc(month);
  
  // カテゴリ別金額を計算（tournamentsも含む）
  const categoryAmounts = calculateCategoryAmounts(billData);
  
  // 総売上を計算
  const grossSales = Array.from(categoryAmounts.values()).reduce((sum, amount) => sum + amount, 0);
  
  // 支払い方法の配賦（paymentTotals を直接使用、fallback用に総額を渡す）
  const paymentTotals = distributePaymentMethods(billData.paymentTotals, {
    fallbackCashAmount: billData.amounts?.grandTotalRounded || grossSales,
    validMethods: ['cash', 'credit_card', 'electronic_money', 'pointA', 'pointB', 'sideGameChip'],
  });
  
  // 更新データを準備
  const updateData: any = {
    itemsSales: admin.firestore.FieldValue.increment(categoryAmounts.get('items') || 0),
    sideGameChipSales: admin.firestore.FieldValue.increment(categoryAmounts.get('sideGameChip') || 0),
    extraCostSales: admin.firestore.FieldValue.increment(categoryAmounts.get('extraCost') || 0),
    tournamentsSales: admin.firestore.FieldValue.increment(categoryAmounts.get('tournaments') || 0),
    grossSales: admin.firestore.FieldValue.increment(grossSales),
    orderCount: admin.firestore.FieldValue.increment(1),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
  
  // dailySales更新
  updateData[`dailySales.${businessDate}`] = admin.firestore.FieldValue.increment(grossSales);
  
  // paymentTotals更新
  paymentTotals.forEach((amount, method) => {
    updateData[`paymentTotals.${method}`] = admin.firestore.FieldValue.increment(amount);
  });
  
  // ドキュメントが存在しない場合は初期化
  if (!monthlyDoc || !monthlyDoc.exists) {
    transaction.set(monthlyRef, {
      itemsSales: 0,
      sideGameChipSales: 0,
      extraCostSales: 0,
      tournamentsSales: 0,
      grossSales: 0,
      orderCount: 0,
      avgOrderValue: 0,
      dailySales: {},
      paymentTotals: {},
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }
  
  transaction.update(monthlyRef, updateData);
}
