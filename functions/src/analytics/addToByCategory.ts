import { Transaction } from "firebase-admin/firestore";
import * as admin from "firebase-admin";
import { calculateCategoryAmounts } from "./helpers";

export async function addToByCategory(
  transaction: Transaction,
  month: string,
  billData: any,
  byCategoryDoc?: FirebaseFirestore.DocumentSnapshot
): Promise<void> {
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
  
  // itemSales更新（itemsのみ）
  const items = billData.items || [];
  items.forEach((item: any) => {
    const menuItemId = item.menuItemId;
    if (menuItemId) {
      const itemData = {
        qty: admin.firestore.FieldValue.increment(item.quantity || 0),
        sales: admin.firestore.FieldValue.increment(item.totalPrice || 0),
        name: item.name || '',
        category: item.category || '',
      };
      
      updateData[`itemSales.${menuItemId}.qty`] = itemData.qty;
      updateData[`itemSales.${menuItemId}.sales`] = itemData.sales;
      updateData[`itemSales.${menuItemId}.name`] = item.name || '';
      updateData[`itemSales.${menuItemId}.category`] = item.category || '';
    }
  });
  
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
}
