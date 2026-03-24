/**
 * payrollNotificationScheduler
 *
 * Cloud Scheduler（毎日 06:00 JST）から起動される。
 * payrollConfig.schedulerNotificationHour を読み取り、
 * processPayrollNotifications タスクを scheduleTime = 当日の設定時刻 JST で投入する。
 *
 * 参照: 07_NOTIFICATION_SCHEDULER_SPEC §3-1, §3-2
 */

import { onSchedule } from 'firebase-functions/v2/scheduler';
import { getFunctions } from 'firebase-admin/functions';
import { logger } from 'firebase-functions';

import { getPayrollConfig } from '../../../shared/config/payrollConfigLoader';

export const payrollNotificationScheduler = onSchedule(
  {
    schedule: '0 6 * * *',
    timeZone: 'Asia/Tokyo',
  },
  async () => {
    const payrollConfig = await getPayrollConfig();
    const notificationHour = payrollConfig.schedulerNotificationHour;

    const now = new Date();
    const jstOffsetMs = 9 * 60 * 60 * 1000;
    const jstNow = new Date(now.getTime() + now.getTimezoneOffset() * 60000 + jstOffsetMs);

    const scheduleJst = new Date(
      jstNow.getFullYear(),
      jstNow.getMonth(),
      jstNow.getDate(),
      notificationHour,
      0,
      0
    );

    const scheduleUtc = new Date(scheduleJst.getTime() - jstOffsetMs);

    const queue = getFunctions().taskQueue('processPayrollNotifications');
    await queue.enqueue(
      {},
      {
        scheduleTime: scheduleUtc,
        dispatchDeadlineSeconds: 300,
      }
    );

    logger.info('payrollNotificationScheduler: task enqueued', {
      scheduleTimeUtc: scheduleUtc.toISOString(),
      notificationHour,
    });
  }
);
