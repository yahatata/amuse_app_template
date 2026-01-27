import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { assertAdminDevice } from "./helpers";
import { upsertBusinessHoursForMonth } from "./businessHoursCore";

const db = admin.firestore();

interface InitBusinessHoursForMonthRequest {
  yearMonth: string; // YYYY-MM
  installationId: string;
  days: Array<{
    day: number; // 1-31
    openMinute: number;
    closeMinute: number;
    isClosed: boolean;
    styleId?: string;    // 追加
    source?: "auto" | "manual";  // 追加
  }>;
}

/**
 * 営業時間を月単位で初期化・更新
 * - businessHoursMonthly/{YYYY-MM}/days/{DD} をSSoTとして upsert
 * - businessHoursMonthlyMap/{YYYY-MM} を再生成
 */
export const initBusinessHoursForMonth = onCall(
  async (request): Promise<{ success: boolean; message: string }> => {
    // 認証チェック
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "認証が必要です");
    }

    const { yearMonth, installationId, days } = request.data as InitBusinessHoursForMonthRequest;

    // バリデーション
    if (!yearMonth || !/^\d{4}-\d{2}$/.test(yearMonth)) {
      throw new HttpsError("invalid-argument", "yearMonth must be in YYYY-MM format");
    }

    if (!installationId) {
      throw new HttpsError("invalid-argument", "installationId is required");
    }

    if (!Array.isArray(days) || days.length === 0) {
      throw new HttpsError("invalid-argument", "days array is required and must not be empty");
    }

    // 管理者デバイス権限確認
    await assertAdminDevice(installationId, request.auth.uid);

    // 日付のバリデーション
    for (const day of days) {
      if (day.day < 1 || day.day > 31) {
        throw new HttpsError("invalid-argument", `Invalid day: ${day.day}. Must be 1-31`);
      }
      if (day.openMinute < 0 || day.openMinute >= 1440) {
        throw new HttpsError("invalid-argument", `Invalid openMinute: ${day.openMinute}`);
      }
      // 深夜跨ぎ対応: closeMinute > 1440 を許可
      if (day.closeMinute < 0) {
        throw new HttpsError("invalid-argument", `Invalid closeMinute: ${day.closeMinute}`);
      }
      // 60分刻みの検証
      if (day.openMinute % 60 !== 0 || day.closeMinute % 60 !== 0) {
        throw new HttpsError("invalid-argument", "openMinute and closeMinute must be multiples of 60");
      }
      if (day.openMinute >= day.closeMinute && !day.isClosed) {
        throw new HttpsError(
          "invalid-argument",
          `openMinute (${day.openMinute}) must be less than closeMinute (${day.closeMinute}) when not closed`
        );
      }
    }

    // 共通ロジックを使用して営業時間を更新
    const batch = await upsertBusinessHoursForMonth(db, yearMonth, days);
    await batch.commit();

    return {
      success: true,
      message: `Business hours initialized for ${yearMonth} (${days.length} days)`,
    };
  }
);
