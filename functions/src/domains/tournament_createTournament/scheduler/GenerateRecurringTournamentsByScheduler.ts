import { logOpsError, logOpsSuccess } from "../../../shared/logging/logOpsError";
import {
  runGenerateRecurringTournaments,
  type GenerateRecurringTournamentsResult,
} from "../services/generateRecurringTournamentsCore";

export interface GenerateRecurringTournamentsBySchedulerInput {
  evaluationDate: string;
  windowEndDate: string;
}

export async function runGenerateRecurringTournamentsBySchedulerTask(
  input: GenerateRecurringTournamentsBySchedulerInput
): Promise<GenerateRecurringTournamentsResult> {
  try {
    const result = await runGenerateRecurringTournaments({
      evaluationDate: input.evaluationDate,
      windowEndDate: input.windowEndDate,
    });
    logOpsSuccess({
      message: 'generateRecurringTournamentsByScheduler 成功',
      functionEntry: 'generateRecurringTournamentsByScheduler',
      context: {
        evaluationDate: input.evaluationDate,
        windowEndDate: input.windowEndDate,
        generatedCount: result.generatedCount,
        success: result.success,
      },
    });
    return result;
  } catch (error) {
    logOpsError({
      message: "generateRecurringTournamentsByScheduler task execution failed",
      functionEntry: "generateRecurringTournamentsByScheduler",
      cause: error,
      context: {
        evaluationDate: input.evaluationDate,
        windowEndDate: input.windowEndDate,
      },
    });
    throw error;
  }
}
