/**
 * 定期開催トーナメント自動生成（Cloud Scheduler）
 *
 * 有効な tournamentRecurrences について、最後に生成されたトーナメント以降〜3ヶ月先までを生成する。
 *
 * 実行タイミング:
 * - 環境変数 RECURRING_TOURNAMENT_GENERATION_SCHEDULER_CRON で上書き可能
 * - 未設定時: 日曜 23:00 JST
 */

import { onSchedule } from "firebase-functions/v2/scheduler";
import { logger } from "firebase-functions";
import { runGenerateRecurringTournaments } from "../services/generateRecurringTournamentsCore";
import { logOpsError } from "../../../shared/logging/logOpsError";

/**
 * cron式（JST）: 環境変数 RECURRING_TOURNAMENT_GENERATION_SCHEDULER_CRON で上書き可能。
 * 未設定時は '0 23 * * 0'（日曜 23:00 JST）。
 * フォーマット: 分 時 日 月 曜日
 */
const SCHEDULE_CRON = process.env.RECURRING_TOURNAMENT_GENERATION_SCHEDULER_CRON || "0 23 * * 0";
logger.info("generateRecurringTournamentsByScheduler schedule", {
  schedule: SCHEDULE_CRON,
  source: process.env.RECURRING_TOURNAMENT_GENERATION_SCHEDULER_CRON ? "env" : "default",
});

export const generateRecurringTournamentsByScheduler = onSchedule(
  {
    schedule: SCHEDULE_CRON,
    timeZone: "Asia/Tokyo",
    timeoutSeconds: 540,
    memory: "512MiB",
  },
  async () => {
    try {
      console.log("=== 定期開催トーナメント自動生成（Scheduler）開始 ===");

      const result = await runGenerateRecurringTournaments();

      if (result.success) {
        console.log(
          `=== 定期開催トーナメント自動生成完了: ${result.generatedCount}件 ===`
        );
      } else {
        logOpsError({
          message: "=== 定期開催トーナメント自動生成エラー ===",
          failureType: "scheduled",
          functionEntry: "generateRecurringTournamentsByScheduler",
          errorMessage: result.error ?? result.message ?? "unknown",
        });
        throw new Error(result.error || result.message);
      }
    } catch (error) {
      logOpsError({
      message: '=== 定期開催トーナメント自動生成（Scheduler）エラー ===',
      failureType: 'scheduled',
      functionEntry: 'generateRecurringTournamentsByScheduler',
      cause: error,
    });
      throw error;
    }
  }
);
