import { logOpsError, logOpsInfo, logOpsSuccess } from "../../../shared/logging/logOpsError";
import { getPayrollConfig } from "../../../shared/config/payrollConfigLoader";
import { getRegionalTaskQueue } from "../../../shared/tasks/getRegionalTaskQueue";
import {
  buildSchedulerChildExecutionMetadata,
  type SchedulerTaskDispatchParentContext,
} from "../../scheduler/supervisor/schedulerCorrelation";
import { writeSchedulerTaskDispatchLogFromParentBestEffort } from "../../scheduler/supervisor/schedulerTaskDispatchLogs";

const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const PROCESS_PAYROLL_NOTIFICATIONS_FUNCTION_ENTRY = "processPayrollNotifications";

export interface PayrollNotificationSchedulerTaskInput {
  targetDate: string;
  schedulerParent?: SchedulerTaskDispatchParentContext;
}

export interface PayrollNotificationSchedulerTaskResult {
  notificationHour: number;
  scheduleTimeUtc: string;
}

function isTaskAlreadyExistsError(error: unknown): boolean {
  const err = error as {code?: unknown; message?: unknown};
  const code = typeof err?.code === "string" ? err.code : String(err?.code ?? "");
  const message = typeof err?.message === "string" ? err.message : "";

  return (
    code === "6" ||
    code === "functions/task-already-exists" ||
    message.includes("ALREADY_EXISTS") ||
    message.includes("task-already-exists")
  );
}

function buildPayrollChildUnitKey(targetDate: string): string {
  return `${PROCESS_PAYROLL_NOTIFICATIONS_FUNCTION_ENTRY}:${targetDate}`;
}

function buildScheduleDateFromTargetDateAndHour(
  targetDate: string,
  notificationHour: number
): Date {
  if (!DATE_KEY_PATTERN.test(targetDate)) {
    throw new Error(`Invalid targetDate: ${targetDate}`);
  }
  if (
    typeof notificationHour !== "number" ||
    !Number.isInteger(notificationHour) ||
    notificationHour < 0 ||
    notificationHour > 23
  ) {
    throw new Error(`Invalid notificationHour: ${notificationHour}`);
  }

  const [yearStr, monthStr, dayStr] = targetDate.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);

  const utcMillis = Date.UTC(year, month - 1, day, notificationHour, 0, 0, 0) -
    9 * 60 * 60 * 1000;
  return new Date(utcMillis);
}

export async function runPayrollNotificationSchedulerTask(
  input: PayrollNotificationSchedulerTaskInput
): Promise<PayrollNotificationSchedulerTaskResult> {
  let notificationHour: number | undefined;
  let scheduleTimeUtc: string | undefined;

  try {
    logOpsInfo({
      message: "payrollNotificationScheduler start",
      functionEntry: "payrollNotificationScheduler",
      operation: "start",
      context: {targetDate: input.targetDate},
    });

    const payrollConfig = await getPayrollConfig();
    notificationHour = payrollConfig.schedulerNotificationHour;

    const scheduleUtc = buildScheduleDateFromTargetDateAndHour(
      input.targetDate,
      notificationHour
    );
    scheduleTimeUtc = scheduleUtc.toISOString();

    const queue = getRegionalTaskQueue("processPayrollNotifications");
    await queue.enqueue(
      {
        targetDate: input.targetDate,
        ...(input.schedulerParent ?
          buildSchedulerChildExecutionMetadata(
            input.schedulerParent,
            PROCESS_PAYROLL_NOTIFICATIONS_FUNCTION_ENTRY,
            buildPayrollChildUnitKey(input.targetDate)
          ) :
          {}),
      },
      {
        id: `payroll-notification-${input.targetDate}-${notificationHour}`,
        scheduleTime: scheduleUtc,
        dispatchDeadlineSeconds: 300,
      }
    );
    if (input.schedulerParent) {
      await writeSchedulerTaskDispatchLogFromParentBestEffort(input.schedulerParent, {
        childFunctionEntry: PROCESS_PAYROLL_NOTIFICATIONS_FUNCTION_ENTRY,
        childUnitKey: buildPayrollChildUnitKey(input.targetDate),
        childScheduledAt: scheduleUtc.toISOString(),
        childTargetSummary: {
          targetDate: input.targetDate,
          notificationHour,
        },
        eventType: "enqueued",
        context: {
          taskId: `payroll-notification-${input.targetDate}-${notificationHour}`,
        },
      });
    }
    logOpsSuccess({
  message: "payrollNotificationScheduler 成功",
  functionEntry: "payrollNotificationScheduler",
  operation: "enqueue",
  context: {
    targetDate: input.targetDate,
    ...(notificationHour !== undefined && {notificationHour}),
    ...(scheduleTimeUtc !== undefined && {scheduleTimeUtc}),
  },
});


    return {
      notificationHour,
      scheduleTimeUtc,
    };
  } catch (error) {
    if (input.schedulerParent && scheduleTimeUtc !== undefined) {
      await writeSchedulerTaskDispatchLogFromParentBestEffort(input.schedulerParent, {
        childFunctionEntry: PROCESS_PAYROLL_NOTIFICATIONS_FUNCTION_ENTRY,
        childUnitKey: buildPayrollChildUnitKey(input.targetDate),
        childScheduledAt: scheduleTimeUtc,
        childTargetSummary: {
          targetDate: input.targetDate,
          ...(notificationHour !== undefined && {notificationHour}),
        },
        eventType: isTaskAlreadyExistsError(error) ? "skip" : "error",
        reason:
          isTaskAlreadyExistsError(error) ?
            "task_already_exists" :
            error instanceof Error ? error.message : String(error),
        context: {
          taskId:
            notificationHour !== undefined ?
              `payroll-notification-${input.targetDate}-${notificationHour}` :
              null,
        },
      });
    }
    logOpsError({
      message: "payrollNotificationScheduler task execution failed",
      functionEntry: "payrollNotificationScheduler",
      operation: "enqueue",
      cause: error,
      context: {
        targetDate: input.targetDate,
        ...(notificationHour !== undefined && {notificationHour}),
        ...(scheduleTimeUtc !== undefined && {scheduleTimeUtc}),
      },
    });
    throw error;
  }
}
