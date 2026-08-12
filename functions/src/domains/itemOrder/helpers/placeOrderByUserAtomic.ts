/**
 * placeOrderByUser の atomic 一括追加
 *
 * 1 Firestore transaction で:
 * - menuItems を read し最新 snapshot で検証（existence / archive / soldOut / price）
 * - orderRequests/{clientNonce}（注文単位冪等・再構築用メタ）
 * - bills/{billId}/items/* （status は書かない。正式は voided + _TodaysOrders.status）
 * - bills/{billId}/idempotency/*
 * - orders/_TodaysOrders（chip 除外、status: preparing は既存正式値）
 * - bill.updatedAt
 *
 * dualWrite（todaysBills）は既存 appendItem 同様 best-effort（同一 tx 内）。
 */

import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import * as admin from 'firebase-admin';
import { HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { getActiveBillByUser } from '../../bills/repos/getActiveBillByUser';
import { shouldDualWrite, legacyAppendItemUpdate } from '../../bills/repos/dualWrite';
import { throwOrderHttpsError } from './orderHttpsError';
import {
  buildItemId,
  buildItemRequestHash,
  buildOrderRequestFingerprint,
  type NormalizedOrderItem,
} from './normalizePlaceOrderByUserItems';

export interface PlaceOrderByUserItemResult {
  itemId: string;
  menuItemId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  /** 厨房側の注文状態。bill item には保存せず、_TodaysOrders の正式値 preparing に合わせる */
  status: string;
  orderedAt: string;
}

export interface PlaceOrderByUserSuccessData {
  billId: string;
  clientNonce: string;
  reused: boolean;
  items: PlaceOrderByUserItemResult[];
  itemsCount: number;
  totalQuantity: number;
  totalAmount: number;
}

/** orderRequest に永続化し、response 更新失敗後も再構築できるメタ */
interface OrderRequestItemSnapshot {
  itemId: string;
  menuItemId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

interface OrderableFromSnap {
  menuItemId: string;
  name: string;
  category: string;
  unitPriceIncl: number;
}

/**
 * テスト用フック（本番未使用）
 *
 * race 再現は tx 実行中の外部 write を使わない（Admin SDK で tx が無効化・lock timeout するため）。
 * 代わりに:
 * - abortAfterMenuReadOnAttempt1: 1回目は menu read 直後に中断（書込なし）
 * - mutateMenuBeforeAttempt: 各 attempt 開始前に menu を更新
 * → 2回目の tx 内 read が最新 snapshot になることを検証する。
 */
export const placeOrderByUserAtomicTestHooks: {
  abortAfterMenuReadOnAttempt1?: boolean;
  mutateMenuBeforeAttempt?: (
    attempt: number,
    db: admin.firestore.Firestore,
  ) => Promise<void>;
  failPostCommitResponseUpdate?: boolean;
  /** @internal */
  _currentAttempt?: number;
} = {};

class TestAbortAfterMenuRead extends Error {
  constructor() {
    super('test abort after menu read');
    this.name = 'TestAbortAfterMenuRead';
  }
}

function isChipCategory(category: string): boolean {
  return category === 'chip' || category === 'Chip';
}

function isTruthyFlag(value: unknown): boolean {
  return value === true || value === 'true';
}

function toIso(orderedAt: unknown): string {
  if (orderedAt && typeof (orderedAt as { toDate?: () => Date }).toDate === 'function') {
    return (orderedAt as { toDate: () => Date }).toDate().toISOString();
  }
  return new Date().toISOString();
}

/**
 * menuItems snapshot から注文可能商品を確定（transaction 内の最新 data 用）
 */
export function parseOrderableMenuItemFromData(
  menuItemId: string,
  data: admin.firestore.DocumentData | undefined,
  exists: boolean,
): OrderableFromSnap {
  if (!exists || !data) {
    throwOrderHttpsError('not-found', 'ORDER_ITEM_NOT_FOUND', 'Menu item not found');
  }
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

async function rebuildSuccessFromOrderRequest(params: {
  billRef: admin.firestore.DocumentReference;
  billId: string;
  clientNonce: string;
  orderRequestData: admin.firestore.DocumentData;
}): Promise<PlaceOrderByUserSuccessData> {
  const { billRef, billId, clientNonce, orderRequestData } = params;
  const snapshots = orderRequestData.itemSnapshots as OrderRequestItemSnapshot[] | undefined;
  const totals = orderRequestData.totals as
    | { itemsCount: number; totalQuantity: number; totalAmount: number }
    | undefined;

  if (!Array.isArray(snapshots) || snapshots.length === 0) {
    // 旧形式: response のみ
    const cached = orderRequestData.response as PlaceOrderByUserSuccessData | undefined;
    if (cached && Array.isArray(cached.items) && cached.items.length > 0) {
      return {
        ...cached,
        billId,
        clientNonce,
        reused: true,
      };
    }
    throwOrderHttpsError(
      'failed-precondition',
      'ORDER_INTERNAL_ERROR',
      'orderRequest succeeded but not reconstructable',
    );
  }

  const items: PlaceOrderByUserItemResult[] = [];
  for (const snap of snapshots) {
    const itemDoc = await billRef.collection('items').doc(snap.itemId).get();
    const d = itemDoc.data() || {};
    items.push({
      itemId: snap.itemId,
      menuItemId: snap.menuItemId,
      name: snap.name,
      quantity: snap.quantity,
      unitPrice: snap.unitPrice,
      totalPrice: snap.totalPrice,
      status: 'preparing',
      orderedAt: toIso(d.orderedAt),
    });
  }

  const totalQuantity =
    typeof totals?.totalQuantity === 'number'
      ? totals.totalQuantity
      : items.reduce((s, i) => s + i.quantity, 0);
  const totalAmount =
    typeof totals?.totalAmount === 'number'
      ? totals.totalAmount
      : items.reduce((s, i) => s + i.totalPrice, 0);
  const itemsCount =
    typeof totals?.itemsCount === 'number' ? totals.itemsCount : items.length;

  return {
    billId,
    clientNonce,
    reused: true,
    items,
    itemsCount,
    totalQuantity,
    totalAmount,
  };
}

export async function executePlaceOrderByUserAtomic(params: {
  userId: string;
  clientNonce: string;
  items: NormalizedOrderItem[];
}): Promise<PlaceOrderByUserSuccessData> {
  const { userId, clientNonce, items } = params;
  const db = getFirestore();

  let billId: string;
  let billData: admin.firestore.DocumentData;
  try {
    const active = await getActiveBillByUser(userId);
    billId = active.billId;
    billData = active.billData;
  } catch (error) {
    if (error instanceof HttpsError && error.code === 'not-found') {
      throwOrderHttpsError('not-found', 'ORDER_ACTIVE_BILL_NOT_FOUND', 'No active bill');
    }
    throw error;
  }

  const status = billData.status as string;
  if (status !== 'open' && status !== 'in_progress') {
    throwOrderHttpsError('failed-precondition', 'ORDER_BILL_NOT_OPEN', 'Bill is not open');
  }

  const businessDate = billData.businessDate as string;
  if (!businessDate || typeof businessDate !== 'string') {
    throwOrderHttpsError('failed-precondition', 'ORDER_INTERNAL_ERROR', 'bill.businessDate missing');
  }

  // itemId / fingerprint は menu に依存しない（数量・ID のみ）
  const preparedIds = items.map((it) => ({
    menuItemId: it.menuItemId,
    quantity: it.quantity,
    itemId: buildItemId(billId, clientNonce, it.menuItemId),
    requestHash: buildItemRequestHash({
      billId,
      clientNonce,
      menuItemId: it.menuItemId,
      quantity: it.quantity,
    }),
  }));

  const requestFingerprint = buildOrderRequestFingerprint(items);
  const orderDocId = businessDate.replace(/-/g, '');
  const userName = (billData.party?.pokerName as string) || '';
  const currentTable = (billData.place?.table as string) || null;
  const currentSeat = typeof billData.place?.seat === 'number' ? (billData.place.seat as number) : null;
  const dualWriteEnabled = await shouldDualWrite();
  const now = new Date();

  const billRef = db.collection('bills').doc(billId);
  const orderRequestRef = billRef.collection('orderRequests').doc(clientNonce);
  const ordersRef = db.collection('orders').doc(orderDocId);

  type CreatedMeta = {
    kind: 'created';
    itemSnapshots: OrderRequestItemSnapshot[];
    totals: { itemsCount: number; totalQuantity: number; totalAmount: number };
  };
  type TxOut =
    | { kind: 'reused'; orderRequestData: admin.firestore.DocumentData }
    | CreatedMeta;

  const useTestRetryHarness = !!(
    placeOrderByUserAtomicTestHooks.abortAfterMenuReadOnAttempt1 ||
    placeOrderByUserAtomicTestHooks.mutateMenuBeforeAttempt
  );
  const maxAttempts = useTestRetryHarness ? 5 : 1;

  let txResult: TxOut | undefined;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    placeOrderByUserAtomicTestHooks._currentAttempt = attempt;
    if (placeOrderByUserAtomicTestHooks.mutateMenuBeforeAttempt) {
      await placeOrderByUserAtomicTestHooks.mutateMenuBeforeAttempt(attempt, db);
    }
    try {
      txResult = await db.runTransaction(async (tx) => {
    // ---- reads first ----
    const orderRequestSnap = await tx.get(orderRequestRef);
    if (orderRequestSnap.exists) {
      const prev = orderRequestSnap.data() || {};
      const prevFp = prev.requestFingerprint as string | undefined;
      const prevUserId = prev.userId as string | undefined;
      if (prevUserId && prevUserId !== userId) {
        throwOrderHttpsError('failed-precondition', 'ORDER_NONCE_CONFLICT', 'clientNonce conflict');
      }
      if (prevFp && prevFp !== requestFingerprint) {
        throwOrderHttpsError('failed-precondition', 'ORDER_NONCE_CONFLICT', 'clientNonce conflict');
      }
      if (prev.status === 'succeeded') {
        // response の有無に依存せず、itemSnapshots 等から再構築（post-commit 更新失敗耐性）
        return {
          kind: 'reused' as const,
          orderRequestData: prev,
        };
      }
      throwOrderHttpsError(
        'failed-precondition',
        'ORDER_NONCE_CONFLICT',
        'orderRequest exists without succeeded status',
      );
    }

    const billSnap = await tx.get(billRef);
    if (!billSnap.exists) {
      throwOrderHttpsError('not-found', 'ORDER_ACTIVE_BILL_NOT_FOUND', 'Bill missing');
    }
    const liveBill = billSnap.data()!;
    const liveStatus = liveBill.status as string;
    if (liveStatus !== 'open' && liveStatus !== 'in_progress') {
      throwOrderHttpsError('failed-precondition', 'ORDER_BILL_NOT_OPEN', 'Bill is not open');
    }
    const livePartyUserId = (liveBill.party?.userId as string) || '';
    if (livePartyUserId !== userId) {
      throwOrderHttpsError('permission-denied', 'ORDER_ACTIVE_BILL_NOT_FOUND', 'Bill user mismatch');
    }

    // menuItems を transaction 内で read → 最新 snapshot で検証
    const liveResolved = new Map<string, OrderableFromSnap>();
    for (const line of preparedIds) {
      const menuRef = db.collection('menuItems').doc(line.menuItemId);
      const menuSnap = await tx.get(menuRef);
      const resolved = parseOrderableMenuItemFromData(
        line.menuItemId,
        menuSnap.data(),
        menuSnap.exists,
      );
      liveResolved.set(line.menuItemId, resolved);
    }

    if (
      placeOrderByUserAtomicTestHooks.abortAfterMenuReadOnAttempt1 &&
      placeOrderByUserAtomicTestHooks._currentAttempt === 1
    ) {
      throw new TestAbortAfterMenuRead();
    }

    const ordersSnap = await tx.get(ordersRef);

    type LineCtx = {
      menuItemId: string;
      quantity: number;
      itemId: string;
      requestHash: string;
      resolved: OrderableFromSnap;
      isChip: boolean;
      idemRef: admin.firestore.DocumentReference;
      idemSnap: admin.firestore.DocumentSnapshot;
      itemRef: admin.firestore.DocumentReference;
      todaysOrderRef: admin.firestore.DocumentReference | null;
      todaysOrderSnap: admin.firestore.DocumentSnapshot | null;
    };

    const lineCtx: LineCtx[] = [];
    for (const line of preparedIds) {
      const resolved = liveResolved.get(line.menuItemId)!;
      const isChip = isChipCategory(resolved.category);
      const idemRef = billRef.collection('idempotency').doc(line.itemId);
      const itemRef = billRef.collection('items').doc(line.itemId);
      const idemSnap = await tx.get(idemRef);
      let todaysOrderRef: admin.firestore.DocumentReference | null = null;
      let todaysOrderSnap: admin.firestore.DocumentSnapshot | null = null;
      if (!isChip) {
        todaysOrderRef = ordersRef.collection('_TodaysOrders').doc(line.itemId);
        todaysOrderSnap = await tx.get(todaysOrderRef);
      }
      lineCtx.push({
        ...line,
        resolved,
        isChip,
        idemRef,
        idemSnap,
        itemRef,
        todaysOrderRef,
        todaysOrderSnap,
      });
    }

    let legacyRef: admin.firestore.DocumentReference | null = null;
    let legacySnap: admin.firestore.DocumentSnapshot | null = null;
    if (dualWriteEnabled) {
      legacyRef = db.collection('todaysBills').doc(billId);
      legacySnap = await tx.get(legacyRef);
    }

    // ---- writes（価格・名称は liveResolved のみ使用）----
    if (!ordersSnap.exists) {
      const hasNonChip = lineCtx.some((p) => !p.isChip);
      if (hasNonChip) {
        tx.set(ordersRef, {
          date: businessDate,
          onedayOrderQuantity: 0,
          onedayTotalPrice: 0,
          createdAt: now,
          updatedAt: now,
        });
      }
    }

    let newOrderCount = 0;
    let newOrderTotal = 0;
    const itemSnapshots: OrderRequestItemSnapshot[] = [];

    for (const entry of lineCtx) {
      const { resolved, quantity, itemId, requestHash, idemRef, idemSnap, itemRef, todaysOrderRef, todaysOrderSnap, isChip, menuItemId } = entry;

      if (idemSnap.exists) {
        const prevHash = idemSnap.data()?.requestHash;
        if (prevHash && prevHash !== requestHash) {
          throwOrderHttpsError('failed-precondition', 'ORDER_NONCE_CONFLICT', 'item idempotency mismatch');
        }
        itemSnapshots.push({
          itemId,
          menuItemId,
          name: resolved.name,
          quantity,
          unitPrice: resolved.unitPriceIncl,
          totalPrice: resolved.unitPriceIncl * quantity,
        });
        continue;
      }

      // bill items: appendItemCore と同様 status は持たせない（voided が正式）
      tx.set(itemRef, {
        menuItemId: resolved.menuItemId,
        category: resolved.category,
        name: resolved.name,
        unitPriceIncl: resolved.unitPriceIncl,
        quantity,
        totalPriceIncl: resolved.unitPriceIncl * quantity,
        orderedAt: FieldValue.serverTimestamp(),
        voided: false,
        orderClientNonce: clientNonce,
      });

      tx.set(idemRef, {
        requestHash,
        createdAt: FieldValue.serverTimestamp(),
        itemId,
        orderClientNonce: clientNonce,
      });

      if (!isChip && todaysOrderRef) {
        const isNewOrder = !todaysOrderSnap?.exists;
        tx.set(
          todaysOrderRef,
          {
            orderDocId,
            billId,
            userId,
            userName,
            menuItemId: resolved.menuItemId,
            name: resolved.name,
            category: resolved.category,
            quantity,
            unitPriceIncl: resolved.unitPriceIncl,
            status: 'preparing',
            orderedAt: FieldValue.serverTimestamp(),
            currentTable,
            currentSeat,
            orderClientNonce: clientNonce,
          },
          { merge: true },
        );
        if (isNewOrder) {
          newOrderCount += 1;
          newOrderTotal += resolved.unitPriceIncl * quantity;
        }
      }

      if (dualWriteEnabled && legacyRef && legacySnap?.exists) {
        try {
          await legacyAppendItemUpdate(tx, db, {
            billId,
            legacyItem: {
              orderId: itemId,
              menuItemId: resolved.menuItemId,
              category: resolved.category,
              name: resolved.name,
              quantity,
            },
          });
        } catch (dualErr: any) {
          logger.warn('dualWrite appendItem (placeOrderByUser) failed', {
            billId,
            itemId,
            reason: dualErr?.message || String(dualErr),
          });
        }
      }

      itemSnapshots.push({
        itemId,
        menuItemId,
        name: resolved.name,
        quantity,
        unitPrice: resolved.unitPriceIncl,
        totalPrice: resolved.unitPriceIncl * quantity,
      });
    }

    if (newOrderCount > 0 || newOrderTotal > 0) {
      tx.set(
        ordersRef,
        {
          date: businessDate,
          updatedAt: now,
        },
        { merge: true },
      );
      tx.update(ordersRef, {
        onedayOrderQuantity: FieldValue.increment(newOrderCount),
        onedayTotalPrice: FieldValue.increment(newOrderTotal),
        date: businessDate,
        updatedAt: now,
      });
    }

    tx.update(billRef, {
      updatedAt: FieldValue.serverTimestamp(),
    });

    const totals = {
      itemsCount: itemSnapshots.length,
      totalQuantity: itemSnapshots.reduce((s, i) => s + i.quantity, 0),
      totalAmount: itemSnapshots.reduce((s, i) => s + i.totalPrice, 0),
    };

    // response 完全形に依存しない再構築用メタを同一 tx で保存
    tx.set(orderRequestRef, {
      userId,
      billId,
      clientNonce,
      requestFingerprint,
      status: 'succeeded',
      normalizedItems: items,
      itemIds: itemSnapshots.map((s) => s.itemId),
      itemSnapshots,
      totals,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    return {
      kind: 'created' as const,
      itemSnapshots,
      totals,
    };
      });
      break;
    } catch (e) {
      if (e instanceof TestAbortAfterMenuRead && attempt < maxAttempts) {
        continue;
      }
      throw e;
    }
  }

  if (!txResult) {
    throwOrderHttpsError('internal', 'ORDER_INTERNAL_ERROR', 'transaction did not complete');
  }
  const committed: TxOut = txResult;

  if (committed.kind === 'reused') {
    return rebuildSuccessFromOrderRequest({
      billRef,
      billId,
      clientNonce,
      orderRequestData: committed.orderRequestData,
    });
  }

  // commit 成功後: orderedAt 補完（冪等性は itemSnapshots/totals に依存し、この更新の成否に依存しない）
  const itemsOut: PlaceOrderByUserItemResult[] = [];
  for (const snap of committed.itemSnapshots) {
    const itemSnap = await billRef.collection('items').doc(snap.itemId).get();
    const d = itemSnap.data() || {};
    itemsOut.push({
      itemId: snap.itemId,
      menuItemId: snap.menuItemId,
      name: snap.name,
      quantity: snap.quantity,
      unitPrice: snap.unitPrice,
      totalPrice: snap.totalPrice,
      status: 'preparing',
      orderedAt: toIso(d.orderedAt),
    });
  }

  const finalData: PlaceOrderByUserSuccessData = {
    billId,
    clientNonce,
    reused: false,
    items: itemsOut,
    itemsCount: committed.totals.itemsCount,
    totalQuantity: committed.totals.totalQuantity,
    totalAmount: committed.totals.totalAmount,
  };

  try {
    if (placeOrderByUserAtomicTestHooks.failPostCommitResponseUpdate) {
      throw new Error('forced post-commit response update failure');
    }
    await orderRequestRef.set(
      {
        response: finalData,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  } catch (e) {
    logger.warn('placeOrderByUser orderRequest response refresh failed', {
      billId,
      reason: e instanceof Error ? e.message : String(e),
    });
  }

  return finalData;
}
