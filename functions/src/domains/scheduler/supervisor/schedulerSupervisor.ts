import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logOpsError, logOpsSuccess } from '../../../shared/logging/logOpsError';
import { runSchedulerSupervisorCore } from './schedulerSupervisorCore';

const SCHEDULER_SUPERVISOR_CRON = '0 3 * * *';

export const schedulerSupervisor = onSchedule(
  {
    schedule: SCHEDULER_SUPERVISOR_CRON,
    timeZone: 'Asia/Tokyo',
    timeoutSeconds: 540,
    memory: '512MiB',
  },
  async () => {
    try {
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
