/**
 * placeOrderByUser の items / clientNonce 正規化
 *
 * - 同一 menuItemId は quantity 合算（拒否しない）
 * - client price / name / category は無視
 */

import * as crypto from 'crypto';
import { throwOrderHttpsError } from './orderHttpsError';

/** 1行あたり数量の abuse 上限（製品上限の正本が無いため防御値。要プロダクト確認） */
export const MAX_ORDER_QUANTITY_PER_LINE = 99;

/** 一括注文の行数（合算後）abuse 上限 */
export const MAX_ORDER_LINE_ITEMS = 50;

/** clientNonce 最大長（Flutter 形式 menu_${ms}_... を十分に許容） */
export const MAX_CLIENT_NONCE_LENGTH = 128;

export interface NormalizedOrderItem {
  menuItemId: string;
  quantity: number;
}

export function validateClientNonce(raw: unknown): string {
  if (typeof raw !== 'string') {
    throwOrderHttpsError('invalid-argument', 'ORDER_NONCE_REQUIRED', 'clientNonce must be a string');
  }
  const clientNonce = raw.trim();
  if (!clientNonce) {
    throwOrderHttpsError('invalid-argument', 'ORDER_NONCE_REQUIRED', 'clientNonce is required');
  }
  if (clientNonce.length > MAX_CLIENT_NONCE_LENGTH) {
    throwOrderHttpsError('invalid-argument', 'ORDER_NONCE_REQUIRED', 'clientNonce is too long');
  }
  // Flutter: menu_${ms}_${category} / chip_... / 数字文字列 を許容
  if (!/^[A-Za-z0-9_.:-]+$/.test(clientNonce)) {
    throwOrderHttpsError('invalid-argument', 'ORDER_NONCE_REQUIRED', 'clientNonce has invalid characters');
  }
  return clientNonce;
}

export function normalizePlaceOrderByUserItems(rawItems: unknown): NormalizedOrderItem[] {
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    throwOrderHttpsError('invalid-argument', 'ORDER_QUANTITY_INVALID', 'items are required');
  }

  const merged = new Map<string, number>();

  for (const raw of rawItems) {
    if (!raw || typeof raw !== 'object') {
      throwOrderHttpsError('invalid-argument', 'ORDER_QUANTITY_INVALID', 'item is invalid');
    }
    const menuItemId = (raw as { menuItemId?: unknown }).menuItemId;
    const quantity = (raw as { quantity?: unknown }).quantity;

    if (typeof menuItemId !== 'string' || !menuItemId.trim()) {
      throwOrderHttpsError('invalid-argument', 'ORDER_ITEM_NOT_FOUND', 'menuItemId is invalid');
    }
    if (typeof quantity !== 'number' || !Number.isFinite(quantity) || !Number.isInteger(quantity)) {
      throwOrderHttpsError('invalid-argument', 'ORDER_QUANTITY_INVALID', 'quantity must be a finite integer');
    }
    if (quantity < 1) {
      throwOrderHttpsError('invalid-argument', 'ORDER_QUANTITY_INVALID', 'quantity must be >= 1');
    }
    if (quantity > MAX_ORDER_QUANTITY_PER_LINE) {
      throwOrderHttpsError('invalid-argument', 'ORDER_QUANTITY_INVALID', 'quantity exceeds max');
    }

    const id = menuItemId.trim();
    merged.set(id, (merged.get(id) || 0) + quantity);
  }

  const items: NormalizedOrderItem[] = [...merged.entries()]
    .map(([menuItemId, quantity]) => {
      if (quantity > MAX_ORDER_QUANTITY_PER_LINE) {
        throwOrderHttpsError('invalid-argument', 'ORDER_QUANTITY_INVALID', 'merged quantity exceeds max');
      }
      return { menuItemId, quantity };
    })
    .sort((a, b) => a.menuItemId.localeCompare(b.menuItemId));

  if (items.length > MAX_ORDER_LINE_ITEMS) {
    throwOrderHttpsError('invalid-argument', 'ORDER_QUANTITY_INVALID', 'too many line items');
  }

  return items;
}

export function buildOrderRequestFingerprint(items: NormalizedOrderItem[]): string {
  // items は既に menuItemId 昇順・合算済み
  const payload = items.map((i) => ({ menuItemId: i.menuItemId, quantity: i.quantity }));
  return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

export function buildItemId(billId: string, clientNonce: string, menuItemId: string): string {
  // 同一注文の再実行で同一 itemId を再利用できるよう決定的に生成
  return `pobu:${billId}:${clientNonce}:${menuItemId}`;
}

export function buildItemRequestHash(params: {
  billId: string;
  clientNonce: string;
  menuItemId: string;
  quantity: number;
}): string {
  const json = JSON.stringify({
    billId: params.billId,
    clientNonce: params.clientNonce,
    menuItemId: params.menuItemId,
    quantity: params.quantity,
  });
  return crypto.createHash('sha256').update(json).digest('hex');
}
