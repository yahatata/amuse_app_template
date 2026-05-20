import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import * as crypto from "crypto";
import { parseQRData, verifyQRData } from "../services/qrCodeUtils";
import { getCallerDeviceByUid, hasRequiredOption, isActive } from "../../../shared/devices";
import { createBillWithActiveStay } from "../../bills/repos/createBillWithActiveStay";
import { logOpsError, logOpsSuccess } from "../../../shared/logging/logOpsError";
import { FunctionCustomError } from "../../../shared/logging/functionCustomError";

/**
 * 入店処理（QRスキャン起点）
 *
 * When: 端末(店舗用Flutterアプリ)がユーザーのQRをスキャンした直後に呼び出し
 * Where: Callable Function (asia-northeast1)
 * What: QRの正当性を検証し、`users/{uid}` の入店（check-in）のみを処理
 *       既に来店中の場合は更新せずメッセージのみ返却（退店は会計時に別処理）
 *       ログを `users/{uid}/visitLogs` に追加（check-in 時のみ）
 * How: verifyQRData → parseQRData → Firestore トランザクションで現在状態を参照し更新（入店のみ）→ createBillWithActiveStay ヘルパ呼び出し
 */
export const processVisitByQR = onCall(async (request) => {
  // 認証チェック
  if (!request.auth) {
    throw new HttpsError('unauthenticated', '認証が必要です');
  }

  const callerUid = request.auth.uid;

  // デバイス権限の確認（role: admin または options.user_entry_exit: true）
  const device = await getCallerDeviceByUid(callerUid);
  if (!device || !isActive(device.status)) {
    throw new HttpsError('permission-denied', 'デバイスが見つからないか、アクティブではありません');
  }

  const hasPermission = device.role === 'admin' || hasRequiredOption(device.options, 'user_entry_exit');
  if (!hasPermission) {
    throw new HttpsError('permission-denied', 'お客様入退店操作の権限がありません');
  }

  // 入力取り出し
  const { qrData, entranceFee = 1000, entranceFeeDescription = "入店料", chargeEntranceFeeOnReentry = false } = request.data ?? {};

  // 入力バリデーション
  if (!qrData || typeof qrData !== "string") {
    return {
      success: false,
      action: null,
      message: "QRコードデータが無効です。",
    };
  }

  // QRの整合性検証（期限・トークン）
  const valid = await verifyQRData(qrData, {
    functionEntry: 'processVisitByQR',
  });
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
    const db = admin.firestore();

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

    // activeStays の存在確認
    const activeStayRef = db.collection('activeStays').doc(parsed.uid);
    const activeStaySnap = await activeStayRef.get();
    
    if (activeStaySnap.exists) {
      const activeStayData = activeStaySnap.data();
      const isActive = activeStayData?.isActive === true;
      
      if (isActive) {
        return {
          success: false,
          action: null,
          message: "すでに入店済みです",
        };
      }
      // isActive === false の場合は再入店として処理を続ける
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

      // 入店処理（isStaying の更新は削除）
      tx.update(userRef, {
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

      // トランザクション内で pokerName を取得して返す（後でヘルパAPIで使用）
      return {
        success: true,
        action: "checkin" as const,
        message: "ユーザー情報を更新しました",
        user: { uid: parsed.uid, loginId: parsed.loginId },
        pokerName: data.pokerName || null,
      };
    });

    // トランザクション外で bills と activeStays を作成（ヘルパAPI利用）
    // 注意: トランザクション内でヘルパAPIを呼び出すと、ヘルパAPI内のトランザクションと競合する可能性があるため、
    // ユーザー情報の更新を先にトランザクションで完了させてから、ヘルパAPIを呼び出す
    if (result.success && result.action === "checkin") {
      const billId = crypto.randomUUID();
      const idempotencyKey = crypto.randomUUID();
      
      // result から pokerName を取得（型アサーションが必要な場合）
      const pokerName = (result as any).pokerName || null;
      
      // 再入店判定と入店料設定
      const isReentry = activeStaySnap.exists && activeStaySnap.data()?.isActive === false;
      
      // R06/Phase2: entranceFee を数値に正規化（クライアントから文字列が渡る場合の対策）
      let finalEntranceFee = Number(entranceFee) || 0;
      let finalEntranceFeeDescription = (typeof entranceFeeDescription === 'string' ? entranceFeeDescription : '') || '入店料';
      
      if (isReentry && !chargeEntranceFeeOnReentry) {
        // 再入店で入店料を取らない場合
        finalEntranceFee = 0;
        finalEntranceFeeDescription = '再入店のため、入店料0円';
      }
      
      const billResult = await createBillWithActiveStay({
        billId,
        userId: parsed.uid,
        pokerName,
        idempotencyKey,
        entranceFee: finalEntranceFee,
        entranceFeeDescription: finalEntranceFeeDescription,
      });

      if (!billResult.success) {
        return {
          success: false,
          action: null,
          message: "入店処理に失敗しました（bills作成エラー）",
        };
      }

      logOpsSuccess({
        message: "processVisitByQR 成功",
        functionEntry: "processVisitByQR",
        context: {
          guestUserId: parsed.uid,
          billId: billResult.billId,
          deviceId: device.id,
        },
      });

      return {
        success: true,
        action: "checkin" as const,
        message: "来店記録を保存しました",
        user: { uid: parsed.uid, loginId: parsed.loginId },
        billId: billResult.billId,
      };
    }

    return result;
  } catch (error) {
    if (error instanceof FunctionCustomError) {
      return {
        success: false,
        action: null,
        message: "入店処理に失敗しました。",
      };
    }
    logOpsError({
      message: 'processVisitByQR error',
      functionEntry: 'processVisitByQR',
      cause: error,
      errorKey: 'USER_VISIT_QR_UNEXPECTED',
      context: {
        callerUid,
        deviceId: device.id,
        ...(parsed && parsed.type === 'user' ? { guestUserId: parsed.uid } : {}),
      },
    });
    return {
      success: false,
      action: null,
      message: "入店処理に失敗しました。",
    };
  }
});
