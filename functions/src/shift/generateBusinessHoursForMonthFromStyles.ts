/**
 * スタイルから営業時間を月単位で自動生成
 * - 祝日判定 + 曜日判定で styleId を決定
 * - businessHoursMonthly と businessHoursMonthlyMap を更新
 * - shifts に営業時間を同期
 */

import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { assertAdminDevice } from "./helpers";
import { upsertBusinessHoursForMonth, syncBusinessHoursToShifts } from "./businessHoursCore";
import { determineStyleId } from "./holidayHelper";
import { getBusinessHoursByStyleId } from "./styles";

const db = admin.firestore();

interface GenerateBusinessHoursForMonthFromStylesRequest {
  yearMonth: string; // YYYY-MM
  installationId: string;
  options?: {
    forceManualOverwrite?: boolean; // manual保護を無視して上書きするか
  };
}

/**
 * スタイルから営業時間を月単位で自動生成
 * - 対象月の全日を列挙
 * - 祝日判定 + 曜日判定で styleId を決定
 * - source=="manual" の日はスキップ（forceManualOverwrite=true を除く）
 * - businessHoursMonthly と businessHoursMonthlyMap を更新
 * - shifts に営業時間を同期
 */
export const generateBusinessHoursForMonthFromStyles = onCall(
  async (request): Promise<{ success: boolean; message: string }> => {
    // 認証チェック
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "認証が必要です");
    }

    const { yearMonth, installationId, options } = request.data as GenerateBusinessHoursForMonthFromStylesRequest;

    // バリデーション
    if (!yearMonth || !/^\d{4}-\d{2}$/.test(yearMonth)) {
      throw new HttpsError("invalid-argument", "yearMonth must be in YYYY-MM format");
    }

    if (!installationId) {
      throw new HttpsError("invalid-argument", "installationId is required");
    }

    // 管理者デバイス権限確認
    await assertAdminDevice(installationId, request.auth.uid);

    const forceManualOverwrite = options?.forceManualOverwrite ?? false;

    // 年月の日数を計算
    const [year, month] = yearMonth.split("-").map(Number);
    const daysInMonth = new Date(year, month, 0).getDate(); // 0日目 = 前月末日

    // 既存のmanual設定を確認するため、businessHoursMonthlyMap を取得
    const mapDoc = await db.collection("businessHoursMonthlyMap").doc(yearMonth).get();
    const existingDaysMap = mapDoc.exists && mapDoc.data()?.days 
      ? mapDoc.data()!.days as Record<string, { source?: "auto" | "manual" }>
      : {};

    // 営業時間データを生成
    const days: Array<{
      day: number;
      openMinute: number;
      closeMinute: number;
      isClosed: boolean;
      styleId: string;
      source: "auto";
    }> = [];

      for (let day = 1; day <= daysInMonth; day++) {
        const dayStr = day.toString().padStart(2, "0");
        // JSTの年月日をUTCとして扱う（japanese-holidaysはUTC日付部分を見るため）
        const date = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));

      // 既存データで source=="manual" かチェック
      const existingDay = existingDaysMap[dayStr];
      if (!forceManualOverwrite && existingDay?.source === "manual") {
        // manual保護: スキップ
        continue;
      }

      // スタイルIDを決定
      const styleId = determineStyleId(date);

      // スタイルから営業時間を取得
      const style = getBusinessHoursByStyleId(styleId);

      days.push({
        day,
        openMinute: style.openMinute,
        closeMinute: style.closeMinute,
        isClosed: style.isClosed,
        styleId: style.styleId,
        source: "auto",
      });
    }

    if (days.length === 0) {
      return {
        success: true,
        message: `No days to update for ${yearMonth} (all days are manual and forceManualOverwrite is false)`,
      };
    }

    // 共通ロジックを使用して営業時間を更新
    const batch = await upsertBusinessHoursForMonth(db, yearMonth, days);
    await batch.commit();

    // shifts に営業時間を同期
    const syncBatch = await syncBusinessHoursToShifts(db, yearMonth);
    await syncBatch.commit();

    return {
      success: true,
      message: `Business hours generated for ${yearMonth} (${days.length} days)`,
    };
  }
);
