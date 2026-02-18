/**
 * 年次自動生成: 毎年1月に翌年分の営業時間を自動生成
 * - トリガー: 毎年1月28日 23:25 JST
 * - 処理: 翌年12ヶ月分の営業時間をスタイルから自動生成
 * - manual保護: source=="manual"の日は上書きしない（forceManualOverwrite=false）
 */

import { onSchedule } from "firebase-functions/v2/scheduler";
import * as admin from "firebase-admin";
import { upsertBusinessHoursForMonth, syncBusinessHoursToShifts } from "../services/businessHoursCore";
import { determineStyleId } from "../services/holidayHelper";
import { getBusinessHoursByStyleId } from "../services/styles";

const db = admin.firestore();

/**
 * 年次自動生成: 毎年1月に翌年分の営業時間を自動生成
 * - onSchedule は installationId 認可なし（内部信頼実行）
 * - manual保護（source=="manual"は上書きしない）を必ず守る
 */
export const scheduleGenerateNextYearBusinessHours = onSchedule(
  {
    schedule: '25 23 28 1 *', // 毎年1月28日 23:25 JST
    timeZone: 'Asia/Tokyo',
    timeoutSeconds: 540, // v2の最大値（12ヶ月分の処理に対応）
    memory: '512MiB', // メモリも調整（必要に応じて）
  },
  async (event) => {
    try {
      console.log('=== 翌年分の営業時間自動生成開始 ===');

      // 「翌年」を計算（実行年の次の年）
      const now = new Date();
      const currentYear = now.getFullYear();
      const nextYear = currentYear + 1;

      console.log(`対象年: ${nextYear}年`);

      // 12ヶ月分を順番に処理
      for (let month = 1; month <= 12; month++) {
        const yearMonth = `${nextYear}-${String(month).padStart(2, "0")}`;
        console.log(`処理中: ${yearMonth}`);

        try {
          // 年月の日数を計算
          const daysInMonth = new Date(nextYear, month, 0).getDate();

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

            // 既存データで source=="manual" かチェック（manual保護）
            const existingDay = existingDaysMap[dayStr];
            if (existingDay?.source === "manual") {
              // manual保護: スキップ
              continue;
            }

            // JSTの年月日をUTCとして扱う（japanese-holidaysはUTC日付部分を見るため）
            const date = new Date(Date.UTC(nextYear, month - 1, day, 0, 0, 0));

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

            console.log(`✓ ${yearMonth}: ${days.length}日分を生成`);
          } else {
            console.log(`- ${yearMonth}: 更新対象なし（すべてmanual）`);
          }
        } catch (monthError) {
          console.error(`エラー: ${yearMonth} の処理に失敗`, monthError);
          // 月ごとのエラーはログに記録するが、処理は継続
        }
      }

      console.log('=== 翌年分の営業時間自動生成完了 ===');
    } catch (error) {
      console.error('=== 翌年分の営業時間自動生成エラー ===', error);
      throw error;
    }
  }
);
