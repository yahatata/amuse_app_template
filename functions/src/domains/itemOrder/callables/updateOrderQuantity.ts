/**
 * updateOrderQuantity
 *
 * 注文管理の編集ダイアログから数量を変更するとき。
 *
 * 処理内容:
 * - billId がある場合: /bills/{billId}/items/{orderId} の quantity / totalPriceIncl を更新
 * - 常に: /orders/{orderDocId}/_TodaysOrders/{orderId} の quantity を更新（存在する場合）
 * - orders 親の onedayTotalPrice を差分調整（unitPriceIncl が取れる場合）
 */

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getCallerDeviceByUid, hasRequiredOption, isActive } from "../../../shared/devices";
import { logOpsError, logOpsSuccess } from "../../../shared/logging/logOpsError";

const EDITABLE_ORDER_STATUSES = new Set(["preparing", "in_progress"]);

function resolveOrderDocId(businessDate: string): string {
  return businessDate.replace(/-/g, "");
}

function todayBusinessDateStrings(): { orderDocId: string; dateString: string } {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  const orderDocId = `${year}${month}${day}`;
  return { orderDocId, dateString: `${year}-${month}-${day}` };
}

export const updateOrderQuantity = onCall(async (request) => {
  const db = getFirestore();

  if (!request.auth) {
    throw new HttpsError("unauthenticated", "認証が必要です");
  }

  const callerUid = request.auth.uid;
  const logContext: Record<string, unknown> = { callerUid };

  try {
    const device = await getCallerDeviceByUid(callerUid);
    if (!device || !isActive(device.status)) {
      throw new HttpsError(
        "permission-denied",
        "デバイスが見つからないか、アクティブではありません",
      );
    }

    const hasPermission =
      device.role === "admin" || hasRequiredOption(device.options, "order");
    if (!hasPermission) {
      throw new HttpsError("permission-denied", "注文操作の権限がありません");
    }

    Object.assign(logContext, { deviceId: device.id });

    const { orderId, billId, quantity, orderDocId: orderDocIdInput } =
      request.data as {
        orderId?: string;
        billId?: string;
        quantity?: number;
        orderDocId?: string;
      };

    if (!orderId || typeof orderId !== "string") {
      throw new HttpsError("invalid-argument", "orderIdが指定されていません");
    }

    if (
      typeof quantity !== "number" ||
      !Number.isInteger(quantity) ||
      quantity <= 0
    ) {
      throw new HttpsError(
        "invalid-argument",
        "quantityは1以上の整数で指定してください",
      );
    }

    let orderDocId: string;
    let dateString: string;

    if (billId && billId.trim() !== "") {
      const billSnap = await db.collection("bills").doc(billId).get();
      if (!billSnap.exists) {
        throw new HttpsError("not-found", `伝票が見つかりません: ${billId}`);
      }

      const billData = billSnap.data()!;
      const billStatus = billData.status as string | undefined;
      if (billStatus === "settled") {
        throw new HttpsError(
          "failed-precondition",
          "会計済みの伝票の注文は編集できません",
        );
      }

      const businessDate = billData.businessDate as string;
      if (!businessDate || typeof businessDate !== "string") {
        throw new HttpsError(
          "failed-precondition",
          `伝票にbusinessDateが設定されていません: ${billId}`,
        );
      }

      orderDocId = resolveOrderDocId(businessDate);
      dateString = businessDate;
    } else if (orderDocIdInput && orderDocIdInput.trim() !== "") {
      orderDocId = orderDocIdInput.trim();
      if (orderDocId.length === 8) {
        dateString = `${orderDocId.slice(0, 4)}-${orderDocId.slice(4, 6)}-${orderDocId.slice(6, 8)}`;
      } else {
        dateString = orderDocId;
      }
    } else {
      const today = todayBusinessDateStrings();
      orderDocId = today.orderDocId;
      dateString = today.dateString;
    }

    Object.assign(logContext, {
      orderId,
      billId: billId && billId.trim() !== "" ? billId : null,
      quantity,
      dateString,
      orderDocId,
    });

    await db.runTransaction(async (tx) => {
      const itemRef =
        billId && billId.trim() !== ""
          ? db.collection("bills").doc(billId).collection("items").doc(orderId)
          : null;
      const todaysOrderRef = db
        .collection("orders")
        .doc(orderDocId)
        .collection("_TodaysOrders")
        .doc(orderId);
      const ordersRef = db.collection("orders").doc(orderDocId);

      const itemSnap = itemRef ? await tx.get(itemRef) : null;
      const todaysOrderSnap = await tx.get(todaysOrderRef);
      const ordersSnap = await tx.get(ordersRef);

      if (itemRef && (!itemSnap || !itemSnap.exists)) {
        throw new HttpsError(
          "not-found",
          `注文アイテムが見つかりません: ${orderId}`,
        );
      }

      if (itemSnap?.exists) {
        const itemData = itemSnap.data()!;
        if (itemData.voided === true) {
          throw new HttpsError(
            "failed-precondition",
            "取消済みの注文は編集できません",
          );
        }
      }

      if (todaysOrderSnap.exists) {
        const todaysStatus = todaysOrderSnap.data()?.status as string | undefined;
        if (todaysStatus && !EDITABLE_ORDER_STATUSES.has(todaysStatus)) {
          throw new HttpsError(
            "failed-precondition",
            `この状態の注文は数量を変更できません: ${todaysStatus}`,
          );
        }
      }

      const itemData = itemSnap?.data();
      const todaysData = todaysOrderSnap.data();
      const oldQuantity =
        (itemData?.quantity as number | undefined) ??
        (todaysData?.quantity as number | undefined) ??
        0;
      const unitPriceIncl =
        (itemData?.unitPriceIncl as number | undefined) ??
        (todaysData?.unitPriceIncl as number | undefined) ??
        0;

      if (itemRef && itemSnap?.exists) {
        tx.update(itemRef, {
          quantity,
          totalPriceIncl: unitPriceIncl * quantity,
        });
      }

      if (todaysOrderSnap.exists) {
        tx.update(todaysOrderRef, {
          quantity,
          updatedAt: FieldValue.serverTimestamp(),
        });
      } else if (!itemRef) {
        throw new HttpsError("not-found", `注文が見つかりません: ${orderId}`);
      }

      const priceDelta = (quantity - oldQuantity) * unitPriceIncl;
      if (priceDelta !== 0 && ordersSnap.exists && unitPriceIncl > 0) {
        tx.update(ordersRef, {
          onedayTotalPrice: FieldValue.increment(priceDelta),
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
    });

    logOpsSuccess({
      message: "updateOrderQuantity 成功",
      functionEntry: "updateOrderQuantity",
      context: {
        orderId,
        billId: billId && billId.trim() !== "" ? billId : null,
        quantity,
        dateString,
        deviceId: device.id,
      },
    });

    return {
      success: true,
      data: {
        orderId,
        billId: billId && billId.trim() !== "" ? billId : null,
        quantity,
        dateString,
      },
    };
  } catch (error) {
    logOpsError({
      message: "updateOrderQuantity エラー:",
      functionEntry: "updateOrderQuantity",
      cause: error,
      context: logContext,
    });

    if (error instanceof HttpsError) {
      throw error;
    }

    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new HttpsError(
      "internal",
      errorMessage || "注文数量の更新に失敗しました",
    );
  }
});
