/**
 * 定期開催トーナメント自動生成（Cloud Scheduler）
 *
 * 有効な tournamentRecurrences について、最後に生成されたトーナメント以降〜3ヶ月先までを生成する。
 *
 * 実行タイミング:
 * - GlobalConstants.RECURRING_TOURNAMENT_GENERATION_SCHEDULER_CRON で定義
 * - lib/globalConstant.dart を参照し、同期すること
 * - デフォルト: 日曜 23:00 JST
 */

import { onSchedule } from "firebase-functions/v2/scheduler";
import { runGenerateRecurringTournaments } from "../services/generateRecurringTournamentsCore";

/**
 * cron式（JST）: lib/globalConstant.dart の RECURRING_TOURNAMENT_GENERATION_SCHEDULER_CRON と同期すること
 * フォーマット: 分 時 日 月 曜日
 * - 0 23 * * 0 = 日曜 23:00 JST
 */
const SCHEDULE_CRON = "0 23 * * 0";

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
        console.error(
          "=== 定期開催トーナメント自動生成エラー ===",
          result.error
        );
        throw new Error(result.error || result.message);
      }
    } catch (error) {
      console.error("=== 定期開催トーナメント自動生成（Scheduler）エラー ===", error);
      throw error;
    }
  }
);
