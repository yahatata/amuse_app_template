import { logOpsError } from "../../../shared/logging/logOpsError";
import {
  runEnqueueTournamentTasks,
  type RunEnqueueResult,
} from "../services/enqueueTournamentTasksCore";

export interface EnqueueTournamentTasksBySchedulerInput {
  rangeStartAt: string;
  rangeEndAt: string;
}

export async function runEnqueueTournamentTasksBySchedulerTask(
  input: EnqueueTournamentTasksBySchedulerInput
): Promise<RunEnqueueResult> {
  try {
    return await runEnqueueTournamentTasks({
      rangeStartAt: input.rangeStartAt,
      rangeEndAt: input.rangeEndAt,
    });
  } catch (error) {
    logOpsError({
      message: "enqueueTournamentTasksByScheduler task execution failed",
      failureType: "scheduled",
      functionEntry: "enqueueTournamentTasksByScheduler",
      cause: error,
    });
    throw error;
  }
}
