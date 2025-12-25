import { onCall } from "firebase-functions/v2/https";
import { HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { defineString } from "firebase-functions/params";
import { sendLineButtonMessage, formatDateToJapanese } from "../utils/lineMessaging";

// LINEプラン設定（globalConstant.dartと同期必須）
const linePlan = defineString("LINE_PLAN", {
  default: "communication", // 'communication' | 'light' | 'standard'
});

interface ShiftRequestData {
  staffId: string;
  date: string; // YYYY-MM-DD
  start?: string; // HH:MM (optional)
  end?: string; // HH:MM (optional)
}

interface CreateShiftRequestRequest {
  requests: ShiftRequestData[];
}

interface CreateShiftRequestResponse {
  success: boolean;
  requestIds?: string[];
  message?: string;
  error?: string;
}

/**
 * 希望シフト要請を作成する関数（管理者用）
 * 
 * リクエスト:
 * - requests: [{ staffId: string, date: string, start?: string, end?: string }]
 * 
 * レスポンス:
 * - success: 成功フラグ
 * - requestIds: 作成された要請のID配列
 * - message: 成功メッセージ
 * - error: エラーメッセージ
 */
export const createShiftRequest = onCall(
  async (request): Promise<CreateShiftRequestResponse> => {
    // プランチェック: コミュニケーションプランの場合は機能を無効化
    if (linePlan.value() === 'communication') {
      throw new HttpsError(
        'permission-denied',
        'シフト要請機能はライトプラン以上で利用可能です。'
      );
    }

    // 認証チェック（一時的に無効化）
    // if (!request.auth) {
    //   throw new Error("Authentication required.");
    // }

    const { requests } = request.data as CreateShiftRequestRequest;

    if (!requests || !Array.isArray(requests) || requests.length === 0) {
      throw new Error("要請データが必要です。");
    }

    try {
      // 管理者権限の確認（簡易版 - 後で適切な管理者チェックに変更）
      // TODO: 管理者権限の適切な確認を実装

      const db = admin.firestore();
      const now = new Date();
      
      // JST（日本時間）で日付を計算
      const jstOffset = 9 * 60; // JST = UTC+9
      const jstDate = new Date(now.getTime() + jstOffset * 60000);
      const requestedAt = jstDate;
      
      // 要請を出した日の次月の1日0:00（JST）を期限とする
      const nextMonth = new Date(jstDate.getFullYear(), jstDate.getMonth() + 1, 1);
      nextMonth.setHours(0, 0, 0, 0);
      const expiresAt = admin.firestore.Timestamp.fromDate(nextMonth);

      const requestIds: string[] = [];
      const notificationPromises: Promise<boolean>[] = [];

      for (const req of requests) {
        const { staffId, date, start, end } = req;

        if (!staffId || !date) {
          throw new Error("スタッフIDと日付は必須です。");
        }

        // スタッフ情報を取得
        const staffDoc = await db.collection("staffs").doc(staffId).get();
        if (!staffDoc.exists) {
          throw new Error(`スタッフID ${staffId} が見つかりません。`);
        }

        const staffData = staffDoc.data();
        const staffName = staffData?.fullName || "不明";

        // 要請ドキュメントを作成
        const requestData = {
          staffId,
          staffName,
          date,
          start: start || null,
          end: end || null,
          status: "pending", // pending, confirmed, declined, expired
          requestedAt: admin.firestore.FieldValue.serverTimestamp(),
          requestedAtJST: admin.firestore.Timestamp.fromDate(requestedAt),
          expiresAt,
          confirmedAt: null,
          declinedAt: null,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        };

        const requestRef = await db.collection("shiftRequests").add(requestData);
        requestIds.push(requestRef.id);

        // LINE通知を送信（ボタン付きメッセージ）
        const formattedDate = formatDateToJapanese(date);
        let messageText: string;
        
        if (start && end) {
          messageText = `希望シフト申請\n\n${formattedDate} ${start}〜${end}のシフト要請が届きました。確認してください。`;
        } else if (start) {
          messageText = `希望シフト申請\n\n${formattedDate} ${start}からのシフト要請が届きました。確認してください。`;
        } else {
          messageText = `希望シフト申請\n\n${formattedDate}のシフト要請が届きました。確認してください。`;
        }

        // LIFF URLを構築（シフト申請ページへの遷移用）
        // スタッフ用LIFF ID: 2008640140-kWpQ25Jp
        const liffUrl = `https://liff.line.me/2008640140-kWpQ25Jp#shift?requestId=${requestRef.id}&date=${date}${start ? `&start=${start}` : ''}${end ? `&end=${end}` : ''}`;
        
        const buttons = [
          {
            label: "確認する",
            action: {
              type: "uri",
              uri: liffUrl,
            },
          },
          {
            label: "辞退する",
            action: {
              type: "postback",
              data: `action=decline&requestId=${requestRef.id}`,
            },
          },
        ];

        notificationPromises.push(
          sendLineButtonMessage(staffId, messageText, buttons)
        );
      }

      // 通知送信（非同期、エラー時も処理は続行）
      Promise.all(notificationPromises).catch((error) => {
        console.error("通知送信エラー（処理は完了）:", error);
      });

      return {
        success: true,
        requestIds,
        message: `${requests.length}件の要請を作成しました。`,
      };

    } catch (error) {
      console.error("希望シフト要請作成エラー:", error);

      if (error instanceof Error) {
        throw new Error(`要請の作成に失敗しました: ${error.message}`);
      } else {
        throw new Error("要請の作成に失敗しました。");
      }
    }
  }
);

