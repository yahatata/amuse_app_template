/**
 * placeOrder
 * 
 * スタッフが注文確定ボタンを押下したとき
 * 
 * 新スキーマ対応:
 * - getActiveBillByUser で billId を取得
 * - Chip以外: appendItem で /bills/{billId}/items/{itemId} に追加、orders/_TodaysOrders に記録
 * - Chip: appendSideGameChip で /bills/{billId}/sideGameChips/{chipId} に追加（orders/_TodaysOrders には書かない）
 */

import { onCall } from "firebase-functions/v2/https";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getActiveBillByUser } from "../helpers/billsApi/getActiveBillByUser";
import { appendItem } from "../helpers/billsApi/appendItem";
import { appendSideGameChip } from "../helpers/billsApi/appendSideGameChip";
import { resolveMenuItem } from "../helpers/billsApi/resolveMenuItem";
import { addLogEntry } from "../utils/logUtils";

export const placeOrder = onCall(async (request) => {
  const db = getFirestore();

  try {
    const { userId, item, clientNonce } = request.data as {
      userId: string;
      item: {
        menuItemId: string;
        quantity: number;
        // name/category/price は無視（サーバ側で解決）
      };
      clientNonce: string; // 画面セッションで固定
    };

    // 入力バリデーション
    if (!userId) {
      return { success: false, error: "userIdが指定されていません" };
    }
    if (!item || !item.menuItemId || typeof item.quantity !== "number") {
      return { success: false, error: "アイテム情報が不正です" };
    }
    if (item.quantity <= 0) {
      return { success: false, error: "数量が不正です" };
    }
    if (!clientNonce) {
      return { success: false, error: "clientNonceが指定されていません" };
    }

    // 1. getActiveBillByUser で billId を取得
    const { billId, billData } = await getActiveBillByUser(userId);

    // 2. メニューアイテムを解決（カテゴリ判定用）
    const resolved = await resolveMenuItem(item.menuItemId);

    // 3. カテゴリによって分岐
    const isChip = resolved.category === 'Chip' || resolved.category === 'chip';

    if (isChip) {
      // Chipカテゴリの場合: appendSideGameChip を使用
      // Chip名から数値部分を抽出（1メニューあたりのチップ枚数）
      const chipName = resolved.name;
      const match = chipName.match(/(\d+)(?!.*\d)/);
      const perUnitChip = match ? parseInt(match[1], 10) : 0;
      const chipQty = perUnitChip * item.quantity;
      const amountIncl = resolved.unitPriceIncl * item.quantity;

      // appendSideGameChip を呼び出す
      const idempotencyKey = `${billId}:appendSideGameChip:${clientNonce}`;
      const appendResult = await appendSideGameChip({
        billId,
        action: 'purchase',
        chipQty,
        amountIncl,
        menuItemId: resolved.menuItemId,
        name: resolved.name,
        idempotencyKey,
      });

      // sideGameChipLogs に purchase ログ追加（idempotent replay 時はスキップ）
      const isReplay = appendResult.diagnostics?.reused === true;
      if (!isReplay) {
        try {
          if (chipQty > 0) {
            await addLogEntry(userId, 'sideGameChipLogs', {
              appliedAt: new Date(),
              category: 'purchase',
              amountDelta: chipQty, // appendSideGameChip で計算した chipQty を使用
              reasonType: 'sideGame',
              actor: 'tablet_front',
            });
          }
        } catch (logError) {
          console.error('Chip購入ログ記録エラー:', logError);
          // ログ記録の失敗は注文処理を止めない
        }
      }

      // レスポンス: 従来通り { billId, itemId, orderedAt, reused } を返す
      // chipId はクライアントに返さない（内部識別子）
      // Chipの注文IDとしては clientNonce をそのまま返す
      return {
        success: true,
        data: {
          billId,
          itemId: clientNonce, // Chipの場合も clientNonce を返す（chipId は返さない）
          orderedAt: appendResult.orderedAt,
          reused: appendResult.diagnostics?.reused || false,
        },
      };
    } else {
      // Chip以外の場合: 従来通り appendItem を使用
      const idempotencyKey = `appendItem:${billId}:${clientNonce}`;
      const appendResult = await appendItem({
        billId,
        item: {
          menuItemId: item.menuItemId,
          quantity: item.quantity,
          clientNonce,
        },
        idempotencyKey,
      });

      // 4. orders/_TodaysOrders に記録（提供動線専用、Chips除外、docId = itemId、親集計は初回のみ）
      // calcBusinessDate は使用しない（SSoTは bill.businessDate）
      const now = new Date();
      const biz = billData.businessDate as string;  // "2025-11-15" (SSoT)
      const orderDocId = biz.replace(/-/g, "");     // "20251115"
      const dateString = biz;                       // "2025-11-15"

      await db.runTransaction(async (tx) => {
        const ordersRef = db.collection("orders").doc(orderDocId);
        // すべての読み取りを先に実行
        const ordersSnap = await tx.get(ordersRef);
        const todaysOrderRef = ordersRef.collection("_TodaysOrders").doc(appendResult.itemId);
        const todaysOrderSnap = await tx.get(todaysOrderRef);
        
        // 存在しない時だけ set + 親集計 increment、存在時は上書きのみで親集計スキップ
        const isNew = !todaysOrderSnap.exists;
        
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

        // _TodaysOrders に1種類=1ドキュメントを作成（docId = itemId）
        tx.set(todaysOrderRef, {
          orderDocId,
          billId,
          userId,
          userName: (billData.party?.pokerName as string) || "",
          menuItemId: resolved.menuItemId,
          name: resolved.name,
          category: resolved.category,
          quantity: item.quantity,
          status: "preparing",
          orderedAt: FieldValue.serverTimestamp(),
          currentTable: (billData.place?.table as string) || null,
          currentSeat: (billData.place?.seat as number) || null,
        }, { merge: true });

        // 親 orders の集計は初回のみインクリメント
        if (isNew) {
          tx.update(ordersRef, {
            onedayOrderQuantity: FieldValue.increment(1),
            onedayTotalPrice: FieldValue.increment(resolved.unitPriceIncl * item.quantity),
            date: dateString,
            updatedAt: now,
          });
        }
      });

      return {
        success: true,
        data: {
          billId,
          itemId: appendResult.itemId,
          orderedAt: appendResult.orderedAt,
          reused: appendResult.diagnostics?.reused || false,
        },
      };
    }
  } catch (error) {
    console.error("placeOrder エラー:", error);
    
    // HttpsError の場合はそのまま返す
    if (error && typeof error === 'object' && 'code' in error) {
      const errorMessage = (error as any).message || String(error);
      return { success: false, error: errorMessage };
    }
    
    // エラーの詳細を返す（デバッグ用）
    const errorMessage = error instanceof Error ? error.message : String(error);
    return { success: false, error: errorMessage || "注文の登録に失敗しました" };
  }
});
