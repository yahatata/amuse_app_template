import {onCall} from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { GenerateQRResponse } from "../../../shared/types";
import { generateQRData, generateQRImage, saveQRCodeToStorage } from "../services/qrCodeUtils";
import { logOpsError, logOpsSuccess } from "../../../shared/logging/logOpsError";

/**
 * QRコード生成関数（統合版）
 *
 * アカウント作成時と再生成時の両方に対応
 *
 * リクエスト:
 * - type: "user" | "staff"
 *
 * レスポンス:
 * - qrCode: Base64エンコードされたQRコード画像
 * - data: QRコードデータ
 * - expiresAt: 有効期限
 */
export const generateQRCode = onCall(
  async (request): Promise<GenerateQRResponse> => {
    // リビジョン識別ログ
    console.log('REV', process.env.K_SERVICE, process.env.K_REVISION, 'uid', request.auth?.uid, 'type', request.data?.type);
    
    // 認証チェック
    if (!request.auth) {
      throw new Error("Authentication required.");
    }

    const uid = request.auth.uid;
    const {type} = request.data;

    // 入力バリデーション
    if (!type || !["user", "staff"].includes(type)) {
      throw new Error("Invalid QR code type. Must be \"user\" or \"staff\".");
    }

    try {
      let userData: any;
      let collectionName: string;

      // typeに応じてコレクションを選択
      if (type === "staff") {
        const staffDoc = await admin.firestore()
          .collection("staffs")
          .doc(uid)
          .get();

        if (!staffDoc.exists) {
          throw new Error("Staff not found. Please create an account first.");
        }

        userData = staffDoc.data();
        collectionName = "staffs";
      } else {
        const userDoc = await admin.firestore()
          .collection("users")
          .doc(uid)
          .get();

        if (!userDoc.exists) {
          throw new Error("User not found. Please create an account first.");
        }

        userData = userDoc.data();
        collectionName = "users";
      }

      const loginId = userData?.loginID || userData?.loginId; // loginID（大文字）またはloginId（小文字）に対応

      if (!loginId) {
        throw new Error("Login ID not found. Please update your profile.");
      }

      // 連続生成制限を削除（ユーザーが自由に再生成可能）

      // QRコードデータを生成
      const qrData = await generateQRData(uid, loginId, type);
      const qrCodeImage = await generateQRImage(qrData);
      
      // 期限は関数側で決める（ms基準）
      const nowMs = Date.now();
      let expiresAtMs = nowMs + 10 * 60 * 1000; // 10分
      const expiresAtTs = admin.firestore.Timestamp.fromMillis(expiresAtMs);


      // QRコードをStorageに保存
      const qrCodeUrl = await saveQRCodeToStorage(uid, qrCodeImage, type);


      const db = admin.firestore();
      const ref = db.collection(collectionName).doc(uid);
      
      try {
        const finalExpMs = await db.runTransaction(async (tx) => {
          const snap = await tx.get(ref);
          const current = (snap.get('qrExpiresAtMs') as number) || 0;
          
          // 既存の期限の方が新しければ、期限は据え置き、ただしURLは更新
          if (current >= expiresAtMs) {
            // 期限は据え置き、ただしURLは更新（UIが最新URLを見るように）
            tx.update(ref, {
              qrCodeUrl: qrCodeUrl,
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
            
            return current;
          }
          
          // 新しい値で更新
          const updateData = {
            qrCodeUrl: qrCodeUrl,
            qrExpiresAt: expiresAtTs,
            qrExpiresAtMs: expiresAtMs,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          };
          
          tx.update(ref, updateData);
          
          return expiresAtMs;
        });
        
        // 最終的な期限を保存
        expiresAtMs = finalExpMs;
        
      } catch (transactionError: unknown) {
        logOpsError({
        message: 'QRコード生成トランザクションエラー',
        functionEntry: 'generateQRCode',
        operation: 'transaction',
        cause: transactionError,
        errorKey: 'USER_VISIT_QR_GENERATE_TRANSACTION_FAILED',
      });
        
        const errorMessage = transactionError instanceof Error ? transactionError.message : String(transactionError);
        throw new Error(`トランザクション処理に失敗しました: ${errorMessage}`);
      }

      logOpsSuccess({
        message: "generateQRCode 成功",
        functionEntry: "generateQRCode",
        operation: "generateAndPersistQr",
        context: { uid, type, collectionName, expiresAtMs },
      });

      return {
        qrCode: qrCodeImage,
        qrCodeUrl: qrCodeUrl,
        data: qrData,
        expiresAt: expiresAtMs,
      };
    } catch (error) {
      logOpsError({
      message: 'QRコード生成エラー:',
      functionEntry: 'generateQRCode',
      operation: 'generateQRCodeOuterCatch',
      cause: error,
      errorKey: 'USER_VISIT_QR_GENERATE_FAILED',
    });

      // エラーメッセージを詳細化
      if (error instanceof Error) {
        throw new Error(`QRコードの生成に失敗しました: ${error.message}`);
      } else {
        throw new Error("QRコードの生成に失敗しました。");
      }
    }
  }
);
