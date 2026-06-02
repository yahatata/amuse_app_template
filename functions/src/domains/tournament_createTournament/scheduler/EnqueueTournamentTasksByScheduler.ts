import { logger } from "firebase-functions";
import { logOpsError, logOpsInfo, logOpsSuccess } from "../../../shared/logging/logOpsError";
import {
  runEnqueueTournamentTasks,
  type RunEnqueueResult,
} from "../services/enqueueTournamentTasksCore";
import type { SchedulerTaskDispatchParentContext } from "../../scheduler/supervisor/schedulerCorrelation";

export interface EnqueueTournamentTasksBySchedulerInput {
  rangeStartAt: string;
  rangeEndAt: string;
  schedulerParent?: SchedulerTaskDispatchParentContext;
}

export async function runEnqueueTournamentTasksBySchedulerTask(
  input: EnqueueTournamentTasksBySchedulerInput
): Promise<RunEnqueueResult> {
  logOpsInfo({
    message: "enqueueTournamentTasksByScheduler start",
    functionEntry: "enqueueTournamentTasksByScheduler",
    operation: "start",
    context: {
      rangeStartAt: input.rangeStartAt,
      rangeEndAt: input.rangeEndAt,
    },
  });

  try {
    const result = await runEnqueueTournamentTasks({
      rangeStartAt: input.rangeStartAt,
      rangeEndAt: input.rangeEndAt,
      schedulerParent: input.schedulerParent,
    });
    // schedulerSupervisor と同様: store config 欠落等でタスク生成を止めたときは logOpsSuccess にしない
    if (result.skippedReason) {
      logger.warn(
        "enqueueTournamentTasksByScheduler: skipped tournament task generation (store config)",
        {
          rangeStartAt: input.rangeStartAt,
          rangeEndAt: input.rangeEndAt,
          skippedReason: result.skippedReason,
          processedCount: result.processedCount,
          enqueuedCount: result.enqueuedCount,
        }
      );
      return result;
    }

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
