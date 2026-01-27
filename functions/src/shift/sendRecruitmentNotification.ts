import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { assertAdminDevice } from "./helpers";
import { sendLinePushMessage, formatDateToJapanese } from "../utils/lineMessaging";

const db = admin.firestore();

interface SendRecruitmentNotificationRequest {
  yearMonth: string; // YYYY-MM
  installationId: string;
}

/**
 * 募集内容を管理者にLINE送信
 * - adminDeviceのみ
 * - shiftRecruitments/{yearMonth}/days から募集内容を取得
 * - usersコレクションのrole: "admin"のアカウントにLINE送信（uidがLINE ID）
 * - 送信成功時にshifts/{yearMonth}.insufficientDaysNotificationSent = trueを設定
 */
export const sendRecruitmentNotification = onCall(
  async (request): Promise<{ success: boolean; message: string; sentCount: number }> => {
    // 認証チェック
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "認証が必要です");
    }

    const { yearMonth, installationId } = request.data as SendRecruitmentNotificationRequest;

    // バリデーション
    if (!yearMonth || !/^\d{4}-\d{2}$/.test(yearMonth)) {
      throw new HttpsError("invalid-argument", "yearMonth must be in YYYY-MM format");
    }

    if (!installationId) {
      throw new HttpsError("invalid-argument", "installationId is required");
    }

    // 管理者デバイス権限確認
    await assertAdminDevice(installationId, request.auth.uid);

    // 募集内容を取得
    const recruitmentsSnapshot = await db
      .collection("shiftRecruitments")
      .doc(yearMonth)
      .collection("days")
      .get();

    if (recruitmentsSnapshot.empty) {
      throw new HttpsError("failed-precondition", "募集内容が見つかりませんでした。先に募集を作成してください。");
    }

    // 日付ごとに募集時間帯をまとめる
    const recruitmentsByDate = new Map<string, Array<{ startMinute: number; endMinute: number }>>();
    
    for (const doc of recruitmentsSnapshot.docs) {
      const data = doc.data();
      const dateKey = data.dateKey as string;
      const timeSlots = (data.timeSlots as Array<{ startMinute: number; endMinute: number }>) || [];
      
      if (!recruitmentsByDate.has(dateKey)) {
        recruitmentsByDate.set(dateKey, []);
      }
      recruitmentsByDate.get(dateKey)!.push(...timeSlots);
    }

    // メッセージを整形
    const formatMinutes = (minutes: number): string => {
      if (minutes === 1440) return "24:00";
      const hours = Math.floor(minutes / 60);
      const mins = minutes % 60;
      return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
    };

    let message = `【募集時間帯のお知らせ】\n\n${yearMonth}の募集時間帯を作成しました。\n\n`;

    const sortedDates = Array.from(recruitmentsByDate.keys()).sort();
    for (const dateKey of sortedDates) {
      const slots = recruitmentsByDate.get(dateKey)!;
      const dateStr = formatDateToJapanese(dateKey);
      message += `📅 ${dateStr}\n`;
      for (const slot of slots) {
        message += `  ${formatMinutes(slot.startMinute)} - ${formatMinutes(slot.endMinute)}\n`;
      }
      message += `\n`;
    }

    message += `\n不足日・不足時間のみシフト申請が可能です。`;

    // usersコレクションからrole: "admin"のアカウントを取得
    const adminUsersSnapshot = await db
      .collection("users")
      .where("role", "==", "admin")
      .get();

    if (adminUsersSnapshot.empty) {
      throw new HttpsError("failed-precondition", "管理者アカウントが見つかりませんでした");
    }

    // 各管理者にLINE送信（uidがLINE ID）
    let sentCount = 0;
    const sendPromises = adminUsersSnapshot.docs.map(async (userDoc) => {
      const userId = userDoc.id; // uidがLINE ID
      const success = await sendLinePushMessage(userId, message);
      if (success) {
        sentCount++;
      }
      return success;
    });

    await Promise.all(sendPromises);

    // 送信成功時にshifts/{yearMonth}.insufficientDaysNotificationSent = trueを設定
    if (sentCount > 0) {
      await db.collection("shifts").doc(yearMonth).set(
        {
          insufficientDaysNotificationSent: true,
          sentAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    }

    return {
      success: true,
      message: `${sentCount}件の管理者に送信しました`,
      sentCount,
    };
  }
);
