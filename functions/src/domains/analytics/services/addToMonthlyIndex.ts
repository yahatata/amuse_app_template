import { Transaction } from "firebase-admin/firestore";
import * as admin from "firebase-admin";
import { calculateCategoryAmounts } from "./helpers";

export interface MonthlyIndexUpdateInfo {
  collection: string;
  documentId: string;
  isNewDocument: boolean;
  updatedFields: Record<string, any>;
}

export async function addToMonthlyIndex(
  transaction: Transaction,
  month: string,
  billData: any,
  businessDate: string,
  paymentTotalsMap: Map<string, number>,
  monthlyDoc?: FirebaseFirestore.DocumentSnapshot
): Promise<MonthlyIndexUpdateInfo> {
  const monthlyRef = admin.firestore().collection('analyticsMonthly').doc(month);
  
  // カテゴリ別金額を計算（tournamentsも含む）
  const categoryAmounts = calculateCategoryAmounts(billData);
  
  // 総売上を計算
  const grossSales = Array.from(categoryAmounts.values()).reduce((sum, amount) => sum + amount, 0);
  
  const paymentTotals = paymentTotalsMap;
  
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
  
  // 更新内容を準備（ログ用）
  const updatedFields: Record<string, any> = {
    itemsSales: `increment(${categoryAmounts.get('items') || 0})`,
    sideGameChipSales: `increment(${categoryAmounts.get('sideGameChip') || 0})`,
    extraCostSales: `increment(${categoryAmounts.get('extraCost') || 0})`,
    tournamentsSales: `increment(${categoryAmounts.get('tournaments') || 0})`,
    grossSales: `increment(${grossSales})`,
    orderCount: 'increment(1)',
    [`dailySales.${businessDate}`]: `increment(${grossSales})`,
    updatedAt: 'serverTimestamp()',
  };
  
  // paymentTotals の更新内容を追加
  const paymentTotalsLog: Record<string, string> = {};
  paymentTotals.forEach((amount, method) => {
    paymentTotalsLog[`paymentTotals.${method}`] = `increment(${amount})`;
  });
  updatedFields.paymentTotals = paymentTotalsLog;
  
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

  return {
    collection: 'analyticsMonthly',
    documentId: month,
    isNewDocument: !monthlyDoc || !monthlyDoc.exists,
    updatedFields,
  };
}
