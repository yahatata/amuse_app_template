/**
 * throw-only 観測確認用の一時検証 Callable 群。
 * 本番業務導線とは分離し、管理者のみ実行可能。
 */
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getRequiredProjectId } from '../../shared/runtime/projectId';
import { getRegionalTaskQueue } from '../../shared/tasks/getRegionalTaskQueue';
import { getScheduledJobQueueName } from '../../shared/config/cloudTasksConfig';
import {
  assertValidScheduledJobTaskPayload,
  createIdempotencyKey,
  SCHEDULER_TASK_PAYLOAD_SCHEMA_VERSION,
  type ScheduledJobTaskPayload,
} from '../../domains/scheduler/supervisor/schedulerTaskPayload';
import { buildScheduledJobTaskId } from '../../domains/scheduler/supervisor/schedulerTaskName';
import { requireProbeAdmin } from './requireProbeAdmin';

const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TC01_MODES = ['notFound', 'internal'] as const;
const TC06_MODES = ['duplicate', 'nonDuplicateFailure'] as const;
type Tc01Mode = (typeof TC01_MODES)[number];
type Tc06Mode = (typeof TC06_MODES)[number];

function toJstDateKey(baseUtcDate: Date): string {
  const jstDate = new Date(baseUtcDate.getTime() + 9 * 60 * 60 * 1000);
  const y = jstDate.getUTCFullYear();
  const m = String(jstDate.getUTCMonth() + 1).padStart(2, '0');
  const d = String(jstDate.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function nextSundayDateKey(now: Date): string {
  const jstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const dayOfWeek = jstNow.getUTCDay();
  const daysUntilNextSunday = ((7 - dayOfWeek) % 7) || 7;
  const target = new Date(jstNow.getTime() + daysUntilNextSunday * 24 * 60 * 60 * 1000);
  const y = target.getUTCFullYear();
  const m = String(target.getUTCMonth() + 1).padStart(2, '0');
  const d = String(target.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export const emitThrowOnlyTc01NotFound = onCall(
  { region: 'asia-northeast1' },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', '認証が必要です');
    }
    await requireProbeAdmin(request.auth.uid);

    const runLabelRaw =
      (request.data as { runLabel?: string } | undefined)?.runLabel ?? '';
    const modeRaw = (request.data as { mode?: string } | undefined)?.mode ?? '';
    const mode: Tc01Mode =
      typeof modeRaw === 'string' &&
      TC01_MODES.includes(modeRaw as Tc01Mode)
        ? (modeRaw as Tc01Mode)
        : 'notFound';
    const runLabel =
      typeof runLabelRaw === 'string' && runLabelRaw.trim().length > 0
        ? runLabelRaw.trim().slice(0, 80)
        : null;
    const invokedAt = new Date().toISOString();

    if (mode === 'internal') {
      throw new HttpsError(
        'internal',
        `[TC-01] throw-only observation probe (internal)${
          runLabel ? ` runLabel=${runLabel}` : ''
        }`,
        {
          caseId: 'TC-01',
          mode,
          invokedAt,
          functionName: 'emitThrowOnlyTc01NotFound',
          runLabel,
        }
      );
    }

    throw new HttpsError(
      'not-found',
      `[TC-01] throw-only observation probe (fixed not-found)${
        runLabel ? ` runLabel=${runLabel}` : ''
      }`,
      {
        caseId: 'TC-01',
        mode,
        invokedAt,
        functionName: 'emitThrowOnlyTc01NotFound',
        runLabel,
      }
    );
  }
);

export const enqueueThrowOnlyTc06WeeklyPlannerTask = onCall(
  { region: 'asia-northeast1', timeoutSeconds: 120 },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', '認証が必要です');
    }
    await requireProbeAdmin(request.auth.uid);

    const now = new Date();
    const modeRaw = (request.data as { mode?: string } | undefined)?.mode ?? '';
    const mode: Tc06Mode =
      typeof modeRaw === 'string' &&
      TC06_MODES.includes(modeRaw as Tc06Mode)
        ? (modeRaw as Tc06Mode)
        : 'duplicate';
    const targetWeekStartDateRaw =
      (request.data as { targetWeekStartDate?: string } | undefined)
        ?.targetWeekStartDate ?? '';
    const targetWeekStartDate =
      typeof targetWeekStartDateRaw === 'string' &&
      DATE_KEY_PATTERN.test(targetWeekStartDateRaw.trim())
        ? targetWeekStartDateRaw.trim()
        : nextSundayDateKey(now);

    const projectId = getRequiredProjectId();
    const queueName = getScheduledJobQueueName('weeklyPlanner');
    const plannedRunAt = new Date(now.getTime() + 30 * 1000);
    const taskId = buildScheduledJobTaskId('weeklyPlanner', plannedRunAt);
    const targetWeekStartDateForPayload =
      mode === 'nonDuplicateFailure' ? 'invalid-date' : targetWeekStartDate;

    const payload: ScheduledJobTaskPayload<'weeklyPlanner'> = {
      schemaVersion: SCHEDULER_TASK_PAYLOAD_SCHEMA_VERSION,
      jobKey: 'weeklyPlanner',
      plannedRunAt: plannedRunAt.toISOString(),
      planningDate: toJstDateKey(now),
      targetScope: { targetWeekStartDate: targetWeekStartDateForPayload },
      idempotencyKey: createIdempotencyKey('weeklyPlanner', plannedRunAt),
      supervisorRunId: `debug_throw_only_${now.toISOString()}`,
      scheduleFingerprint: `debug_throw_only_weekly_planner_${mode}_${targetWeekStartDateForPayload}`,
      projectId,
      enqueuedAt: now.toISOString(),
    };
    assertValidScheduledJobTaskPayload(payload);

    try {
      const queue = getRegionalTaskQueue(queueName);
      await queue.enqueue(payload, {
        id: taskId,
        scheduleTime: plannedRunAt,
        dispatchDeadlineSeconds: 300,
      });
    } catch (error) {
      throw new HttpsError(
        'internal',
        '[TC-06] failed to enqueue weeklyPlanner debug task',
        {
          caseId: 'TC-06',
          mode,
          functionName: 'enqueueThrowOnlyTc06WeeklyPlannerTask',
          queueName,
          taskId,
          reason: error instanceof Error ? error.message : String(error),
        }
      );
    }

    return {
      ok: true,
      caseId: 'TC-06',
      mode,
      invokedAt: now.toISOString(),
      functionName: 'enqueueThrowOnlyTc06WeeklyPlannerTask',
      jobKey: 'weeklyPlanner',
      queueName,
      taskId,
      plannedRunAt: plannedRunAt.toISOString(),
      payload,
    };
  }
);
