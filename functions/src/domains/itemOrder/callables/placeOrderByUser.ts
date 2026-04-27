/**
 * placeOrderByUser
 * 
 * LIFF側のユーザーが注文確定ボタンを押下したとき
 * 
 * 新スキーマ対応:
 * - getActiveBillByUser で billId を取得
 * - appendItem で /bills/{billId}/items/{itemId} に追加（複数アイテム対応）
 * - orders/_TodaysOrders に記録（提供動線専用、Chips除外）
 */

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import * as admin from "firebase-admin";
import { getActiveBillByUser } from "../../bills/repos/getActiveBillByUser";
import { appendItem } from "../../bills/repos/appendItem";
import { resolveMenuItem } from "../../bills/repos/resolveMenuItem";
import { logOpsError, logOpsSuccess } from "../../../shared/logging/logOpsError";
import { FunctionCustomError, mapFunctionCustomErrorToHttpsCode } from "../../../shared/logging/functionCustomError";

export const placeOrderByUser = onCall(async (request) => {
  const db = getFirestore();

  try {
    // 認証必須
    if (!request.auth) {
      throw new HttpsError("permission-denied", "認証が必要です");
    }

    const userId = request.auth.uid;

    // items[] or item 単一
    let items: Array<{ menuItemId: string; quantity: number }> = [];
    if (request.data?.items && Array.isArray(request.data.items)) {
      items = request.data.items;
    } else if (request.data?.item) {
      items = [request.data.item];
    }

    if (!items.length) {
      throw new HttpsError("invalid-argument", "アイテムが指定されていません");
    }

    for (const it of items) {
      if (!it?.menuItemId || typeof it.quantity !== "number" || it.quantity <= 0) {
        throw new HttpsError("invalid-argument", "アイテム情報が不正です");
      }
    }

    const sessionNonce: string = request.data?.clientNonce || `session_${Date.now()}`;

    // 1) bill 取得
    const { billId, billData } = await getActiveBillByUser(userId);

    // 2) appendItem を順次実行（種類ごとに clientNonce を変える）
    const appendResults: Array<{ itemId: string; orderedAt: string; reused: boolean; menuItemId: string; quantity: number; }> = [];
    for (let index = 0; index < items.length; index++) {
      const it = items[index];
      const clientNonce = `${sessionNonce}-${index}`;
      const idempotencyKey = `appendItem:${billId}:${clientNonce}`;

      const res = await appendItem({
        billId,
        item: { menuItemId: it.menuItemId, quantity: it.quantity, clientNonce },
        idempotencyKey,
      });

      appendResults.push({
        itemId: res.itemId,
        orderedAt: res.orderedAt,
        reused: !!res.diagnostics?.reused,
        menuItemId: it.menuItemId,
        quantity: it.quantity,
      });
    }

    // 3) 非 chip のみ _TodaysOrders を作成（docId=itemId）し、親集計は新規分だけ加算
    // calcBusinessDate は使用しない（SSoTは bill.businessDate）
    const now = new Date();
    const biz = billData.businessDate as string;  // "2025-11-15" (SSoT)
    const orderDocId = biz.replace(/-/g, "");     // "20251115"
    const dateString = biz;                       // "2025-11-15"

    // 事前に menu 情報を解決（親集計に単価を使うため）
    const resolvedCache = new Map<string, { name: string; category: string; unitPriceIncl: number }>();
    for (const ar of appendResults) {
      if (!resolvedCache.has(ar.menuItemId)) {
        const r = await resolveMenuItem(ar.menuItemId);
        resolvedCache.set(ar.menuItemId, { name: r.name, category: r.category, unitPriceIncl: r.unitPriceIncl });
      }
    }

    await db.runTransaction(async (tx) => {
      const ordersRef = db.collection("orders").doc(orderDocId);
      // すべての読み取りを先に実行
      const ordersSnap = await tx.get(ordersRef);

      // 各 _TodaysOrders の読み取りを先に実行
      const todaysOrderSnaps: Array<{ ref: admin.firestore.DocumentReference; isNew: boolean; ar: typeof appendResults[0]; r: { name: string; category: string; unitPriceIncl: number } }> = [];
      let newCount = 0;
      let newTotal = 0;

      for (const ar of appendResults) {
        const r = resolvedCache.get(ar.menuItemId)!;
        // chip は除外
        if (r.category === "chip" || r.category === "Chip") continue;

        const todaysOrderRef = ordersRef.collection("_TodaysOrders").doc(ar.itemId);
        const todaysOrderSnap = await tx.get(todaysOrderRef);
        const isNew = !todaysOrderSnap.exists;
        todaysOrderSnaps.push({ ref: todaysOrderRef, isNew, ar, r });

        // 新規分のみ集計（読み取りループで計算）
        if (isNew) {
          newCount += 1;
          newTotal += r.unitPriceIncl * ar.quantity;
        }
      }

      // すべての書き込みを読み取りの後に実行
      if (!ordersSnap.exists) {
        tx.set(ordersRef, {
          date: dateString,
          onedayOrderQuantity: 0,
          onedayTotalPrice: 0,
          createdAt: now,
          updatedAt: now,
        });
      }

      // 各 itemId ごとに docId=itemId で set（merge）、集計は既に完了（注文履歴で金額表示するため unitPriceIncl を保存）
      for (const { ref: todaysOrderRef, ar, r } of todaysOrderSnaps) {
        tx.set(todaysOrderRef, {
          orderDocId,
          billId,
          userId,
          userName: (billData.party?.pokerName as string) || "",
          menuItemId: ar.menuItemId,
          name: r.name,
          category: r.category,
          quantity: ar.quantity,
          unitPriceIncl: r.unitPriceIncl,
          status: "preparing",
          orderedAt: FieldValue.serverTimestamp(),
          currentTable: (billData.place?.table as string) || null,
          currentSeat: (billData.place?.seat as number) || null,
        }, { merge: true });
      }

      if (newCount > 0 || newTotal > 0) {
        tx.update(ordersRef, {
          onedayOrderQuantity: FieldValue.increment(newCount),
          onedayTotalPrice: FieldValue.increment(newTotal),
          date: dateString,
          updatedAt: now,
        });
      }
    });

    // 合計金額を計算（全アイテムの合計）
    let totalItemsPrice = 0;
    for (const ar of appendResults) {
      const r = resolvedCache.get(ar.menuItemId);
      if (r) {
        totalItemsPrice += r.unitPriceIncl * ar.quantity;
      }
    }

    logOpsSuccess({
      message: "placeOrderByUser 成功",
      functionEntry: "placeOrderByUser",
      operation: "placeOrderByUserCallable",
      context: {
        billId,
        userId,
        itemsCount: appendResults.length,
        totalItemsPrice,
      },
    });

    return {
      success: true,
      data: {
        billId,
        items: appendResults.map(({ itemId, orderedAt, reused }) => ({ itemId, orderedAt, reused })),
        itemsCount: appendResults.length,
        totalItemsPrice, // LIFF側で使用される合計金額
      },
    };
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    if (error instanceof FunctionCustomError) {
      logOpsError({
        message: 'placeOrderByUser failed',
        functionEntry: 'placeOrderByUser',
        operation: 'placeOrderCatch',
        cause: error,
        sourceProductHint: 'firestore',
      });
      throw new HttpsError(mapFunctionCustomErrorToHttpsCode(error.errorKey), error.message);
    }
    logOpsError({
      message: 'placeOrderByUser failed',
      functionEntry: 'placeOrderByUser',
      operation: 'placeOrderGenericCatch',
      cause: error,
      sourceProductHint: 'firestore',
    });
    throw new HttpsError("internal", (error as Error)?.message || "注文の登録に失敗しました");
  }
});
