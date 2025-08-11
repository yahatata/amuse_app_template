import { onCall } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { parseQRData, verifyQRData } from "../utils/qrCodeUtils";

/**
 * 入店処理（QRスキャン起点）
 *
 * When: 端末(店舗用Flutterアプリ)がユーザーのQRをスキャンした直後に呼び出し
 * Where: Callable Function (us-central1)
 * What: QRの正当性を検証し、`users/{uid}` の入店（check-in）のみを処理
 *       既に来店中の場合は更新せずメッセージのみ返却（退店は会計時に別処理）
 *       ログを `users/{uid}/visitLogs` に追加（check-in 時のみ）
 * How: verifyQRData → parseQRData → Firestore トランザクションで現在状態を参照し更新（入店のみ）
 */
export const processVisitByQR = onCall(async (request) => {
  // 認証チェックを削除（注文処理と同様に認証なしで動作）

  // 入力取り出し
  const { qrData, entranceFee = 1000, entranceFeeDescription = "入店料" } = request.data ?? {};

  // 入力バリデーション
  if (!qrData || typeof qrData !== "string") {
    return {
      success: false,
      action: null,
      message: "QRコードデータが無効です。",
    };
  }

  // QRの整合性検証（期限・トークン）
  const valid = verifyQRData(qrData);
  if (!valid) {
    return {
      success: false,
      action: null,
      message: "QRコードが無効または期限切れです。",
    };
  }

  // QRをパース
  const parsed = parseQRData(qrData);
  if (!parsed) {
    return {
      success: false,
      action: null,
      message: "QRコードデータの解析に失敗しました。",
    };
  }

  // ユーザー種別チェック（ユーザー入店のみ）
  if (parsed.type !== "user") {
    return {
      success: false,
      action: null,
      message: "このQRコードは入店処理の対象外です。",
    };
  }

  const userRef = admin.firestore().collection("users").doc(parsed.uid);

  try {
    // ユーザーのロール確認（ユーザー側処理のみを許可）
    const userSnap = await userRef.get();
    if (!userSnap.exists) {
      return {
        success: false,
        action: null,
        message: "ユーザーが見つかりません。",
      };
    }
    const role = userSnap.data()?.role;
    if (role !== "user") {
      return {
        success: false,
        action: null,
        message: "ユーザーのロールが無効です（user ではありません）。",
      };
    }

    // Firestore の原子更新で入店のみ処理（退店は会計時に別処理）
    const result = await admin.firestore().runTransaction(async (tx) => {
      const snap = await tx.get(userRef);
      if (!snap.exists) {
        return {
          success: false,
          action: null,
          message: "ユーザーが見つかりません。",
        };
      }

      const data = snap.data() || {};
      const currentIsStaying = Boolean(data.isStaying);

      if (currentIsStaying) {
        // 既に来店中（退店は会計時）
        return {
          success: false,
          action: null,
          message: "既に来店中です。退店処理は会計時に行います。",
        };
      }

      // 入店処理
      tx.update(userRef, {
        isStaying: true,
        lastCheckInAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      // visitLogsに詳細な入店ログを記録
      const logRef = userRef.collection("visitLogs").doc();
      tx.set(logRef, {
        action: "checkin",
        checkInAt: admin.firestore.FieldValue.serverTimestamp(),
        checkOutAt: null,
        stayMinutes: null,
        authMethod: "qr",
        note: "",
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

             // todaysBillsドキュメントを作成（入店料あり、manualCheckInと同様のフィールド）
             const extraCost = entranceFee > 0 ? [{
               name: entranceFeeDescription || "入店料",
               price: entranceFee,
               createdAt: new Date(),
             }] : [];

             const todaysBillsData = {
               createdAt: admin.firestore.FieldValue.serverTimestamp(),
               pokerName: data.pokerName || "",
               status: 'open',
               userId: parsed.uid,
               items: [],
               sideGameTip: [],
               tournaments: [],
               extraCost: extraCost, // 入店料を含む
               totalPrice: entranceFee > 0 ? entranceFee : 0, // 入店料を初期値として設定
               settledAt: null,
               currentTable: null,
               currentSeat: null,
             } as Record<string, unknown>;

             const todaysBillsRef = admin.firestore().collection("todaysBills").doc();
             tx.set(todaysBillsRef, todaysBillsData);

             return {
               success: true,
               action: "checkin" as const,
               message: "来店記録を保存しました",
               user: { uid: parsed.uid, loginId: parsed.loginId },
               todaysBillsId: todaysBillsRef.id,
             };
    });

    return result;
  } catch (error) {
    console.error("processVisitByQR error", error);
    return {
      success: false,
      action: null,
      message: "入店処理に失敗しました。",
    };
  }
});

