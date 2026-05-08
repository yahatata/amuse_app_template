import { logOpsError, logOpsSuccess } from "../../../shared/logging/logOpsError";
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
    const result = await runEnqueueTournamentTasks({
      rangeStartAt: input.rangeStartAt,
      rangeEndAt: input.rangeEndAt,
    });
    logOpsSuccess({
      message: "スケジューラ経由の enqueue タスクが完了しました",
      functionEntry: "enqueueTournamentTasksByScheduler",
      operation: "runEnqueueSchedulerTask",
      context: {
        rangeStartAt: input.rangeStartAt,
        rangeEndAt: input.rangeEndAt,
        processedCount: result.processedCount,
        enqueuedCount: result.enqueuedCount,
        success: result.success,
        ...(result.errors && result.errors.length > 0
          ? { errorCount: result.errors.length }
          : {}),
      },
    });
    return result;
  } catch (error) {
    logOpsError({
      message: "enqueueTournamentTasksByScheduler task execution failed",
      functionEntry: "enqueueTournamentTasksByScheduler",
      operation: "runEnqueueSchedulerTask",
      cause: error,
    });
    throw error;
  }
}
