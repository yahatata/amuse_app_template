import { logOpsError, logOpsInfo, logOpsSuccess } from "../../../shared/logging/logOpsError";
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
  logOpsInfo({
    message: "generateRecurringTournamentsByScheduler start",
    functionEntry: "generateRecurringTournamentsByScheduler",
    operation: "start",
    context: {
      evaluationDate: input.evaluationDate,
      windowEndDate: input.windowEndDate,
    },
  });

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
