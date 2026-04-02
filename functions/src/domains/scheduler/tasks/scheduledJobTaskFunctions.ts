import { onTaskDispatched, type TaskQueueFunction } from "firebase-functions/v2/tasks";
import {
  SCHEDULED_JOB_QUEUE_BY_KEY,
  SCHEDULED_JOB_TASKS_REGION,
} from "../../../shared/config/cloudTasksConfig";
import { executeScheduledJobTask } from "./scheduledJobTaskExecutors";

const SCHEDULED_JOB_TASK_OPTIONS = {
  region: SCHEDULED_JOB_TASKS_REGION,
  retryConfig: {maxAttempts: 3, minBackoffSeconds: 10, maxBackoffSeconds: 300},
  rateLimits: {maxConcurrentDispatches: 20},
  timeoutSeconds: 540,
  memory: "512MiB" as const,
};

const weeklyPlannerTask = onTaskDispatched(
  SCHEDULED_JOB_TASK_OPTIONS,
  async (request) => {
    await executeScheduledJobTask("weeklyPlanner", request.data);
  }
);

const enqueueTournamentTasksTask = onTaskDispatched(
  SCHEDULED_JOB_TASK_OPTIONS,
  async (request) => {
    await executeScheduledJobTask("enqueueTournamentTasksByScheduler", request.data);
  }
);

const generateRecurringTournamentsTask = onTaskDispatched(
  SCHEDULED_JOB_TASK_OPTIONS,
  async (request) => {
    await executeScheduledJobTask(
      "generateRecurringTournamentsByScheduler",
      request.data
    );
  }
);

const scheduledCleanupTask = onTaskDispatched(
  SCHEDULED_JOB_TASK_OPTIONS,
  async (request) => {
    await executeScheduledJobTask("scheduledCleanup", request.data);
  }
);

const scheduleGenerateNextYearBusinessHoursTask = onTaskDispatched(
  SCHEDULED_JOB_TASK_OPTIONS,
  async (request) => {
    await executeScheduledJobTask(
      "scheduleGenerateNextYearBusinessHours",
      request.data
    );
  }
);

const payrollNotificationSchedulerTask = onTaskDispatched(
  SCHEDULED_JOB_TASK_OPTIONS,
  async (request) => {
    await executeScheduledJobTask("payrollNotificationScheduler", request.data);
  }
);

export const scheduledJobTaskFunctionsByQueueName: Record<
  string,
  TaskQueueFunction
> = {
  [SCHEDULED_JOB_QUEUE_BY_KEY.weeklyPlanner]: weeklyPlannerTask,
  [SCHEDULED_JOB_QUEUE_BY_KEY.enqueueTournamentTasksByScheduler]:
    enqueueTournamentTasksTask,
  [SCHEDULED_JOB_QUEUE_BY_KEY.generateRecurringTournamentsByScheduler]:
    generateRecurringTournamentsTask,
  [SCHEDULED_JOB_QUEUE_BY_KEY.scheduledCleanup]: scheduledCleanupTask,
  [SCHEDULED_JOB_QUEUE_BY_KEY.scheduleGenerateNextYearBusinessHours]:
    scheduleGenerateNextYearBusinessHoursTask,
  [SCHEDULED_JOB_QUEUE_BY_KEY.payrollNotificationScheduler]:
    payrollNotificationSchedulerTask,
};

function registerByHyphenPath(
  target: Record<string, unknown>,
  hyphenPath: string,
  taskFunction: TaskQueueFunction
): void {
  const segments = hyphenPath.split("-").filter((segment) => segment.length > 0);
  if (segments.length === 0) {
    throw new Error(`Invalid scheduled job function name: ${hyphenPath}`);
  }

  let cursor = target;
  for (let i = 0; i < segments.length - 1; i++) {
    const key = segments[i];
    const existing = cursor[key];
    if (existing === undefined) {
      cursor[key] = {};
    } else if (typeof existing !== "object" || existing === null) {
      throw new Error(
        `Cannot register scheduled job function. Path conflict at segment "${key}".`
      );
    }
    cursor = cursor[key] as Record<string, unknown>;
  }

  const leafKey = segments[segments.length - 1];
  cursor[leafKey] = taskFunction;
}

export function registerScheduledJobTaskFunctions(
  target: Record<string, unknown>
): void {
  for (const [queueName, taskFunction] of Object.entries(
    scheduledJobTaskFunctionsByQueueName
  )) {
    registerByHyphenPath(target, queueName, taskFunction);
  }
}
