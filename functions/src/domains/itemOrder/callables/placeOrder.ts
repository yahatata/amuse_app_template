/**
 * placeOrder
 * 
 * スタッフが注文確定ボタンを押下したとき
 * 
 * 新スキーマ対応:
 * - billId を直接受け取る（クライアント側で取得済み）
 * - Chip以外: appendItemWithOrderProjection で /bills/{billId}/items/{itemId} に追加、orders/_TodaysOrders に記録
 * - Chip: appendSideGameChip で /bills/{billId}/sideGameChips/{chipId} に追加（orders/_TodaysOrders には書かない）
 */

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";
import { appendItemWithOrderProjection } from "../../bills/repos/appendItem";
import { appendSideGameChip } from "../../bills/repos/appendSideGameChip";
import { resolveMenuItem } from "../../bills/repos/resolveMenuItem";
import { addLogEntry } from "../../user/services/logUtils";
import { getCallerDeviceByUid, hasRequiredOption, isActive } from "../../../shared/devices";
import { logOpsError } from "../../../shared/logging/logOpsError";

export const placeOrder = onCall(async (request) => {
  const db = getFirestore();

  // 認証チェック
  if (!request.auth) {
    throw new HttpsError('unauthenticated', '認証が必要です');
  }

  const callerUid = request.auth.uid;

  try {
    // デバイス権限の確認（role: admin または options.order: true）
    const device = await getCallerDeviceByUid(callerUid);
    if (!device || !isActive(device.status)) {
      throw new HttpsError('permission-denied', 'デバイスが見つからないか、アクティブではありません');
    }

    const hasPermission = device.role === 'admin' || hasRequiredOption(device.options, 'order');
    if (!hasPermission) {
      throw new HttpsError('permission-denied', '注文操作の権限がありません');
    }

    const { billId, item, clientNonce } = request.data as {
      billId: string; // userId から billId に変更
      item: {
        menuItemId: string;
        quantity: number;
        // name/category/price は無視（サーバ側で解決）
      };
      clientNonce: string; // 画面セッションで固定
    };

    // 入力バリデーション
    if (!billId) {
      throw new HttpsError('invalid-argument', 'billIdが指定されていません');
    }
    if (!item || !item.menuItemId || typeof item.quantity !== "number") {
      throw new HttpsError('invalid-argument', 'アイテム情報が不正です');
    }
    if (item.quantity <= 0) {
      throw new HttpsError('invalid-argument', '数量が不正です');
    }
    if (!clientNonce) {
      throw new HttpsError('invalid-argument', 'clientNonceが指定されていません');
    }

    // 1. bills/{billId} を取得して検証
    const billRef = db.collection('bills').doc(billId);
    const billSnap = await billRef.get();
    
    if (!billSnap.exists) {
      throw new HttpsError('not-found', `伝票が見つかりません: ${billId}`);
    }
    
    const billData = billSnap.data()!;
    const status = billData.status as string;
    
    // status チェック: open/in_progress のみ許可
    if (status !== 'open' && status !== 'in_progress') {
      throw new HttpsError('failed-precondition', `注文できない伝票の状態です: ${status}`);
    }
    
    const userId = (billData.party?.userId as string) || '';
    if (!userId || userId.trim() === '') {
      throw new HttpsError('internal', '伝票にuserIdが設定されていません');
    }

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
          logOpsError({
      message: 'Chip購入ログ記録エラー:',
      failureType: 'business',
      functionEntry: 'placeOrder',
      cause: logError,
    });
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
      // Chip以外の場合: appendItemWithOrderProjection を使用（items と orders を同一トランザクションで作成）
      const idempotencyKey = `appendItem:${billId}:${clientNonce}`;
      const businessDate = billData.businessDate as string;
      const userName = (billData.party?.pokerName as string) || '';
      const currentTable = (billData.place?.table as string) || null;
      const currentSeat = (billData.place?.seat as number) || null;

      const appendResult = await appendItemWithOrderProjection({
        billId,
        item: {
          menuItemId: item.menuItemId,
          quantity: item.quantity,
          clientNonce,
        },
        idempotencyKey,
        businessDate,
        userId,
        userName,
        currentTable,
        currentSeat,
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
    logOpsError({
      message: 'placeOrder エラー:',
      failureType: 'business',
      functionEntry: 'placeOrder',
      cause: error,
    });
    
    // HttpsError の場合はそのまま throw
    if (error instanceof HttpsError) {
      throw error;
    }
    
    // その他のエラーは internal エラーとして throw
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new HttpsError('internal', errorMessage || "注文の登録に失敗しました");
  }
});
