import * as crypto from 'crypto';
import { getFunctions } from 'firebase-admin/functions';
import { logger } from 'firebase-functions';
import { getScheduledJobQueueName } from '../../../shared/config/cloudTasksConfig';
import { getSchedulerConfig } from '../../../shared/config/schedulerConfigLoader';
import type {
  SchedulerConfig,
  SchedulerJobConfig,
  SchedulerJobKey,
} from '../../../shared/config/schedulerConfigTypes';
import { getRequiredProjectId } from '../../../shared/runtime/projectId';
import {
  assertValidScheduledJobTaskPayload,
  createIdempotencyKey,
  SCHEDULER_TASK_PAYLOAD_SCHEMA_VERSION,
  type ScheduledJobTaskPayload,
} from './schedulerTaskPayload';
import { buildScheduledJobTaskId } from './schedulerTaskName';
import {
  buildSchedulerTargetScope,
  type SchedulerTargetScope,
} from './schedulerTargetScope';
import { writeSchedulerDispatchLogBestEffort } from './schedulerLogs';

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

export interface SchedulerSupervisorRunResult {
  planningDate: string;
  supervisorRunId: string;
  enqueuedCount: number;
  skippedCount: number;
  failedCount: number;
}

export interface ScheduledJobEnqueueInput<K extends SchedulerJobKey = SchedulerJobKey> {
  queueName: string;
  taskId: string;
  scheduleTime: Date;
  payload: ScheduledJobTaskPayload<K>;
}

export interface ScheduledJobEnqueueClient {
  enqueue<K extends SchedulerJobKey>(input: ScheduledJobEnqueueInput<K>): Promise<void>;
}

function toJstDate(baseUtcDate: Date): Date {
  return new Date(baseUtcDate.getTime() + JST_OFFSET_MS);
}

function toJstDateKey(baseUtcDate: Date): string {
  const jst = toJstDate(baseUtcDate);
  const year = jst.getUTCFullYear();
  const month = String(jst.getUTCMonth() + 1).padStart(2, '0');
  const day = String(jst.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getJstMidnight(baseUtcDate: Date): Date {
  const jst = toJstDate(baseUtcDate);
  return new Date(Date.UTC(jst.getUTCFullYear(), jst.getUTCMonth(), jst.getUTCDate()));
}

function addDays(base: Date, days: number): Date {
  return new Date(base.getTime() + days * 24 * 60 * 60 * 1000);
}

function parseRunAtJst(runAtJst: string): { hour: number; minute: number } {
  const [hourStr, minuteStr] = runAtJst.split(':');
  return { hour: Number(hourStr), minute: Number(minuteStr) };
}

function toUtcFromJstDateAndTime(jstDate: Date, runAtJst: string): Date {
  const { hour, minute } = parseRunAtJst(runAtJst);
  const jstMillis = Date.UTC(
    jstDate.getUTCFullYear(),
    jstDate.getUTCMonth(),
    jstDate.getUTCDate(),
    hour,
    minute,
    0,
    0
  );
  return new Date(jstMillis - JST_OFFSET_MS);
}

function shouldRunOnDate(jstDate: Date, job: SchedulerJobConfig): boolean {
  if (job.scheduleKind === 'daily') return true;
  if (job.scheduleKind === 'weekly') {
    return typeof job.dayOfWeek === 'number' && jstDate.getUTCDay() === job.dayOfWeek;
  }
  if (job.scheduleKind === 'yearly') {
    return (
      typeof job.month === 'number' &&
      typeof job.dayOfMonth === 'number' &&
      jstDate.getUTCMonth() + 1 === job.month &&
      jstDate.getUTCDate() === job.dayOfMonth
    );
  }
  return false;
}

function buildScheduleFingerprint(
  jobKey: SchedulerJobKey,
  schedulerConfig: SchedulerConfig
): string {
  const jobConfig = schedulerConfig.jobs[jobKey];
  const source = JSON.stringify({
    schemaVersion: schedulerConfig.schemaVersion,
    supervisorEnabled: schedulerConfig.supervisorEnabled,
    planningHorizonDays: schedulerConfig.planningHorizonDays,
    jobKey,
    enabled: jobConfig.enabled,
    scheduleKind: jobConfig.scheduleKind,
    runAtJst: jobConfig.runAtJst,
    dayOfWeek: jobConfig.dayOfWeek ?? null,
    month: jobConfig.month ?? null,
    dayOfMonth: jobConfig.dayOfMonth ?? null,
    timezone: jobConfig.timezone,
  });

  return crypto.createHash('sha256').update(source).digest('hex').substring(0, 32);
}

function isTaskAlreadyExistsError(error: unknown): boolean {
  const err = error as { code?: unknown; message?: unknown };
  const code = typeof err?.code === 'string' ? err.code : String(err?.code ?? '');
  const message = typeof err?.message === 'string' ? err.message : '';

  return (
    code === 'functions/task-already-exists' ||
    code === '6' ||
    message.includes('task-already-exists') ||
    message.includes('ALREADY_EXISTS')
  );
}

function createSupervisorRunId(now: Date): string {
  const timestamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const random = crypto.randomBytes(4).toString('hex');
  return `supervisor_${timestamp}_${random}`;
}

export class FirebaseTaskQueueEnqueueClient implements ScheduledJobEnqueueClient {
  async enqueue<K extends SchedulerJobKey>(
    input: ScheduledJobEnqueueInput<K>
  ): Promise<void> {
    const queue = getFunctions().taskQueue(input.queueName);
    await queue.enqueue(input.payload, {
      id: input.taskId,
      scheduleTime: input.scheduleTime,
      dispatchDeadlineSeconds: 300,
    });
  }
}

export async function runSchedulerSupervisorCore(
  enqueueClient: ScheduledJobEnqueueClient = new FirebaseTaskQueueEnqueueClient(),
  now: Date = new Date()
): Promise<SchedulerSupervisorRunResult> {
  const schedulerConfig = await getSchedulerConfig();
  const projectId = getRequiredProjectId();
  const planningDate = toJstDateKey(now);
  const supervisorRunId = createSupervisorRunId(now);

  if (!schedulerConfig.supervisorEnabled) {
    logger.info('schedulerSupervisor: skipped because supervisorEnabled is false');
    return {
      planningDate,
      supervisorRunId,
      enqueuedCount: 0,
      skippedCount: 0,
      failedCount: 0,
    };
  }

  const horizonDays = schedulerConfig.planningHorizonDays;
  const baseJstDate = getJstMidnight(now);

  let enqueuedCount = 0;
  let skippedCount = 0;
  let failedCount = 0;
  const hardErrors: string[] = [];

  for (let offset = 0; offset < horizonDays; offset++) {
    const targetJstDate = addDays(baseJstDate, offset);

    for (const jobKey of Object.keys(schedulerConfig.jobs) as SchedulerJobKey[]) {
      const jobConfig = schedulerConfig.jobs[jobKey];
      if (!jobConfig.enabled) {
        continue;
      }
      if (!shouldRunOnDate(targetJstDate, jobConfig)) {
        continue;
      }

      const plannedRunAt = toUtcFromJstDateAndTime(targetJstDate, jobConfig.runAtJst);
      if (plannedRunAt.getTime() <= now.getTime()) {
        skippedCount++;
        const queueName = getScheduledJobQueueName(jobKey);
        await writeSchedulerDispatchLogBestEffort({
          eventType: 'skip',
          isSuccess: true,
          reason: 'planned_run_at_in_past',
          jobKey,
          functionName: jobKey,
          queueName,
          plannedRunAt: plannedRunAt.toISOString(),
          planningDate,
          projectId,
          idempotencyKey: createIdempotencyKey(jobKey, plannedRunAt),
          supervisorRunId,
          scheduleFingerprint: buildScheduleFingerprint(jobKey, schedulerConfig),
          decisionSnapshot: {
            offsetDays: offset,
            isPastRun: true,
          },
        });
        continue;
      }

      const queueName = getScheduledJobQueueName(jobKey);
      const taskId = buildScheduledJobTaskId(jobKey, plannedRunAt);
      const idempotencyKey = createIdempotencyKey(jobKey, plannedRunAt);
      const targetScope = buildSchedulerTargetScope(
        jobKey,
        plannedRunAt
      ) as SchedulerTargetScope<typeof jobKey>;
      const scheduleFingerprint = buildScheduleFingerprint(jobKey, schedulerConfig);

      const payload: ScheduledJobTaskPayload<typeof jobKey> = {
        schemaVersion: SCHEDULER_TASK_PAYLOAD_SCHEMA_VERSION,
        jobKey,
        plannedRunAt: plannedRunAt.toISOString(),
        planningDate,
        targetScope,
        idempotencyKey,
        supervisorRunId,
        scheduleFingerprint,
        projectId,
        enqueuedAt: now.toISOString(),
      };
      assertValidScheduledJobTaskPayload(payload);

      try {
        await enqueueClient.enqueue({
          queueName,
          taskId,
          scheduleTime: plannedRunAt,
          payload,
        });
        enqueuedCount++;
        await writeSchedulerDispatchLogBestEffort({
          eventType: 'enqueued',
          isSuccess: true,
          jobKey,
          functionName: jobKey,
          queueName,
          plannedRunAt: plannedRunAt.toISOString(),
          planningDate,
          projectId,
          idempotencyKey,
          supervisorRunId,
          scheduleFingerprint,
          decisionSnapshot: {
            offsetDays: offset,
            isPastRun: false,
          },
        });
      } catch (error) {
        if (isTaskAlreadyExistsError(error)) {
          skippedCount++;
          await writeSchedulerDispatchLogBestEffort({
            eventType: 'skip',
            isSuccess: true,
            reason: 'task_already_exists',
            jobKey,
            functionName: jobKey,
            queueName,
            plannedRunAt: plannedRunAt.toISOString(),
            planningDate,
            projectId,
            idempotencyKey,
            supervisorRunId,
            scheduleFingerprint,
            decisionSnapshot: {
              offsetDays: offset,
              isAlreadyExists: true,
            },
          });
          continue;
        }

        failedCount++;
        const message = error instanceof Error ? error.message : String(error);
        hardErrors.push(`${jobKey}:${message}`);
        await writeSchedulerDispatchLogBestEffort({
          eventType: 'error',
          isSuccess: false,
          reason: message,
          jobKey,
          functionName: jobKey,
          queueName,
          plannedRunAt: plannedRunAt.toISOString(),
          planningDate,
          projectId,
          idempotencyKey,
          supervisorRunId,
          scheduleFingerprint,
          decisionSnapshot: {
            offsetDays: offset,
            isAlreadyExists: false,
          },
        });
      }
    }
  }

  if (hardErrors.length > 0) {
    throw new Error(`schedulerSupervisor enqueue failed: ${hardErrors.join(' | ')}`);
  }

  return {
    planningDate,
    supervisorRunId,
    enqueuedCount,
    skippedCount,
    failedCount,
  };
}

