import { onCall } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { parseQRData, verifyQRData } from "../utils/qrCodeUtils";

/**
 * 入店/退店処理（QRスキャン起点）
 *
 * Cloud Functions 側
 * When: 端末(店舗用Flutterアプリ)がユーザーのQRをスキャンした直後に呼び出し
 * Where: Callable Function (us-central1)
 * What: QRの正当性を検証し、`users/{uid}` の `isStaying` をトグル更新
 *       併せて `lastCheckInAt` / `lastCheckOutAt` をサーバー時刻で記録し、
 *       ログを `users/{uid}/visitLogs` に追加
 * How: verifyQRData → parseQRData → Firestore トランザクションで現在状態を参照し更新
 */
export const processVisitByQR = onCall(async (request) => {
  // 認証チェック（店舗端末からの呼び出しを想定）
  if (!request.auth) {
    throw new Error("Authentication required.");
  }

  // 入力取り出し
  const { qrData } = request.data ?? {};

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

  // スタッフ/ユーザー種別チェック（今回はユーザー入退店を対象）
  if (parsed.type !== "user") {
    return {
      success: false,
      action: null,
      message: "このQRコードは入退店処理の対象外です。",
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

    // Firestore の原子更新でトグル処理（ユーザー側の来店/退店フロー）
    const nowDate = new Date();
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

      if (!currentIsStaying) {
        // 入店処理: isStaying=true, visitHistory に visitedAt を追加
        tx.update(userRef, {
          isStaying: true,
          lastCheckInAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        const visitRef = userRef.collection("visitHistory").doc();
        tx.set(visitRef, {
          visitedAt: admin.firestore.FieldValue.serverTimestamp(),
          note: "",
          source: "qr",
        });

        // 監査ログ（任意、非破壊追加）
        const logRef = userRef.collection("visitLogs").doc();
        tx.set(logRef, {
          action: "checkin",
          at: admin.firestore.FieldValue.serverTimestamp(),
          scannedByUid: request.auth?.uid ?? null,
          source: "qr",
        });

        return {
          success: true,
          action: "checkin" as const,
          message: "来店記録を保存しました",
          user: { uid: parsed.uid, loginId: parsed.loginId },
        };
      } else {
        // 退店処理: isStaying=false, 最新の visitHistory に leftAt と stayMinutes を設定
        const q = userRef
          .collection("visitHistory")
          .orderBy("visitedAt", "desc")
          .limit(1);
        const qSnap = await tx.get(q);

        tx.update(userRef, {
          isStaying: false,
          lastCheckOutAt: admin.firestore.Timestamp.fromDate(nowDate),
        });

        if (!qSnap.empty) {
          const lastDoc = qSnap.docs[0];
          const lastData = lastDoc.data() as { visitedAt?: admin.firestore.Timestamp };
          const visitedAtTs = lastData?.visitedAt;

          const leftAt = admin.firestore.Timestamp.fromDate(nowDate);
          const updateData: Record<string, any> = { leftAt };

          if (visitedAtTs) {
            const visitedAtDate = visitedAtTs.toDate();
            const stayMinutes = Math.max(0, Math.floor((nowDate.getTime() - visitedAtDate.getTime()) / 60000));
            updateData.stayMinutes = stayMinutes;
          }

          tx.update(lastDoc.ref, updateData);
        }

        // 監査ログ（任意、非破壊追加）
        const logRef = userRef.collection("visitLogs").doc();
        tx.set(logRef, {
          action: "checkout",
          at: admin.firestore.Timestamp.fromDate(nowDate),
          scannedByUid: request.auth?.uid ?? null,
          source: "qr",
        });

        return {
          success: true,
          action: "checkout" as const,
          message: "退店記録を保存しました",
          user: { uid: parsed.uid, loginId: parsed.loginId },
        };
      }
    });

    return result;
  } catch (error) {
    console.error("processVisitByQR error", error);
    return {
      success: false,
      action: null,
      message: "入退店処理に失敗しました。",
    };
  }
});

