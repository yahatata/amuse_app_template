import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions';
import { logOpsError } from '../../../shared/logging/logOpsError';
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
      logger.info('schedulerSupervisor completed', result);
    } catch (error) {
      logOpsError({
        message: 'schedulerSupervisor failed',
        failureType: 'scheduled',
        functionEntry: 'schedulerSupervisor',
        cause: error,
      });
      throw error;
    }
  }
);

