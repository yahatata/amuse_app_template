import {onCall} from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import {GenerateQRResponse} from "../types";
import {generateQRData, generateQRImage, saveQRCodeToStorage} from "../utils/qrCodeUtils";

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
      const qrData = generateQRData(uid, loginId, type);
      const qrCodeImage = await generateQRImage(qrData);
      
      // 期限は関数側で決める（ms基準）
      const nowMs = Date.now();
      let expiresAtMs = nowMs + 10 * 60 * 1000; // 10分
      const expiresAtTs = admin.firestore.Timestamp.fromMillis(expiresAtMs);


      // QRコードをStorageに保存
      const qrCodeUrl = await saveQRCodeToStorage(uid, qrCodeImage, type);


      // トランザクションで最大値ルールを適用
      console.log(`=== Firestore更新処理開始（トランザクション） ===`);
      console.log(`コレクション: ${collectionName}`);
      console.log(`ドキュメントID: ${uid}`);
      console.log(`提案期限: ${expiresAtMs} (${new Date(expiresAtMs)})`);
      
      const db = admin.firestore();
      const ref = db.collection(collectionName).doc(uid);
      
      try {
        const finalExpMs = await db.runTransaction(async (tx) => {
          const snap = await tx.get(ref);
          const current = (snap.get('qrExpiresAtMs') as number) || 0;
          
          console.log(`トランザクション内 - 現在の期限: ${current} (${new Date(current)})`);
          console.log(`トランザクション内 - 提案期限: ${expiresAtMs} (${new Date(expiresAtMs)})`);
          
          // 既存の期限の方が新しければ、何もしない
          if (current >= expiresAtMs) {
            console.log(`既存の期限の方が新しいため、更新をスキップ: ${current} >= ${expiresAtMs}`);
            return current;
          }
          
          // 新しい値で更新
          const updateData = {
            qrCodeUrl: qrCodeUrl,
            qrExpiresAt: expiresAtTs,
            qrExpiresAtMs: expiresAtMs,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          };
          
          console.log(`新しい値で更新実行:`, JSON.stringify(updateData, null, 2));
          tx.update(ref, updateData);
          
          return expiresAtMs;
        });
        
        console.log(`✅ トランザクション完了 - 最終期限: ${finalExpMs} (${new Date(finalExpMs)})`);
        console.log(`=== Firestore更新処理完了 ===`);
        
        // 最終的な期限を保存
        expiresAtMs = finalExpMs;
        
      } catch (transactionError: unknown) {
        console.error(`❌ トランザクションエラー: ${collectionName}/${uid}`);
        console.error(`エラーの詳細:`, transactionError);
        console.error(`エラータイプ:`, transactionError instanceof Error ? transactionError.constructor.name : 'Unknown');
        console.error(`エラーメッセージ:`, transactionError instanceof Error ? transactionError.message : 'Unknown error');
        console.error(`エラースタック:`, transactionError instanceof Error ? transactionError.stack : 'No stack trace');
        
        const errorMessage = transactionError instanceof Error ? transactionError.message : String(transactionError);
        throw new Error(`トランザクション処理に失敗しました: ${errorMessage}`);
      }

      return {
        qrCode: qrCodeImage,
        qrCodeUrl: qrCodeUrl,
        data: qrData,
        expiresAt: expiresAtMs,
      };
    } catch (error) {
      console.error("QRコード生成エラー:", error);

      // エラーメッセージを詳細化
      if (error instanceof Error) {
        throw new Error(`QRコードの生成に失敗しました: ${error.message}`);
      } else {
        throw new Error("QRコードの生成に失敗しました。");
      }
    }
  }
);
