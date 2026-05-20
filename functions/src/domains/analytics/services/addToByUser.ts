import { Transaction } from "firebase-admin/firestore";
import * as admin from "firebase-admin";
import { calculateCategoryAmounts } from "./helpers";

export interface ByUserUpdateInfo {
  collection: string;
  subcollection: string;
  documentId: string;
  userId: string;
  pokerName: string | null;
  isNewDocument: boolean;
  updatedFields: Record<string, any>;
}

export async function addToByUser(
  transaction: Transaction,
  month: string,
  businessDate: string,
  billData: any,
  paymentTotalsMap: Map<string, number>,
  byUserDoc?: FirebaseFirestore.DocumentSnapshot
): Promise<ByUserUpdateInfo | null> {
  const userId = billData.party?.userId;
  if (!userId) return null;
  
  const byUserRef = admin.firestore()
    .collection('analyticsMonthly')
    .doc(month)
    .collection('byUser')
    .doc(userId);
  
  // カテゴリ別金額を計算
  const categoryAmounts = calculateCategoryAmounts(billData);
  
  // 総売上を計算
  const grossSales = Array.from(categoryAmounts.values()).reduce((sum, amount) => sum + amount, 0);
  
  const paymentTotals = paymentTotalsMap;
  
  // pokerName を取得（値があるときだけ更新するため）
  const pokerName = billData.party?.pokerName;
  
  // 更新データを準備
  const updateData: any = {
    grossSales: admin.firestore.FieldValue.increment(grossSales),
    itemsSales: admin.firestore.FieldValue.increment(categoryAmounts.get('items') || 0),
    extraCostSales: admin.firestore.FieldValue.increment(categoryAmounts.get('extraCost') || 0),
    sideGameChipSales: admin.firestore.FieldValue.increment(categoryAmounts.get('sideGameChip') || 0),
    tournamentsSales: admin.firestore.FieldValue.increment(categoryAmounts.get('tournaments') || 0),
    orderCount: admin.firestore.FieldValue.increment(1),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
  
  // pokerName は値があるときだけ更新（既存値を空文字で上書きしない）
  if (pokerName) {
    updateData.pokerName = pokerName;
  }
  
  // dailySales更新
  updateData[`dailySales.${businessDate}`] = admin.firestore.FieldValue.increment(grossSales);
  
  // paymentTotals更新
  paymentTotals.forEach((amount, method) => {
    updateData[`paymentTotals.${method}`] = admin.firestore.FieldValue.increment(amount);
  });
  
  // 更新内容を準備（ログ用）
  const paymentTotalsLog: Record<string, string> = {};
  paymentTotals.forEach((amount, method) => {
    paymentTotalsLog[`paymentTotals.${method}`] = `increment(${amount})`;
  });
  
  const updatedFields: Record<string, any> = {
    grossSales: `increment(${grossSales})`,
    itemsSales: `increment(${categoryAmounts.get('items') || 0})`,
    extraCostSales: `increment(${categoryAmounts.get('extraCost') || 0})`,
    sideGameChipSales: `increment(${categoryAmounts.get('sideGameChip') || 0})`,
    tournamentsSales: `increment(${categoryAmounts.get('tournaments') || 0})`,
    orderCount: 'increment(1)',
    [`dailySales.${businessDate}`]: `increment(${grossSales})`,
    paymentTotals: paymentTotalsLog,
    updatedAt: 'serverTimestamp()',
  };
  
  if (pokerName) {
    updatedFields.pokerName = pokerName;
  }
  
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
      pokerName: pokerName ?? '', // pokerNameを初期化時にも保存
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }
  
  transaction.update(byUserRef, updateData);

  return {
    collection: 'analyticsMonthly',
    subcollection: 'byUser',
    documentId: `${month}/${userId}`,
    userId,
    pokerName: pokerName || null,
    isNewDocument: !byUserDoc || !byUserDoc.exists,
    updatedFields,
  };
}
