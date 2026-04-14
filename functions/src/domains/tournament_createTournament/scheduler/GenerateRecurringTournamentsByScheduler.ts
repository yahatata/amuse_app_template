import { logOpsError } from "../../../shared/logging/logOpsError";
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
    return await runGenerateRecurringTournaments({
      evaluationDate: input.evaluationDate,
      windowEndDate: input.windowEndDate,
    });
  } catch (error) {
    logOpsError({
      message: "generateRecurringTournamentsByScheduler task execution failed",
      functionEntry: "generateRecurringTournamentsByScheduler",
      cause: error,
    });
    throw error;
  }
}
