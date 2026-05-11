/**
 * weeklyPlanner task 実行本体
 *
 * schedulerSupervisor から渡された targetWeekStartDate（JST日付キー）を起点に、
 * 7日分の開店/閉店認定 task を作成する。
 */

import { logger } from "firebase-functions";
import { logOpsError, logOpsSuccess } from "../../../shared/logging/logOpsError";
import { CloudTasksClient } from "@google-cloud/tasks";
import { getFirestore } from "firebase-admin/firestore";
import {
  OPENCLOSE_TASKS_QUEUE,
  OPENCLOSE_TASKS_REGION,
  OPENCLOSE_INVOKER_SA_PREFIX,
  buildInvokerSaEmail,
} from "../../../shared/config/cloudTasksConfig";
import { getRequiredProjectId } from "../../../shared/runtime/projectId";
import {
  getStoreConfigForExecution,
  StoreConfigDocumentMissingError,
  StoreConfigReadFailedError,
} from "../../../shared/config/configLoader";
import {
  DEFAULT_TASK_CLOSE_OFFSET_MINUTES,
  DEFAULT_TASK_OPEN_OFFSET_MINUTES,
} from "../../../shared/config/defaults";
import { getTaskEndpoints } from "../../../shared/secrets/secretManager";

const tasksClient = new CloudTasksClient();
const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export interface WeeklyPlannerTaskInput {
  targetWeekStartDate: string;
}

export interface WeeklyPlannerTaskResult {
  openTasksEnqueued: number;
  closeTasksEnqueued: number;
  skippedClosedDays: number;
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

function parseJstDateKey(dateKey: string): Date {
  if (!DATE_KEY_PATTERN.test(dateKey)) {
    throw new Error(`Invalid targetWeekStartDate: ${dateKey}`);
  }

  const [yearStr, monthStr, dayStr] = dateKey.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);
  const jstMidnightUtcMillis = Date.UTC(year, month - 1, day, 0, 0, 0, 0) - 9 * 60 * 60 * 1000;
  return new Date(jstMidnightUtcMillis);
}

function formatJstDateKey(baseUtcDate: Date): string {
  const jstDate = new Date(baseUtcDate.getTime() + 9 * 60 * 60 * 1000);
  const year = jstDate.getUTCFullYear();
  const month = String(jstDate.getUTCMonth() + 1).padStart(2, "0");
  const day = String(jstDate.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(baseUtcDate: Date, days: number): Date {
  return new Date(baseUtcDate.getTime() + days * 24 * 60 * 60 * 1000);
}

function buildScheduleTimeFromJstMinutes(
  jstDateAtMidnight: Date,
  minuteOfDay: number
): Date {
  return new Date(jstDateAtMidnight.getTime() + minuteOfDay * 60 * 1000);
}

export async function runWeeklyPlannerTask(
  input: WeeklyPlannerTaskInput
): Promise<WeeklyPlannerTaskResult> {
  let openTasksEnqueued = 0;
  let closeTasksEnqueued = 0;
  let skippedClosedDays = 0;

  try {
    let config;
    try {
      config = await getStoreConfigForExecution({
        functionEntry: "weeklyPlanner",
        operation: "loadStoreConfigForOpenCloseTaskGeneration",
        action: "stop_weekly_open_close_task_generation",
        context: {
          targetWeekStartDate: input.targetWeekStartDate,
          planningDate: input.targetWeekStartDate,
          storeConfigKeyGroup: "autoOpenClose",
        },
      });
    } catch (e) {
      if (
        e instanceof StoreConfigDocumentMissingError ||
        e instanceof StoreConfigReadFailedError
      ) {
        const reason =
          e instanceof StoreConfigDocumentMissingError ?
            "store_config_document_missing" :
            "store_config_read_error_after_retries";
        logger.warn(
          "weeklyPlanner: skipped open/close task generation because store config unavailable",
          { reason, targetWeekStartDate: input.targetWeekStartDate }
        );
        return { openTasksEnqueued, closeTasksEnqueued, skippedClosedDays };
      }
      throw e;
    }

    const projectId = getRequiredProjectId();
    if (!config.autoOpenClose?.enabled) {
      logger.info("weeklyPlanner: skipped because autoOpenClose is disabled");
      logOpsSuccess({
        message: 'weeklyPlanner 成功',
        functionEntry: 'weeklyPlanner',
        context: {
          targetWeekStartDate: input.targetWeekStartDate,
          outcome: 'skipped_auto_open_close_disabled',
          openTasksEnqueued,
          closeTasksEnqueued,
          skippedClosedDays,
        },
      });

      return {openTasksEnqueued, closeTasksEnqueued, skippedClosedDays};
    }

    const targetWeekStartDate = parseJstDateKey(input.targetWeekStartDate);

    const { closeAssessmentUrl, openAssessmentUrl } = await getTaskEndpoints();
    const tasksQueue = OPENCLOSE_TASKS_QUEUE;
    const tasksLocation = OPENCLOSE_TASKS_REGION;
    const tasksInvokerSa = buildInvokerSaEmail(
      OPENCLOSE_INVOKER_SA_PREFIX,
      projectId
    );
    const taskCloseOffsetMinutes = config.autoOpenClose?.taskCloseOffsetMinutes ??
      DEFAULT_TASK_CLOSE_OFFSET_MINUTES;
    const taskOpenOffsetMinutes = config.autoOpenClose?.taskOpenOffsetMinutes ??
      DEFAULT_TASK_OPEN_OFFSET_MINUTES;

    const db = getFirestore();
    const monthDocs = new Map<string, Record<string, unknown>>();
    const queuePath = tasksClient.queuePath(projectId, tasksLocation, tasksQueue);

    for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
      const targetDate = addDays(targetWeekStartDate, dayOffset);
      const dateKey = formatJstDateKey(targetDate);
      const yearMonth = dateKey.substring(0, 7);

      let businessHoursData = monthDocs.get(yearMonth);
      if (!businessHoursData) {
        const businessHoursDoc = await db
          .collection("businessHoursMonthlyMap")
          .doc(yearMonth)
          .get();
        if (!businessHoursDoc.exists) {
          throw new Error(`businessHoursMonthlyMap/${yearMonth} が見つかりません`);
        }
        businessHoursData = businessHoursDoc.data() as Record<string, unknown>;
        monthDocs.set(yearMonth, businessHoursData);
      }

      const dayNumber = Number(dateKey.slice(8, 10));
      const days = (businessHoursData?.days ?? {}) as Record<string, {
        isClosed?: boolean;
        openMinute?: number;
        closeMinute?: number;
      }>;
      const dayData = days[String(dayNumber)] ?? days[String(dayNumber).padStart(2, "0")];

      if (!dayData || dayData.isClosed) {
        skippedClosedDays += 1;
        continue;
      }

      const openMinute = Number(dayData.openMinute ?? 0);
      const closeMinute = Number(dayData.closeMinute ?? 0);

      const openScheduleTime = buildScheduleTimeFromJstMinutes(
        targetDate,
        openMinute + taskOpenOffsetMinutes
      );
      const closeScheduleTime = buildScheduleTimeFromJstMinutes(
        targetDate,
        closeMinute + taskCloseOffsetMinutes
      );

      const openTaskId = `open_assessment_${dateKey}`;
      const openTaskName = tasksClient.taskPath(
        projectId,
        tasksLocation,
        tasksQueue,
        openTaskId
      );
      const openTaskPayload = {
        action: "open_assessment",
        intendedBusinessDateKey: dateKey,
        scheduledAt: openScheduleTime.toISOString(),
      };

      try {
        await tasksClient.createTask({
          parent: queuePath,
          task: {
            name: openTaskName,
            httpRequest: {
              httpMethod: "POST",
              url: openAssessmentUrl,
              headers: {
                "Content-Type": "application/json",
              },
              body: Buffer.from(JSON.stringify(openTaskPayload)).toString("base64"),
              oidcToken: {
                serviceAccountEmail: tasksInvokerSa,
              },
            },
            scheduleTime: {
              seconds: Math.floor(openScheduleTime.getTime() / 1000),
            },
          },
        });
        openTasksEnqueued += 1;
      } catch (error) {
        if (isTaskAlreadyExistsError(error)) {
          logger.info("weeklyPlanner: open task already exists", {dateKey});
        } else {
          throw error;
        }
      }

      const closeTaskId = `close_assessment_${dateKey}`;
      const closeTaskName = tasksClient.taskPath(
        projectId,
        tasksLocation,
        tasksQueue,
        closeTaskId
      );
      const closeTaskPayload = {
        action: "close_assessment",
        intendedBusinessDateKey: dateKey,
        scheduledAt: closeScheduleTime.toISOString(),
      };

      try {
        await tasksClient.createTask({
          parent: queuePath,
          task: {
            name: closeTaskName,
            httpRequest: {
              httpMethod: "POST",
              url: closeAssessmentUrl,
              headers: {
                "Content-Type": "application/json",
              },
              body: Buffer.from(JSON.stringify(closeTaskPayload)).toString("base64"),
              oidcToken: {
                serviceAccountEmail: tasksInvokerSa,
              },
            },
            scheduleTime: {
              seconds: Math.floor(closeScheduleTime.getTime() / 1000),
            },
          },
        });
        closeTasksEnqueued += 1;
      } catch (error) {
        if (isTaskAlreadyExistsError(error)) {
          logger.info("weeklyPlanner: close task already exists", {dateKey});
        } else {
          throw error;
        }
      }
    }

    logOpsSuccess({
      message: 'weeklyPlanner 成功',
      functionEntry: 'weeklyPlanner',
      context: {
        targetWeekStartDate: input.targetWeekStartDate,
        openTasksEnqueued,
        closeTasksEnqueued,
        skippedClosedDays,
      },
    });

    return {openTasksEnqueued, closeTasksEnqueued, skippedClosedDays};
  } catch (error) {
    logOpsError({
      message: "weeklyPlanner task execution failed",
      functionEntry: "weeklyPlanner",
      cause: error,
      context: { targetWeekStartDate: input.targetWeekStartDate },
    });
    throw error;
  }
}
