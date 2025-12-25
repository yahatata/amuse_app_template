/**
 * メニューアイテム解決ヘルパ
 * 
 * menuItemId からメニュー定義を取得し、name/category/unitPriceIncl をサーバ確定
 * クライアント渡しの name/category/price は信用しない
 */

import { getFirestore } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';

export interface ResolvedMenuItem {
  menuItemId: string;
  name: string;
  category: string;
  unitPriceIncl: number;
}

/**
 * menuItemId からメニュー定義を解決
 * 
 * @param menuItemId メニューアイテムID
 * @returns 解決されたメニュー情報
 * @throws HttpsError invalid-argument: メニューが見つからない場合
 */
export async function resolveMenuItem(menuItemId: string): Promise<ResolvedMenuItem> {
  if (!menuItemId) {
    throw new HttpsError('invalid-argument', 'menuItemId is required');
  }

  const db = getFirestore();
  const menuItemRef = db.collection('menuItems').doc(menuItemId);
  const menuItemSnap = await menuItemRef.get();

  if (!menuItemSnap.exists) {
    throw new HttpsError('invalid-argument', `Menu item not found: ${menuItemId}`);
  }

  const menuItemData = menuItemSnap.data()!;
  
  // 必須フィールドの検証
  if (!menuItemData.name || !menuItemData.category || typeof menuItemData.price !== 'number') {
    throw new HttpsError('invalid-argument', `Invalid menu item data: ${menuItemId}`);
  }

  return {
    menuItemId,
    name: menuItemData.name as string,
    category: menuItemData.category as string,
    unitPriceIncl: menuItemData.price as number, // 既存実装では price が税込価格
  };
}

