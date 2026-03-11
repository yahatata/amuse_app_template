/**
 * Step 4: enqueue バッチ Scheduler
 *
 * 日次で runEnqueueTournamentTasks を実行する。
 * Step 6 デプロイ完了まで ENQUEUE_SCHEDULER_ENABLED が true でないと即 return する。
 *
 * cron: 毎日 5:00 JST。環境変数 ENQUEUE_TOURNAMENT_TASKS_SCHEDULER_CRON で上書き可能。
 */

import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions';
import { runEnqueueTournamentTasks } from '../services/enqueueTournamentTasksCore';
import { getStoreConfig } from '../../../shared/config/configLoader';

const SCHEDULE_CRON = process.env.ENQUEUE_TOURNAMENT_TASKS_SCHEDULER_CRON || '0 5 * * *';
logger.info('enqueueTournamentTasksByScheduler schedule', {
  schedule: SCHEDULE_CRON,
  source: process.env.ENQUEUE_TOURNAMENT_TASKS_SCHEDULER_CRON ? 'env' : 'default',
});

export const enqueueTournamentTasksByScheduler = onSchedule(
  {
    schedule: SCHEDULE_CRON,
    timeZone: 'Asia/Tokyo',
    timeoutSeconds: 540,
    memory: '512MiB',
  },
  async () => {
    const config = await getStoreConfig();
    if (!config.features?.enqueueSchedulerEnabled) {
      console.log(
        '=== enqueue バッチ Scheduler: スキップ（features.enqueueSchedulerEnabled != true） ==='
      );
      return;
    }

    try {
      console.log('=== enqueue バッチ（Scheduler）開始 ===');

      const result = await runEnqueueTournamentTasks({});

      if (result.success) {
        console.log(
          `=== enqueue バッチ完了: processed=${result.processedCount}, enqueued=${result.enqueuedCount} ===`
        );
      } else {
        console.error('=== enqueue バッチエラー ===', result.errors);
        throw new Error(result.errors?.map((e) => e.error).join('; ') || 'enqueue に失敗しました');
      }
    } catch (error) {
      console.error('=== enqueue バッチ（Scheduler）エラー ===', error);
      throw error;
    }
  }
);
