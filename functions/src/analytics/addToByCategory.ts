import { Transaction } from "firebase-admin/firestore";
import * as admin from "firebase-admin";
import { calculateCategoryAmounts } from "./helpers";

export interface ByCategoryUpdateInfo {
  collection: string;
  subcollection: string;
  documentId: string;
  isNewDocument: boolean;
  updatedFields: Record<string, any>;
}

export async function addToByCategory(
  transaction: Transaction,
  month: string,
  billData: any,
  byCategoryDoc?: FirebaseFirestore.DocumentSnapshot
): Promise<ByCategoryUpdateInfo> {
  const byCategoryRef = admin.firestore()
    .collection('analyticsMonthly')
    .doc(month)
    .collection('byCategory')
    .doc('summary');
  
  // カテゴリ別金額を計算
  const categoryAmounts = calculateCategoryAmounts(billData);
  
  // 更新データを準備
  const updateData: any = {
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
  
  // totals更新（全てのカテゴリを含む）
  categoryAmounts.forEach((amount, category) => {
    updateData[`totals.${category}`] = admin.firestore.FieldValue.increment(amount);
    updateData[`orderCounts.${category}`] = admin.firestore.FieldValue.increment(1);
  });
  
  // itemSales更新（itemsSnapshot から生成）
  const itemsSnapshot = billData.itemsSnapshot || {};
  for (const [menuItemId, item] of Object.entries(itemsSnapshot)) {
    if (item && typeof item === 'object') {
      const itemData = item as { qty: number; salesIncl: number; name: string; category: string | null };
      updateData[`itemSales.${menuItemId}.qty`] = admin.firestore.FieldValue.increment(itemData.qty || 0);
      updateData[`itemSales.${menuItemId}.sales`] = admin.firestore.FieldValue.increment(itemData.salesIncl || 0);
      updateData[`itemSales.${menuItemId}.name`] = itemData.name || '';
      updateData[`itemSales.${menuItemId}.category`] = itemData.category || '';
    }
  }
  
  // itemsSnapshot._others がある場合は itemSales._others を作る
  if (itemsSnapshot._others) {
    const othersData = itemsSnapshot._others as { qty: number; salesIncl: number; name: string; category: string | null };
    updateData['itemSales._others.qty'] = admin.firestore.FieldValue.increment(othersData.qty || 0);
    updateData['itemSales._others.sales'] = admin.firestore.FieldValue.increment(othersData.salesIncl || 0);
    updateData['itemSales._others.name'] = othersData.name || 'その他';
    updateData['itemSales._others.category'] = othersData.category || null;
  }
  
  // 更新内容を準備（ログ用）
  const totalsLog: Record<string, string> = {};
  const orderCountsLog: Record<string, string> = {};
  categoryAmounts.forEach((amount, category) => {
    totalsLog[`totals.${category}`] = `increment(${amount})`;
    orderCountsLog[`orderCounts.${category}`] = 'increment(1)';
  });
  
  const itemSalesLog: Record<string, any> = {};
  for (const [menuItemId, item] of Object.entries(itemsSnapshot)) {
    if (item && typeof item === 'object') {
      const itemData = item as { qty: number; salesIncl: number; name: string; category: string | null };
      itemSalesLog[`itemSales.${menuItemId}`] = {
        qty: `increment(${itemData.qty || 0})`,
        sales: `increment(${itemData.salesIncl || 0})`,
        name: itemData.name || '',
        category: itemData.category || '',
      };
    }
  }
  
  if (itemsSnapshot._others) {
    const othersData = itemsSnapshot._others as { qty: number; salesIncl: number; name: string; category: string | null };
    itemSalesLog['itemSales._others'] = {
      qty: `increment(${othersData.qty || 0})`,
      sales: `increment(${othersData.salesIncl || 0})`,
      name: othersData.name || 'その他',
      category: othersData.category || null,
    };
  }
  
  const updatedFields: Record<string, any> = {
    totals: totalsLog,
    orderCounts: orderCountsLog,
    itemSales: itemSalesLog,
    updatedAt: 'serverTimestamp()',
  };
  
  // ドキュメントが存在しない場合は初期化
  if (!byCategoryDoc || !byCategoryDoc.exists) {
    transaction.set(byCategoryRef, {
      totals: {},
      orderCounts: {},
      itemSales: {},
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }
  
  transaction.update(byCategoryRef, updateData);

  return {
    collection: 'analyticsMonthly',
    subcollection: 'byCategory',
    documentId: `${month}/summary`,
    isNewDocument: !byCategoryDoc || !byCategoryDoc.exists,
    updatedFields,
  };
}
