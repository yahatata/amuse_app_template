import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { getStoreConfig } from "../../../shared/config/configLoader";
import { DEFAULT_SHIFT_SCHEDULING_START_DAY } from "../../../shared/config/defaults";
import { assertStaffExists, assertHourStep, getYearMonthFromDateKey, isInShiftSchedulingPeriod, isInsufficientDaysNotificationSent, isInsufficientDayOrTimeSlot } from "../../shift/services/helpers";

const db = admin.firestore();

interface UpdateShiftRequestRequest {
  requestId: string;
  start: string; // HH:MM
  end: string; // HH:MM
}

interface UpdateShiftRequestResponse {
  success: boolean;
  error?: string;
}

/**
 * HH:MM形式の時刻を分（minutes）に変換
 * 24:00は1440分として扱う（他の箇所と同様）
 */
function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  
  // 24:00の場合は1440分として扱う
  if (hours === 24 && minutes === 0) {
    return 1440;
  }
  
  return hours * 60 + minutes;
}

/**
 * シフト申請を修正する関数（スタッフ用）
 * 
 * リクエスト:
 * - requestId: 修正する申請のID
 * - start: 開始時刻 (HH:MM)
 * - end: 終了時刻 (HH:MM)
 * 
 * レスポンス:
 * - success: 成功フラグ
 * - error: エラーメッセージ
 * 
 * 制約:
 * - 提出期間中（期間①）のみ修正可能
 * - 期間②以降は修正不可
 */
export const updateShiftRequest = onCall(
  async (request): Promise<UpdateShiftRequestResponse> => {
    // 認証チェック
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "認証が必要です");
    }

    const staffId = request.auth.uid; // LINE User ID
    const { requestId, start, end }: UpdateShiftRequestRequest = request.data;

    // 入力バリデーション
    if (!requestId || !start || !end) {
      throw new HttpsError("invalid-argument", "申請ID、開始時刻、終了時刻が必要です。");
    }

    // 時刻形式チェック
    if (!/^\d{2}:\d{2}$/.test(start) || !/^\d{2}:\d{2}$/.test(end)) {
      throw new HttpsError("invalid-argument", "時刻形式が不正です。HH:MM形式で入力してください。");
    }

    try {
      const config = await getStoreConfig();
      const schedulingStartDay = config.shift?.schedulingStartDay ?? DEFAULT_SHIFT_SCHEDULING_START_DAY;

      // スタッフ存在確認
      await assertStaffExists(staffId);

      // スタッフ情報を取得（存在確認のみ）
      const staffDoc = await db.collection("staffs").doc(staffId).get();
      if (!staffDoc.exists) {
        throw new HttpsError("not-found", "スタッフ情報が見つかりません。");
      }

      // 申請ドキュメントを取得
      const requestRef = db.collection("shiftRequests").doc(requestId);
      const requestDoc = await requestRef.get();

      if (!requestDoc.exists) {
        throw new HttpsError("not-found", "申請が見つかりません。");
      }

      const requestData = requestDoc.data()!;

      // スタッフIDの確認（自分の申請のみ修正可能）
      if (requestData.staffId !== staffId) {
        throw new HttpsError("permission-denied", "この申請を修正する権限がありません。");
      }

      // 申請のステータス確認（pendingのみ修正可能）
      if (requestData.status !== "pending") {
        throw new HttpsError("failed-precondition", "この申請は既に処理済みのため修正できません。");
      }

      const dateKey = requestData.dateKey as string;
      const yearMonth = getYearMonthFromDateKey(dateKey);

      // ②期間（シフトを組む期間）チェック
      const isInSchedulingPeriod = isInShiftSchedulingPeriod(dateKey, schedulingStartDay);
      
      if (isInSchedulingPeriod) {
        // ②期間中: 管理者が不足日・不足時間を送信したかどうかを確認
        const notificationSent = await isInsufficientDaysNotificationSent(yearMonth);
        
        if (!notificationSent) {
          // 送信されていない場合: 提出・修正不可
          throw new HttpsError(
            "failed-precondition",
            `現在はシフトを組む期間のため、修正はできません。`
          );
        }
        
        // 送信済みの場合: 不足日・不足時間のみ修正可能
        const isInsufficient = await isInsufficientDayOrTimeSlot(dateKey);
        if (!isInsufficient) {
          throw new HttpsError(
            "failed-precondition",
            `不足日・不足時間のみ修正可能です。`
          );
        }
      }

      // 時刻を分に変換
      const startMinute = timeToMinutes(start);
      const endMinute = timeToMinutes(end);

      // 時刻の妥当性チェック
      assertHourStep(startMinute);
      assertHourStep(endMinute);

      if (startMinute >= endMinute) {
        throw new HttpsError("invalid-argument", "開始時刻は終了時刻より前である必要があります。");
      }

      // 申請を更新
      await requestRef.update({
        startMinute,
        endMinute,
        originalStartMinute: startMinute,
        originalEndMinute: endMinute,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      return {
        success: true,
      };

    } catch (error) {
      console.error("シフト申請修正エラー:", error);

      if (error instanceof HttpsError) {
        throw error;
      }

      if (error instanceof Error) {
        throw new HttpsError("internal", `シフト申請の修正に失敗しました: ${error.message}`);
      } else {
        throw new HttpsError("internal", "シフト申請の修正に失敗しました。");
      }
    }
  }
);
