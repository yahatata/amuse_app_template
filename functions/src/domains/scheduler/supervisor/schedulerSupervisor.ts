import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logOpsError, logOpsInfo, logOpsSuccess } from '../../../shared/logging/logOpsError';
import { runSchedulerSupervisorCore } from './schedulerSupervisorCore';

const SCHEDULER_SUPERVISOR_CRON = '0 3 * * *';

/** `schedulerSupervisorCore.toJstDateKey` と同一の JST 日付キー（Firestore read なし） */
function supervisorPlanningDateKey(now: Date): string {
  const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
  const jst = new Date(now.getTime() + JST_OFFSET_MS);
  const year = jst.getUTCFullYear();
  const month = String(jst.getUTCMonth() + 1).padStart(2, '0');
  const day = String(jst.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export const schedulerSupervisor = onSchedule(
  {
    schedule: SCHEDULER_SUPERVISOR_CRON,
    timeZone: 'Asia/Tokyo',
    timeoutSeconds: 540,
    memory: '512MiB',
  },
  async () => {
    try {
      const planningDate = supervisorPlanningDateKey(new Date());
      logOpsInfo({
        message: 'schedulerSupervisor start',
        functionEntry: 'schedulerSupervisor',
        operation: 'start',
        context: {planningDate},
      });
      const result = await runSchedulerSupervisorCore();
      logOpsSuccess({
        message: 'schedulerSupervisor 成功',
        functionEntry: 'schedulerSupervisor',
        context: {
          planningDate: result.planningDate,
          supervisorRunId: result.supervisorRunId,
          enqueuedCount: result.enqueuedCount,
          skippedCount: result.skippedCount,
          failedCount: result.failedCount,
        },
      });
    } catch (error) {
      logOpsError({
        message: 'schedulerSupervisor failed',
        functionEntry: 'schedulerSupervisor',
        cause: error,
        context: { cron: SCHEDULER_SUPERVISOR_CRON },
      });
      throw error;
    }
  }
);
