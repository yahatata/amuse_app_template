/**
 * ユーザー注文向けメニュー解決
 *
 * - 価格・名称・カテゴリは server の menuItems を正とする
 * - isArchive / isSoldOut を拒否（administrativeMenu ではなく menuItems を SSoT）
 * - category 無効フラグ・店舗全体の注文受付停止設定は現行データに存在しないため検証しない
 */

import { getFirestore } from 'firebase-admin/firestore';
import { throwOrderHttpsError } from './orderHttpsError';

export interface OrderableMenuItem {
  menuItemId: string;
  name: string;
  category: string;
  unitPriceIncl: number;
}

function isTruthyFlag(value: unknown): boolean {
  return value === true || value === 'true';
}

export async function resolveOrderableMenuItem(menuItemId: string): Promise<OrderableMenuItem> {
  if (!menuItemId || typeof menuItemId !== 'string') {
    throwOrderHttpsError('invalid-argument', 'ORDER_ITEM_NOT_FOUND', 'menuItemId is required');
  }

  const db = getFirestore();
  const snap = await db.collection('menuItems').doc(menuItemId).get();
  if (!snap.exists) {
    throwOrderHttpsError('not-found', 'ORDER_ITEM_NOT_FOUND', 'Menu item not found');
  }

  const data = snap.data()!;

  if (isTruthyFlag(data.isArchive)) {
    throwOrderHttpsError('failed-precondition', 'ORDER_ITEM_UNAVAILABLE', 'Menu item is archived');
  }
  if (isTruthyFlag(data.isSoldOut)) {
    throwOrderHttpsError('failed-precondition', 'ORDER_ITEM_SOLD_OUT', 'Menu item is sold out');
  }

  if (!data.name || typeof data.name !== 'string') {
    throwOrderHttpsError('failed-precondition', 'ORDER_PRICE_INVALID', 'Menu item name invalid');
  }
  if (!data.category || typeof data.category !== 'string') {
    throwOrderHttpsError('failed-precondition', 'ORDER_ITEM_UNAVAILABLE', 'Menu item category invalid');
  }
  if (typeof data.price !== 'number' || !Number.isFinite(data.price) || data.price < 0) {
    throwOrderHttpsError('failed-precondition', 'ORDER_PRICE_INVALID', 'Menu item price invalid');
  }

  return {
    menuItemId,
    name: data.name,
    category: data.category,
    unitPriceIncl: data.price,
  };
}
