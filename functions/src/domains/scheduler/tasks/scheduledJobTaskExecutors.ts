import type { SchedulerJobKey } from "../../../shared/config/schedulerConfigTypes";
import { logOpsError } from "../../../shared/logging/logOpsError";
import {
  assertScheduledJobTaskPayloadMatchesExpectedJobKey,
  assertValidScheduledJobTaskPayload,
  type ScheduledJobTaskPayload,
} from "../supervisor/schedulerTaskPayload";
import { writeSchedulerExecutionLogByCloudTaskBestEffort } from "../supervisor/schedulerLogs";
import { runWeeklyPlannerTask } from "../../storeMeta/scheduler/weeklyPlanner";
import { runEnqueueTournamentTasksBySchedulerTask } from "../../tournament_createTournament/scheduler/EnqueueTournamentTasksByScheduler";
import { runGenerateRecurringTournamentsBySchedulerTask } from "../../tournament_createTournament/scheduler/GenerateRecurringTournamentsByScheduler";
import { runScheduledCleanupTask } from "../../staff/scheduler/scheduledCleanup";
import { runScheduleGenerateNextYearBusinessHoursTask } from "../../../shared/businessHours/scheduler/scheduleGenerateNextYearBusinessHours";
import { runPayrollNotificationSchedulerTask } from "../../attendance/scheduler/payrollNotificationScheduler";
import {
  markEnqueueTournamentTasksReplanCompletedBestEffort,
  releaseEnqueueTournamentTasksReplanProcessingBestEffort,
} from "../replan/enqueueTournamentTasksReplanRequest";

type DecisionSnapshot = Record<string, boolean | number | string>;

interface ScheduledJobExecutionOutcome {
  eventType: "completed" | "skip";
  reason?: string;
  decisionSnapshot?: DecisionSnapshot;
}

const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isDateKey(value: unknown): value is string {
  return typeof value === "string" && DATE_KEY_PATTERN.test(value);
}

function isIsoDateTime(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function assertDateKey(value: unknown, fieldName: string): string {
  if (!isDateKey(value)) {
    throw new Error(`Invalid targetScope.${fieldName}`);
  }
  return value;
}

function assertIsoDateTime(value: unknown, fieldName: string): string {
  if (!isIsoDateTime(value)) {
    throw new Error(`Invalid targetScope.${fieldName}`);
  }
  return value;
}

function assertTargetYear(value: unknown): number {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 2000 ||
    value > 3000
  ) {
    throw new Error("Invalid targetScope.targetYear");
  }
  return value;
}

function parsePayload(
  expectedJobKey: SchedulerJobKey,
  rawPayload: unknown
): ScheduledJobTaskPayload {
  if (!isRecord(rawPayload)) {
    throw new Error("Task payload is missing");
  }

  const payload = rawPayload as unknown as ScheduledJobTaskPayload;
  assertValidScheduledJobTaskPayload(payload);
  assertScheduledJobTaskPayloadMatchesExpectedJobKey(payload, expectedJobKey);
  return payload;
}

function toErrorReason(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return String(error);
}

function isReplanExecution(payload: ScheduledJobTaskPayload): boolean {
  return (
    payload.jobKey === "enqueueTournamentTasksByScheduler" &&
    payload.supervisorRunId.startsWith("replan_")
  );
}

async function executeWeeklyPlanner(
  payload: ScheduledJobTaskPayload
): Promise<ScheduledJobExecutionOutcome> {
  const targetScope = isRecord(payload.targetScope) ?
    payload.targetScope :
    ({} as Record<string, unknown>);
  const targetWeekStartDate = assertDateKey(
    targetScope.targetWeekStartDate,
    "targetWeekStartDate"
  );

  const result = await runWeeklyPlannerTask({targetWeekStartDate});
  return {
    eventType: "completed",
    decisionSnapshot: {
      openTasksEnqueued: result.openTasksEnqueued,
      closeTasksEnqueued: result.closeTasksEnqueued,
      skippedClosedDays: result.skippedClosedDays,
    },
  };
}

async function executeEnqueueTournamentTasks(
  payload: ScheduledJobTaskPayload
): Promise<ScheduledJobExecutionOutcome> {
  const targetScope = isRecord(payload.targetScope) ?
    payload.targetScope :
    ({} as Record<string, unknown>);
  const rangeStartAt = assertIsoDateTime(targetScope.rangeStartAt, "rangeStartAt");
  const rangeEndAt = assertIsoDateTime(targetScope.rangeEndAt, "rangeEndAt");

  const result = await runEnqueueTournamentTasksBySchedulerTask({
    rangeStartAt,
    rangeEndAt,
  });
  if (!result.success) {
    const errorSummary = (result.errors ?? [])
      .map((error) => `${error.tournamentId}:${error.error}`)
      .join(" | ");
    throw new Error(`enqueueTournamentTasksByScheduler failed: ${errorSummary}`);
  }

  return {
    eventType: "completed",
    decisionSnapshot: {
      processedCount: result.processedCount,
      enqueuedCount: result.enqueuedCount,
    },
  };
}

async function executeGenerateRecurringTournaments(
  payload: ScheduledJobTaskPayload
): Promise<ScheduledJobExecutionOutcome> {
  const targetScope = isRecord(payload.targetScope) ?
    payload.targetScope :
    ({} as Record<string, unknown>);
  const evaluationDate = assertDateKey(targetScope.evaluationDate, "evaluationDate");
  const windowEndDate = assertDateKey(targetScope.windowEndDate, "windowEndDate");

  const result = await runGenerateRecurringTournamentsBySchedulerTask({
    evaluationDate,
    windowEndDate,
  });
  if (!result.success) {
    throw new Error(
      result.error ??
        result.message ??
        "generateRecurringTournamentsByScheduler failed"
    );
  }

  return {
    eventType: "completed",
    decisionSnapshot: {
      generatedCount: result.generatedCount,
    },
  };
}

async function executeScheduledCleanup(
  payload: ScheduledJobTaskPayload
): Promise<ScheduledJobExecutionOutcome> {
  const targetScope = isRecord(payload.targetScope) ?
    payload.targetScope :
    ({} as Record<string, unknown>);
  const cutoffDate = assertDateKey(targetScope.cutoffDate, "cutoffDate");

  const result = await runScheduledCleanupTask({cutoffDate});
  return {
    eventType: "completed",
    decisionSnapshot: {
      deletedShiftCount: result.deletedShiftCount,
    },
  };
}

async function executeGenerateNextYearBusinessHours(
  payload: ScheduledJobTaskPayload
): Promise<ScheduledJobExecutionOutcome> {
  const targetScope = isRecord(payload.targetScope) ?
    payload.targetScope :
    ({} as Record<string, unknown>);
  const targetYear = assertTargetYear(targetScope.targetYear);

  const result = await runScheduleGenerateNextYearBusinessHoursTask({targetYear});
  return {
    eventType: "completed",
    decisionSnapshot: {
      generatedMonthCount: result.generatedMonthCount,
      skippedMonthCount: result.skippedMonthCount,
    },
  };
}

async function executePayrollNotificationScheduler(
  payload: ScheduledJobTaskPayload
): Promise<ScheduledJobExecutionOutcome> {
  const targetScope = isRecord(payload.targetScope) ?
    payload.targetScope :
    ({} as Record<string, unknown>);
  const targetDate = assertDateKey(targetScope.targetDate, "targetDate");

  const result = await runPayrollNotificationSchedulerTask({targetDate});
  return {
    eventType: "completed",
    decisionSnapshot: {
      targetDate,
      notificationHour: result.notificationHour,
    },
  };
}

async function runScheduledJob(
  payload: ScheduledJobTaskPayload
): Promise<ScheduledJobExecutionOutcome> {
  switch (payload.jobKey) {
  case "weeklyPlanner":
    return executeWeeklyPlanner(payload);
  case "enqueueTournamentTasksByScheduler":
    return executeEnqueueTournamentTasks(payload);
  case "generateRecurringTournamentsByScheduler":
    return executeGenerateRecurringTournaments(payload);
  case "scheduledCleanup":
    return executeScheduledCleanup(payload);
  case "scheduleGenerateNextYearBusinessHours":
    return executeGenerateNextYearBusinessHours(payload);
  case "payrollNotificationScheduler":
    return executePayrollNotificationScheduler(payload);
  default: {
    const exhaustiveCheck: never = payload.jobKey;
    throw new Error(`Unsupported jobKey: ${String(exhaustiveCheck)}`);
  }
  }
}

export async function executeScheduledJobTask(
  expectedJobKey: SchedulerJobKey,
  rawPayload: unknown
): Promise<void> {
  const payload = parsePayload(expectedJobKey, rawPayload);

  await writeSchedulerExecutionLogByCloudTaskBestEffort({
    eventType: "started",
    isSuccess: true,
    jobKey: payload.jobKey,
    functionName: payload.jobKey,
    projectId: payload.projectId,
    idempotencyKey: payload.idempotencyKey,
    supervisorRunId: payload.supervisorRunId,
    decisionSnapshot: {
      planningDate: payload.planningDate,
      plannedRunAt: payload.plannedRunAt,
    },
  });

  try {
    const outcome = await runScheduledJob(payload);

    await writeSchedulerExecutionLogByCloudTaskBestEffort({
      eventType: outcome.eventType,
      isSuccess: true,
      reason: outcome.reason,
      jobKey: payload.jobKey,
      functionName: payload.jobKey,
      projectId: payload.projectId,
      idempotencyKey: payload.idempotencyKey,
      supervisorRunId: payload.supervisorRunId,
      decisionSnapshot: outcome.decisionSnapshot,
    });

    if (isReplanExecution(payload)) {
      await markEnqueueTournamentTasksReplanCompletedBestEffort();
    }
  } catch (error) {
    const reason = toErrorReason(error);
    await writeSchedulerExecutionLogByCloudTaskBestEffort({
      eventType: "error",
      isSuccess: false,
      reason,
      jobKey: payload.jobKey,
      functionName: payload.jobKey,
      projectId: payload.projectId,
      idempotencyKey: payload.idempotencyKey,
      supervisorRunId: payload.supervisorRunId,
    });

    if (isReplanExecution(payload)) {
      await releaseEnqueueTournamentTasksReplanProcessingBestEffort();
    }

    logOpsError({
      message: "executeScheduledJobTask failed",
      functionEntry: "executeScheduledJobTask",
      operation: "runScheduledJob",
      cause: error,
      context: {
        jobKey: payload.jobKey,
        idempotencyKey: payload.idempotencyKey,
        reason,
        supervisorRunId: payload.supervisorRunId,
        planningDate: payload.planningDate,
        plannedRunAt: payload.plannedRunAt,
      },
    });
    throw error;
  }
}
