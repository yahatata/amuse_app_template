import { executeScheduledJobTask } from "../../src/domains/scheduler/tasks/scheduledJobTaskExecutors";
import { SCHEDULER_TASK_PAYLOAD_SCHEMA_VERSION } from "../../src/domains/scheduler/supervisor/schedulerTaskPayload";
import { writeSchedulerExecutionLogByCloudTaskBestEffort } from "../../src/domains/scheduler/supervisor/schedulerLogs";
import { runWeeklyPlannerTask } from "../../src/domains/storeMeta/scheduler/weeklyPlanner";
import { runEnqueueTournamentTasksBySchedulerTask } from "../../src/domains/tournament_createTournament/scheduler/EnqueueTournamentTasksByScheduler";
import { runGenerateRecurringTournamentsBySchedulerTask } from "../../src/domains/tournament_createTournament/scheduler/GenerateRecurringTournamentsByScheduler";
import { runScheduledCleanupTask } from "../../src/domains/staff/scheduler/scheduledCleanup";
import { runScheduleGenerateNextYearBusinessHoursTask } from "../../src/shared/businessHours/scheduler/scheduleGenerateNextYearBusinessHours";
import { runPayrollNotificationSchedulerTask } from "../../src/domains/attendance/scheduler/payrollNotificationScheduler";
import {
  markEnqueueTournamentTasksReplanCompletedBestEffort,
  releaseEnqueueTournamentTasksReplanProcessingBestEffort,
} from "../../src/domains/scheduler/replan/enqueueTournamentTasksReplanRequest";

jest.mock("../../src/domains/scheduler/supervisor/schedulerLogs", () => ({
  writeSchedulerExecutionLogByCloudTaskBestEffort: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("../../src/domains/storeMeta/scheduler/weeklyPlanner", () => ({
  runWeeklyPlannerTask: jest.fn().mockResolvedValue({
    openTasksEnqueued: 1,
    closeTasksEnqueued: 1,
    skippedClosedDays: 0,
  }),
}));
jest.mock("../../src/domains/tournament_createTournament/scheduler/EnqueueTournamentTasksByScheduler", () => ({
  runEnqueueTournamentTasksBySchedulerTask: jest.fn().mockResolvedValue({
    success: true,
    processedCount: 3,
    enqueuedCount: 3,
  }),
}));
jest.mock("../../src/domains/tournament_createTournament/scheduler/GenerateRecurringTournamentsByScheduler", () => ({
  runGenerateRecurringTournamentsBySchedulerTask: jest.fn().mockResolvedValue({
    success: true,
    generatedCount: 0,
    message: "ok",
  }),
}));
jest.mock("../../src/domains/staff/scheduler/scheduledCleanup", () => ({
  runScheduledCleanupTask: jest.fn().mockResolvedValue({
    deletedShiftCount: 0,
  }),
}));
jest.mock("../../src/shared/businessHours/scheduler/scheduleGenerateNextYearBusinessHours", () => ({
  runScheduleGenerateNextYearBusinessHoursTask: jest.fn().mockResolvedValue({
    generatedMonthCount: 0,
    skippedMonthCount: 12,
  }),
}));
jest.mock("../../src/domains/attendance/scheduler/payrollNotificationScheduler", () => ({
  runPayrollNotificationSchedulerTask: jest.fn().mockResolvedValue({
    notificationHour: 6,
    scheduleTimeUtc: "2026-04-03T21:00:00.000Z",
  }),
}));
jest.mock("../../src/domains/scheduler/replan/enqueueTournamentTasksReplanRequest", () => ({
  markEnqueueTournamentTasksReplanCompletedBestEffort: jest.fn().mockResolvedValue(undefined),
  releaseEnqueueTournamentTasksReplanProcessingBestEffort: jest.fn().mockResolvedValue(undefined),
}));

function buildBasePayload(jobKey: string): Record<string, unknown> {
  return {
    schemaVersion: SCHEDULER_TASK_PAYLOAD_SCHEMA_VERSION,
    jobKey,
    plannedRunAt: "2026-04-03T20:00:00.000Z",
    planningDate: "2026-04-04",
    idempotencyKey: `${jobKey}:2026-04-03T20:00:00.000Z`,
    supervisorRunId: "supervisor_20260403T180000Z_abcdef12",
    scheduleFingerprint: "fingerprint123",
    projectId: "test-project",
    enqueuedAt: "2026-04-03T18:00:00.000Z",
  };
}

describe("scheduledJobTaskExecutors", () => {
  const mockWriteExecutionLog = writeSchedulerExecutionLogByCloudTaskBestEffort as jest.MockedFunction<
    typeof writeSchedulerExecutionLogByCloudTaskBestEffort
  >;
  const mockRunWeeklyPlannerTask = runWeeklyPlannerTask as jest.MockedFunction<
    typeof runWeeklyPlannerTask
  >;
  const mockRunEnqueue = runEnqueueTournamentTasksBySchedulerTask as jest.MockedFunction<
    typeof runEnqueueTournamentTasksBySchedulerTask
  >;
  const mockRunGenerateRecurring = runGenerateRecurringTournamentsBySchedulerTask as jest.MockedFunction<
    typeof runGenerateRecurringTournamentsBySchedulerTask
  >;
  const mockRunScheduledCleanup = runScheduledCleanupTask as jest.MockedFunction<
    typeof runScheduledCleanupTask
  >;
  const mockRunGenerateNextYearBusinessHours = runScheduleGenerateNextYearBusinessHoursTask as jest.MockedFunction<
    typeof runScheduleGenerateNextYearBusinessHoursTask
  >;
  const mockRunPayrollNotification = runPayrollNotificationSchedulerTask as jest.MockedFunction<
    typeof runPayrollNotificationSchedulerTask
  >;
  const mockMarkReplanCompleted = markEnqueueTournamentTasksReplanCompletedBestEffort as jest.MockedFunction<
    typeof markEnqueueTournamentTasksReplanCompletedBestEffort
  >;
  const mockReleaseReplan = releaseEnqueueTournamentTasksReplanProcessingBestEffort as jest.MockedFunction<
    typeof releaseEnqueueTournamentTasksReplanProcessingBestEffort
  >;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("weeklyPlanner payload を実行して started/completed を記録する", async () => {
    const payload = {
      ...buildBasePayload("weeklyPlanner"),
      targetScope: {
        targetWeekStartDate: "2026-04-06",
      },
    };

    await executeScheduledJobTask("weeklyPlanner", payload);

    expect(mockRunWeeklyPlannerTask).toHaveBeenCalledWith({
      targetWeekStartDate: "2026-04-06",
    });
    expect(mockWriteExecutionLog).toHaveBeenCalledTimes(2);
    expect(mockWriteExecutionLog.mock.calls[0][0].eventType).toBe("started");
    expect(mockWriteExecutionLog.mock.calls[1][0].eventType).toBe("completed");
  });

  it("expected jobKey と payload.jobKey が不一致ならエラー", async () => {
    const payload = {
      ...buildBasePayload("enqueueTournamentTasksByScheduler"),
      targetScope: {
        rangeStartAt: "2026-04-03T14:00:00.000Z",
        rangeEndAt: "2026-04-17T20:00:00.000Z",
      },
    };

    await expect(
      executeScheduledJobTask("weeklyPlanner", payload)
    ).rejects.toThrow("jobKey mismatch");
    expect(mockWriteExecutionLog).toHaveBeenCalledTimes(0);
  });

  it("replan 実行時に enqueue 成功なら request を completed に更新する", async () => {
    mockRunEnqueue.mockResolvedValue({
      success: true,
      processedCount: 5,
      enqueuedCount: 4,
    });

    const payload = {
      ...buildBasePayload("enqueueTournamentTasksByScheduler"),
      supervisorRunId: "replan_2026-04-03T18:00:00.000Z",
      targetScope: {
        rangeStartAt: "2026-04-03T12:00:00.000Z",
        rangeEndAt: "2026-04-17T20:00:00.000Z",
      },
    };

    await executeScheduledJobTask("enqueueTournamentTasksByScheduler", payload);

    expect(mockMarkReplanCompleted).toHaveBeenCalledTimes(1);
    expect(mockReleaseReplan).toHaveBeenCalledTimes(0);
  });

  it("generateRecurringTournamentsByScheduler payload を正しく実行する", async () => {
    const payload = {
      ...buildBasePayload("generateRecurringTournamentsByScheduler"),
      targetScope: {
        evaluationDate: "2026-04-04",
        windowEndDate: "2026-07-04",
      },
    };

    await executeScheduledJobTask("generateRecurringTournamentsByScheduler", payload);

    expect(mockRunGenerateRecurring).toHaveBeenCalledWith({
      evaluationDate: "2026-04-04",
      windowEndDate: "2026-07-04",
    });
    expect(mockWriteExecutionLog.mock.calls[1][0].eventType).toBe("completed");
  });

  it("scheduledCleanup payload を正しく実行する", async () => {
    const payload = {
      ...buildBasePayload("scheduledCleanup"),
      targetScope: {
        cutoffDate: "2026-03-28",
      },
    };

    await executeScheduledJobTask("scheduledCleanup", payload);

    expect(mockRunScheduledCleanup).toHaveBeenCalledWith({
      cutoffDate: "2026-03-28",
    });
    expect(mockWriteExecutionLog.mock.calls[1][0].eventType).toBe("completed");
  });

  it("scheduleGenerateNextYearBusinessHours payload を正しく実行する", async () => {
    const payload = {
      ...buildBasePayload("scheduleGenerateNextYearBusinessHours"),
      targetScope: {
        targetYear: 2027,
      },
    };

    await executeScheduledJobTask(
      "scheduleGenerateNextYearBusinessHours",
      payload
    );

    expect(mockRunGenerateNextYearBusinessHours).toHaveBeenCalledWith({
      targetYear: 2027,
    });
    expect(mockWriteExecutionLog.mock.calls[1][0].eventType).toBe("completed");
  });

  it("payrollNotificationScheduler payload を正しく実行する", async () => {
    const payload = {
      ...buildBasePayload("payrollNotificationScheduler"),
      targetScope: {
        targetDate: "2026-04-04",
      },
    };

    await executeScheduledJobTask("payrollNotificationScheduler", payload);

    expect(mockRunPayrollNotification).toHaveBeenCalledWith({
      targetDate: "2026-04-04",
    });
    expect(mockWriteExecutionLog.mock.calls[1][0].eventType).toBe("completed");
  });

  it("replan 実行時に enqueue 失敗なら request を release して error を記録する", async () => {
    mockRunEnqueue.mockResolvedValue({
      success: false,
      processedCount: 5,
      enqueuedCount: 3,
      errors: [{ tournamentId: "t1", error: "enqueue failed" }],
    });

    const payload = {
      ...buildBasePayload("enqueueTournamentTasksByScheduler"),
      supervisorRunId: "replan_2026-04-03T18:00:00.000Z",
      targetScope: {
        rangeStartAt: "2026-04-03T12:00:00.000Z",
        rangeEndAt: "2026-04-17T20:00:00.000Z",
      },
    };

    await expect(
      executeScheduledJobTask("enqueueTournamentTasksByScheduler", payload)
    ).rejects.toThrow("enqueueTournamentTasksByScheduler failed");

    expect(mockMarkReplanCompleted).toHaveBeenCalledTimes(0);
    expect(mockReleaseReplan).toHaveBeenCalledTimes(1);
    expect(mockWriteExecutionLog).toHaveBeenCalledTimes(2);
    expect(mockWriteExecutionLog.mock.calls[0][0].eventType).toBe("started");
    expect(mockWriteExecutionLog.mock.calls[1][0].eventType).toBe("error");
  });
});
