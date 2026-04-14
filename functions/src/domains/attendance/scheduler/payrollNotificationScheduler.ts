import { logOpsError } from "../../../shared/logging/logOpsError";
import { getPayrollConfig } from "../../../shared/config/payrollConfigLoader";
import { getRegionalTaskQueue } from "../../../shared/tasks/getRegionalTaskQueue";

const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export interface PayrollNotificationSchedulerTaskInput {
  targetDate: string;
}

export interface PayrollNotificationSchedulerTaskResult {
  notificationHour: number;
  scheduleTimeUtc: string;
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
      },
      {
        id: `payroll-notification-${input.targetDate}-${notificationHour}`,
        scheduleTime: scheduleUtc,
        dispatchDeadlineSeconds: 300,
      }
    );

    return {
      notificationHour,
      scheduleTimeUtc,
    };
  } catch (error) {
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
