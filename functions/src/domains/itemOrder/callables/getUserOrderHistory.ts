/**
 * getUserOrderHistory
 *
 * 認証済みユーザーの当日注文 item 履歴
 * - businessDate は storeMeta state（getCurrentBusinessDateKeyOrThrow）
 * - open / in_progress / settling / settled 等、当日の自 bill の items を返す
 * - 会計前 item も含む（注文直後の確認用）
 * - voided item も含む（UI 側で区別）
 * - 取得失敗を空配列にしない（HttpsError）
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { getCurrentBusinessDateKeyOrThrow } from '../../storeMeta/repos/getCurrentBusinessDateKeyOrThrow';
import { logOpsError, logOpsSuccess } from '../../../shared/logging/logOpsError';
import {
  FunctionCustomError,
  mapFunctionCustomErrorToHttpsCode,
} from '../../../shared/logging/functionCustomError';
import { throwOrderHttpsError, getErrorKeyFromUnknown } from '../helpers/orderHttpsError';

function toIso(value: unknown): string | null {
  if (value && typeof (value as { toDate?: () => Date }).toDate === 'function') {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }
  return null;
}

export const getUserOrderHistory = onCall(async (request) => {
  const db = getFirestore();
  const logContext: Record<string, unknown> = {};

  try {
    if (!request.auth) {
      throwOrderHttpsError('unauthenticated', 'ORDER_UNAUTHENTICATED', 'Authentication required');
    }

    const userId = request.auth.uid;
    Object.assign(logContext, { hasAuth: true });

    const businessDate = await getCurrentBusinessDateKeyOrThrow();
    Object.assign(logContext, { businessDate });

    const billsSnap = await db
      .collection('bills')
      .where('party.userId', '==', userId)
      .where('businessDate', '==', businessDate)
      .get();

    if (billsSnap.empty) {
      logOpsSuccess({
        message: 'getUserOrderHistory 成功',
        functionEntry: 'getUserOrderHistory',
        context: { businessDate, orderCount: 0 },
      });
      return {
        success: true,
        data: {
          businessDate,
          orders: [],
          totalCount: 0,
          totalAmount: 0,
        },
      };
    }

    const orders = await Promise.all(
      billsSnap.docs.map(async (doc) => {
        const d = doc.data() as Record<string, any>;
        const itemsSnap = await doc.ref.collection('items').get();

        const items = itemsSnap.docs.map((itemDoc) => {
          const it = itemDoc.data() as Record<string, any>;
          const quantity = typeof it.quantity === 'number' ? it.quantity : 0;
          const unitPrice =
            typeof it.unitPriceIncl === 'number'
              ? it.unitPriceIncl
              : typeof it.unitPrice === 'number'
                ? it.unitPrice
                : 0;
          const totalPrice =
            typeof it.totalPriceIncl === 'number'
              ? it.totalPriceIncl
              : unitPrice * quantity;
          const voided = it.voided === true;
          // status は実フィールドがある場合のみ返す（無ければ null。voided は別フィールド）
          const status = typeof it.status === 'string' ? it.status : null;

          return {
            itemId: itemDoc.id,
            menuItemId: typeof it.menuItemId === 'string' ? it.menuItemId : '',
            name: typeof it.name === 'string' ? it.name : '',
            quantity,
            unitPrice,
            totalPrice,
            status,
            voided,
            orderedAt: toIso(it.orderedAt),
            clientNonce:
              typeof it.orderClientNonce === 'string' ? it.orderClientNonce : null,
            category: typeof it.category === 'string' ? it.category : null,
          };
        });

        items.sort((a, b) => {
          const at = a.orderedAt ? new Date(a.orderedAt).getTime() : 0;
          const bt = b.orderedAt ? new Date(b.orderedAt).getTime() : 0;
          if (at !== bt) return at - bt;
          return a.itemId.localeCompare(b.itemId);
        });

        const activeTotal = items
          .filter((i) => !i.voided)
          .reduce((sum, i) => sum + (i.totalPrice || 0), 0);

        return {
          id: doc.id,
          billId: doc.id,
          items,
          itemCount: items.length,
          totalPrice: activeTotal,
          currentTable: typeof d.place?.table === 'string' ? (d.place.table as string) : null,
          currentSeat: typeof d.place?.seat === 'number' ? (d.place.seat as number) : null,
          orderDate: toIso(d.createdAt) || toIso(d.updatedAt),
          status: typeof d.status === 'string' ? d.status : 'unknown',
        };
      }),
    );

    // items が 0 の bill は履歴確認対象から除外（空伝票ノイズ防止）
    const ordersWithItems = orders.filter((o) => o.itemCount > 0);

    ordersWithItems.sort((a, b) => {
      const aTime = a.orderDate ? new Date(a.orderDate).getTime() : 0;
      const bTime = b.orderDate ? new Date(b.orderDate).getTime() : 0;
      if (aTime !== bTime) return bTime - aTime;
      return b.id.localeCompare(a.id);
    });

    const totalAmount = ordersWithItems.reduce((sum, o) => sum + (o.totalPrice || 0), 0);

    logOpsSuccess({
      message: 'getUserOrderHistory 成功',
      functionEntry: 'getUserOrderHistory',
      context: { businessDate, orderCount: ordersWithItems.length },
    });

    return {
      success: true,
      data: {
        businessDate,
        orders: ordersWithItems,
        totalCount: ordersWithItems.length,
        totalAmount,
      },
    };
  } catch (error) {
    if (error instanceof HttpsError) {
      const errorKey = getErrorKeyFromUnknown(error);
      if (errorKey === 'ORDER_UNAUTHENTICATED') {
        throw error;
      }
      const mappedKey =
        errorKey ||
        (error.code === 'failed-precondition' ? 'ORDER_HISTORY_UNAVAILABLE' : 'ORDER_HISTORY_FAILED');
      logOpsError({
        message: 'getUserOrderHistory failed',
        functionEntry: 'getUserOrderHistory',
        cause: error,
        context: { ...logContext, errorKey: mappedKey, code: error.code },
      });
      throw new HttpsError(error.code, 'Order history unavailable', {
        errorKey: mappedKey,
      });
    }

    if (error instanceof FunctionCustomError) {
      logOpsError({
        message: 'getUserOrderHistory failed',
        functionEntry: 'getUserOrderHistory',
        cause: error,
        context: { ...logContext, errorKey: error.errorKey },
      });
      throw new HttpsError(
        mapFunctionCustomErrorToHttpsCode(error.errorKey),
        'Order history unavailable',
        { errorKey: error.errorKey },
      );
    }

    logOpsError({
      message: 'getUserOrderHistory failed',
      functionEntry: 'getUserOrderHistory',
      cause: error,
      context: logContext,
    });
    throw new HttpsError('internal', 'Order history failed', {
      errorKey: 'ORDER_HISTORY_FAILED',
    });
  }
});
