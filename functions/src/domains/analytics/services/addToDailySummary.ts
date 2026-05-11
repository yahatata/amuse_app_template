import { Transaction } from "firebase-admin/firestore";
import * as admin from "firebase-admin";
import { calculateCategoryAmounts } from "./helpers";

export interface DailySummaryUpdateInfo {
  collection: string;
  subcollection: string;
  documentId: string;
  isNewDocument: boolean;
  updatedFields: Record<string, any>;
}

export async function addToDailySummary(
  transaction: Transaction,
  month: string,
  businessDate: string,
  billData: any,
  paymentTotalsMap: Map<string, number>,
  dailyDoc?: FirebaseFirestore.DocumentSnapshot
): Promise<DailySummaryUpdateInfo> {
  const dailyRef = admin.firestore()
    .collection('analyticsMonthly')
    .doc(month)
    .collection('days')
    .doc(businessDate);
  
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
  
  // byCategory更新（全てのカテゴリを含む）
  categoryAmounts.forEach((amount, category) => {
    updateData[`byCategory.${category}`] = admin.firestore.FieldValue.increment(amount);
  });
  
  // byPaymentMethod更新
  paymentTotals.forEach((amount, method) => {
    updateData[`byPaymentMethod.${method}`] = admin.firestore.FieldValue.increment(amount);
  });
  
  // 更新内容を準備（ログ用）
  const byCategoryLog: Record<string, string> = {};
  categoryAmounts.forEach((amount, category) => {
    byCategoryLog[`byCategory.${category}`] = `increment(${amount})`;
  });
  
  const byPaymentMethodLog: Record<string, string> = {};
  paymentTotals.forEach((amount, method) => {
    byPaymentMethodLog[`byPaymentMethod.${method}`] = `increment(${amount})`;
  });
  
  const updatedFields: Record<string, any> = {
    itemsSales: `increment(${categoryAmounts.get('items') || 0})`,
    sideGameChipSales: `increment(${categoryAmounts.get('sideGameChip') || 0})`,
    extraCostSales: `increment(${categoryAmounts.get('extraCost') || 0})`,
    tournamentsSales: `increment(${categoryAmounts.get('tournaments') || 0})`,
    grossSales: `increment(${grossSales})`,
    orderCount: 'increment(1)',
    byCategory: byCategoryLog,
    byPaymentMethod: byPaymentMethodLog,
    updatedAt: 'serverTimestamp()',
  };
  
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

  return {
    collection: 'analyticsMonthly',
    subcollection: 'days',
    documentId: `${month}/${businessDate}`,
    isNewDocument: !dailyDoc || !dailyDoc.exists,
    updatedFields,
  };
}
