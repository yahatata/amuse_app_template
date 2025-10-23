import { onCall } from "firebase-functions/v2/https";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { addLogEntry } from "../utils/logUtils";

/**
 * Chip名から数値部分を抽出する
 * 例: "side game chip ：1000" -> 1000
 * 例: "チップ 500" -> 500
 */
function extractChipAmount(chipName: string): number {
  console.log(`extractChipAmount: 入力="${chipName}"`);
  
  // 文字列から数値部分を抽出（最後の数値部分を取得）
  const match = chipName.match(/(\d+)(?!.*\d)/);
  if (match) {
    const amount = parseInt(match[1], 10);
    console.log(`extractChipAmount: 抽出結果=${amount}`);
    return amount;
  }
  
  console.log(`extractChipAmount: 数値が見つかりません`);
  return 0;
}

/**
 * When: スタッフが注文確定ボタンを押下したとき
 * Where: Cloud Functions (src/itemOrder/placeOrder.ts)
 * What: 指定ユーザーのtodaysBillsにアイテムを追加し、同時にordersコレクションへ当日の注文記録を作成
 * How:
 *  - 引数で受け取った userId と 注文アイテム情報 (menuItemId, category, name, price, quantity) を使用
 *  - status=open の todaysBills を userId で特定
 *  - トランザクションで以下を実行
 *    1) todaysBills.items へ注文アイテムを追記し、totalPrice を加算
 *    2) orders/{YYYYMMDD} ドキュメントを作成/更新し、_TodaysOrders に注文行を作成
 */
export const placeOrder = onCall(async (request) => {
  const db = getFirestore();

  try {
    const { userId, item } = request.data as {
      userId: string;
      item: {
        menuItemId: string;
        category: string;
        name: string;
        price: number;
        quantity: number;
      };
    };

    // 入力バリデーション
    if (!userId) {
      return { success: false, error: "userIdが指定されていません" };
    }
    if (!item || !item.menuItemId || !item.name || typeof item.price !== "number" || typeof item.quantity !== "number") {
      return { success: false, error: "アイテム情報が不正です" };
    }
    if (item.quantity <= 0 || item.price < 0) {
      return { success: false, error: "数量または価格が不正です" };
    }

    const now = new Date();
    const yyyy = String(now.getFullYear());
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    const orderDocId = `${yyyy}${mm}${dd}`; // 親ドキュメントID: YYYYMMDD
    const dateString = `${yyyy}-${mm}-${dd}`; // 表示/集計用: YYYY-MM-DD

    // 対象ユーザーの open な todaysBills を特定
    const billsSnap = await db
      .collection("todaysBills")
      .where("userId", "==", userId)
      .where("status", "==", "open")
      .limit(1)
      .get();

    if (billsSnap.empty) {
      return { success: false, error: "対象ユーザーのオープンな伝票が見つかりません" };
    }

    const billsDoc = billsSnap.docs[0];
    const billsRef = billsDoc.ref;

    // トランザクションで整合性を保つ
    const result = await db.runTransaction(async (tx) => {
      // すべての読み取りは書き込みより前に実行する
      const ordersRef = db.collection("orders").doc(orderDocId);
      const [billsSnapInTx, ordersSnap] = await Promise.all([
        tx.get(billsRef),
        tx.get(ordersRef),
      ]);

      // 1) todaysBills 更新用データの計算
      const billsData = billsSnapInTx.data() as any;
      const pokerName: string = billsData?.pokerName || "";
      const currentTable: string | null = billsData?.currentTable ?? null;
      const currentSeat: string | null = billsData?.currentSeat ?? null;

      const orderedAt = now;
      const itemTotal = Number(item.price) * Number(item.quantity);
      const newEntry = {
        menuItemId: item.menuItemId,
        category: item.category,
        name: item.name,
        price: item.price,
        quantity: item.quantity,
        totalPrice: itemTotal,
        orderedAt,
      };

      // Chipカテゴリーの場合はsideGameChipフィールドに保存、それ以外はitemsフィールドに保存
      if (item.category === 'Chip') {
        const chipAmount = extractChipAmount(item.name);
        const totalChipAmount = chipAmount * Number(item.quantity);
        
        // sideGameChip用のエントリーを作成（actionとamountフィールドを追加）
        const sideGameChipEntry = {
          ...newEntry,
          action: 'purchase',
          amount: totalChipAmount,
        };
        
        const existingSideGameChips: any[] = Array.isArray(billsData?.sideGameChip) ? billsData.sideGameChip : [];
        const updatedSideGameChips = [...existingSideGameChips, sideGameChipEntry];
        
        tx.update(billsRef, {
          sideGameChip: updatedSideGameChips,
          totalPrice: (Number(billsData?.totalPrice) || 0) + itemTotal,
          updatedAt: now,
        });

        console.log(`Chip購入処理: name=${item.name}, chipAmount=${chipAmount}, quantity=${item.quantity}, totalChipAmount=${totalChipAmount}`);
        // usersコレクションのsideGameTipへの加算は削除（sideGameChipLogsのみに記録）
      } else {
        const existingItems: any[] = Array.isArray(billsData?.items) ? billsData.items : [];
        const updatedItems = [...existingItems, newEntry];
        
        tx.update(billsRef, {
          items: updatedItems,
          totalPrice: (Number(billsData?.totalPrice) || 0) + itemTotal,
          updatedAt: now,
        });
      }

      // 2) orders/{YYYYMMDD} と _TodaysOrders の作成/更新

      if (!ordersSnap.exists) {
        tx.set(ordersRef, {
          date: dateString,
          onedayOrderQuantity: 0,
          onedayTotalPrice: 0,
          createdAt: now,
          updatedAt: now,
        });
      }

      // _TodaysOrders へ行追加
      const todaysOrderRef = ordersRef.collection("_TodaysOrders").doc();
      tx.set(todaysOrderRef, {
        orderDocId,
        userId,
        userName: pokerName,
        items: [newEntry],
        orderingAt: now,
        status: "preparing",
        currentTable,
        currentSeat,
        createdAt: now,
        updatedAt: now,
      });

      // 親 orders の集計をインクリメント
      tx.update(ordersRef, {
        onedayOrderQuantity: FieldValue.increment(1),
        onedayTotalPrice: FieldValue.increment(itemTotal),
        date: dateString,
        updatedAt: now,
      });

      return {
        todaysBillsId: billsRef.id,
        ordersDocId: orderDocId,
        todaysOrderId: todaysOrderRef.id,
        totalPrice: (Number(billsData?.totalPrice) || 0) + itemTotal,
      };
    });

    // Chip購入の場合はログ記録を追加（トランザクション外で実行）
    if (item.category === 'Chip') {
      try {
        // Chip名から数値部分を抽出
        const chipAmount = extractChipAmount(item.name);
        const totalChipAmount = chipAmount * Number(item.quantity);
        
        console.log(`Chip購入ログ記録: name=${item.name}, chipAmount=${chipAmount}, quantity=${item.quantity}, totalChipAmount=${totalChipAmount}`);
        
        if (totalChipAmount > 0) {
          // ログ記録を追加（amountDeltaはChip量を使用）
          await addLogEntry(userId, 'sideGameChipLogs', {
            appliedAt: new Date(),
            category: 'purchase',
            amountDelta: totalChipAmount, // Chip量を使用（価格ではない）
            reasonType: 'sideGame',
            actor: 'tablet_front', // 実際の端末IDに置き換え可能
          });
          console.log(`Chip購入ログ記録完了: userId=${userId}, chipAmount=${totalChipAmount}`);
        } else {
          console.warn(`Chip量が0のためログ記録をスキップ: name=${item.name}`);
        }
      } catch (logError) {
        console.error('Chip購入ログ記録エラー:', logError);
        // ログ記録の失敗は注文処理を止めないが、エラーを記録
        throw new Error(`Chip購入ログ記録に失敗しました: ${logError instanceof Error ? logError.message : String(logError)}`);
      }
    }

    return { success: true, data: result };
  } catch (error) {
    console.error("placeOrder エラー:", error);
    return { success: false, error: "注文の登録に失敗しました" };
  }
});


