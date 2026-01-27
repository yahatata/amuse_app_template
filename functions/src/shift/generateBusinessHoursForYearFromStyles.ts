/**
 * スタイルから営業時間を年単位で自動生成
 * - 12ヶ月分を順番に処理
 * - generateBusinessHoursForMonthFromStyles と同等のコア処理を実行
 */

import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { assertAdminDevice } from "./helpers";
import { upsertBusinessHoursForMonth, syncBusinessHoursToShifts } from "./businessHoursCore";
import { determineStyleId } from "./holidayHelper";
import { getBusinessHoursByStyleId } from "./styles";

const db = admin.firestore();

interface GenerateBusinessHoursForYearFromStylesRequest {
  year: number;
  installationId: string;
  options?: {
    forceManualOverwrite?: boolean; // manual保護を無視して上書きするか
  };
}

/**
 * スタイルから営業時間を年単位で自動生成
 * - 1月〜12月を順番に処理
 * - 各月について generateBusinessHoursForMonthFromStyles と同等のコア処理を実行
 * - ⚠️ Callable内部呼び出しはしない。共通ロジック（upsertBusinessHoursForMonth, syncBusinessHoursToShifts）を直接呼び出す
 */
export const generateBusinessHoursForYearFromStyles = onCall(
  async (request): Promise<{ success: boolean; message: string; processedMonths: string[] }> => {
    // 認証チェック
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "認証が必要です");
    }

    const { year, installationId, options } = request.data as GenerateBusinessHoursForYearFromStylesRequest;

    // バリデーション
    if (!year || year < 2000 || year > 2100) {
      throw new HttpsError("invalid-argument", "year must be between 2000 and 2100");
    }

    if (!installationId) {
      throw new HttpsError("invalid-argument", "installationId is required");
    }

    // 管理者デバイス権限確認
    await assertAdminDevice(installationId, request.auth.uid);

    const forceManualOverwrite = options?.forceManualOverwrite ?? false;

    const processedMonths: string[] = [];

    // 1月〜12月を順番に処理
    for (let month = 1; month <= 12; month++) {
      const yearMonth = `${year}-${String(month).padStart(2, "0")}`;

      // 年月の日数を計算
      const daysInMonth = new Date(year, month, 0).getDate();

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

        // 既存データで source=="manual" かチェック
        const existingDay = existingDaysMap[dayStr];
        if (!forceManualOverwrite && existingDay?.source === "manual") {
          // manual保護: スキップ
          continue;
        }

        // JSTの年月日をUTCとして扱う（japanese-holidaysはUTC日付部分を見るため）
        const date = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));

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

      if (days.length > 0) {
        // 共通ロジックを使用して営業時間を更新
        const batch = await upsertBusinessHoursForMonth(db, yearMonth, days);
        await batch.commit();

        // shifts に営業時間を同期
        const syncBatch = await syncBusinessHoursToShifts(db, yearMonth);
        await syncBatch.commit();

        processedMonths.push(yearMonth);
      }
    }

    return {
      success: true,
      message: `Business hours generated for year ${year} (${processedMonths.length} months processed)`,
      processedMonths,
    };
  }
);
