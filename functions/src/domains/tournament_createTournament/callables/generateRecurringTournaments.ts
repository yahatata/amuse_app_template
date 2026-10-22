/**
 * 定期開催トーナメント自動生成（Callable）
 *
 * 有効な tournamentRecurrences について、最後に生成されたトーナメント以降〜3ヶ月先までを生成する。
 * 手動実行用。定期実行は generateRecurringTournamentsByScheduler を使用。
 */

import { onCall } from "firebase-functions/v2/https";
import { runGenerateRecurringTournaments } from "../services/generateRecurringTournamentsCore";

export const generateRecurringTournaments = onCall(async () => {
  const result = await runGenerateRecurringTournaments();
  return result;
});
