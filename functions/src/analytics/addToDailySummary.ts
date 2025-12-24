import { Transaction } from "firebase-admin/firestore";
import * as admin from "firebase-admin";
import { calculateCategoryAmounts, distributePaymentMethods } from "./helpers";

export async function addToDailySummary(
  transaction: Transaction,
  month: string,
  businessDate: string,
  billData: any,
  dailyDoc?: FirebaseFirestore.DocumentSnapshot
): Promise<void> {
  const dailyRef = admin.firestore()
    .collection('analyticsMonthly')
    .doc(month)
    .collection('days')
    .doc(businessDate);
  
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
  
  // byCategory更新（全てのカテゴリを含む）
  categoryAmounts.forEach((amount, category) => {
    updateData[`byCategory.${category}`] = admin.firestore.FieldValue.increment(amount);
  });
  
  // byPaymentMethod更新
  paymentTotals.forEach((amount, method) => {
    updateData[`byPaymentMethod.${method}`] = admin.firestore.FieldValue.increment(amount);
  });
  
  // ドキュメントが存在しない場合は初期化
  if (!dailyDoc || !dailyDoc.exists) {
    transaction.set(dailyRef, {
      itemsSales: 0,
      sideGameChipSales: 0,
      extraCostSales: 0,
      tournamentsSales: 0,
      grossSales: 0,
      orderCount: 0,
      byCategory: {},
      byPaymentMethod: {},
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }
  
  transaction.update(dailyRef, updateData);
}
