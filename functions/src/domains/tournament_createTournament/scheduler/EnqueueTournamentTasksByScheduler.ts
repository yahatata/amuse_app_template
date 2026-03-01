/**
 * Step 4: enqueue バッチ Scheduler
 *
 * 日次で runEnqueueTournamentTasks を実行する。
 * Step 6 デプロイ完了まで ENQUEUE_SCHEDULER_ENABLED が true でないと即 return する。
 *
 * cron: 毎日 5:00 JST（lib/globalConstant.dart の ENQUEUE_TOURNAMENT_TASKS_SCHEDULER_CRON と同期）
 */

import { onSchedule } from 'firebase-functions/v2/scheduler';
import { runEnqueueTournamentTasks } from '../services/enqueueTournamentTasksCore';

const SCHEDULE_CRON = '0 5 * * *';

const ENQUEUE_SCHEDULER_ENABLED = process.env.ENQUEUE_SCHEDULER_ENABLED === 'true';

export const enqueueTournamentTasksByScheduler = onSchedule(
  {
    schedule: SCHEDULE_CRON,
    timeZone: 'Asia/Tokyo',
    timeoutSeconds: 540,
    memory: '512MiB',
  },
  async () => {
    if (!ENQUEUE_SCHEDULER_ENABLED) {
      console.log(
        '=== enqueue バッチ Scheduler: Step 6 デプロイ待ちのためスキップ（ENQUEUE_SCHEDULER_ENABLED != true） ==='
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
