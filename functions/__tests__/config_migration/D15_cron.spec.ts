/**
 * D15 CRON 環境変数テスト（Phase2.1）
 *
 * スケジューラが環境変数で上書き可能であり、未設定時はデフォルト値を使用することを
 * ソースコードのパターンで検証する。モジュールインポートは行わない（Firebase/Tasks の初期化を避ける）。
 */

import * as fs from 'fs';
import * as path from 'path';

const SRC_ROOT = path.resolve(__dirname, '../../src');

const CRON_SPECS = [
  {
    file: 'domains/storeMeta/scheduler/weeklyPlanner.ts',
    envVar: 'WEEKLY_PLANNER_CRON',
    defaultCron: '0 11 * * 0', // UTC 11:00 = JST 20:00（日曜）
    scheduleVar: 'WEEKLY_PLANNER_CRON',
  },
  {
    file: 'domains/tournament_createTournament/scheduler/GenerateRecurringTournamentsByScheduler.ts',
    envVar: 'RECURRING_TOURNAMENT_GENERATION_SCHEDULER_CRON',
    defaultCron: '0 23 * * 0', // 日曜 23:00 JST
    scheduleVar: 'SCHEDULE_CRON',
  },
  {
    file: 'domains/tournament_createTournament/scheduler/EnqueueTournamentTasksByScheduler.ts',
    envVar: 'ENQUEUE_TOURNAMENT_TASKS_SCHEDULER_CRON',
    defaultCron: '0 5 * * *', // 毎日 5:00 JST
    scheduleVar: 'SCHEDULE_CRON',
  },
  {
    file: 'domains/attendance/scheduler/monthlyPayrollTrigger.ts',
    envVar: 'MONTHLY_PAYROLL_TRIGGER_CRON',
    defaultCron: '59 23 25 * *', // 毎月25日 23:59 JST
    scheduleVar: 'MONTHLY_PAYROLL_TRIGGER_CRON',
  },
  {
    file: 'domains/staff/scheduler/scheduledCleanup.ts',
    envVar: 'SCHEDULED_CLEANUP_CRON',
    defaultCron: '0 2 * * *', // 毎日 2:00 JST
    scheduleVar: 'SCHEDULED_CLEANUP_CRON',
  },
  {
    file: 'shared/businessHours/scheduler/scheduleGenerateNextYearBusinessHours.ts',
    envVar: 'SCHEDULE_GENERATE_NEXT_YEAR_BUSINESS_HOURS_CRON',
    defaultCron: '25 23 28 1 *', // 毎年1月28日 23:25 JST
    scheduleVar: 'SCHEDULE_GENERATE_NEXT_YEAR_BUSINESS_HOURS_CRON',
  },
] as const;

describe('D15 CRON 環境変数', () => {
  CRON_SPECS.forEach(({ file, envVar, defaultCron, scheduleVar }) => {
    describe(file, () => {
      let content: string;

      beforeAll(() => {
        content = fs.readFileSync(path.join(SRC_ROOT, file), 'utf-8');
      });

      it(`${envVar} を参照し、未設定時はデフォルト "${defaultCron}" を使用すること`, () => {
        const envPattern = new RegExp(
          `process\\.env\\.${envVar}\\s*\\|\\|\\s*['\"]${defaultCron.replace(/[*]/g, '\\*')}['\"]`
        );
        expect(content).toMatch(envPattern);
      });

      it('onSchedule の schedule に上記の定数が渡されていること', () => {
        expect(content).toMatch(/onSchedule\s*\(\s*\{/);
        expect(content).toMatch(new RegExp(`schedule:\\s*${scheduleVar}`));
      });
    });
  });
});
