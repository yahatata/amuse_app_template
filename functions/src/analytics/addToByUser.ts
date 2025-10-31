import { Transaction } from "firebase-admin/firestore";
import * as admin from "firebase-admin";
import { calculateCategoryAmounts, distributePaymentMethods } from "./helpers";

export async function addToByUser(
  transaction: Transaction,
  month: string,
  businessDate: string,
  billData: any,
  byUserDoc?: FirebaseFirestore.DocumentSnapshot
): Promise<void> {
  const userId = billData.userId;
  if (!userId) return;
  
  const byUserRef = admin.firestore()
    .collection('analyticsMonthly')
    .doc(month)
    .collection('byUser')
    .doc(userId);
  
  // カテゴリ別金額を計算
  const categoryAmounts = calculateCategoryAmounts(billData);
  
  // 支払い方法の配賦
  const paymentMethodsByCategory = billData.paymentMethodsByCategory || {};
  const paymentTotals = distributePaymentMethods(paymentMethodsByCategory, categoryAmounts);
  
  // 総売上を計算
  const grossSales = Array.from(categoryAmounts.values()).reduce((sum, amount) => sum + amount, 0);
  
  // 更新データを準備
  const updateData: any = {
    grossSales: admin.firestore.FieldValue.increment(grossSales),
    itemsSales: admin.firestore.FieldValue.increment(categoryAmounts.get('items') || 0),
    extraCostSales: admin.firestore.FieldValue.increment(categoryAmounts.get('extraCost') || 0),
    sideGameChipSales: admin.firestore.FieldValue.increment(categoryAmounts.get('sideGameChip') || 0),
    tournamentsSales: admin.firestore.FieldValue.increment(categoryAmounts.get('tournaments') || 0),
    orderCount: admin.firestore.FieldValue.increment(1),
    pokerName: billData.pokerName || '', // pokerNameを保存
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
  
  // dailySales更新
  updateData[`dailySales.${businessDate}`] = admin.firestore.FieldValue.increment(grossSales);
  
  // paymentTotals更新
  paymentTotals.forEach((amount, method) => {
    updateData[`paymentTotals.${method}`] = admin.firestore.FieldValue.increment(amount);
  });
  
  // ドキュメントが存在しない場合は初期化
  if (!byUserDoc || !byUserDoc.exists) {
    transaction.set(byUserRef, {
      grossSales: 0,
      itemsSales: 0,
      extraCostSales: 0,
      sideGameChipSales: 0,
      tournamentsSales: 0,
      orderCount: 0,
      dailySales: {},
      paymentTotals: {
        cash: 0,
        credit_card: 0,
        electronic_money: 0,
        pointA: 0,
        pointB: 0,
        sideGameChip: 0,
      },
      pokerName: billData.pokerName || '', // pokerNameを初期化時にも保存
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }
  
  transaction.update(byUserRef, updateData);
}
