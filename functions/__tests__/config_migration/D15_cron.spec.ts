/**
 * D15 CRON 環境変数テスト（Phase2.1）
 *
 * 3つのスケジューラが環境変数で上書き可能であり、未設定時はデフォルト値を使用することを
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
  },
  {
    file: 'domains/tournament_createTournament/scheduler/GenerateRecurringTournamentsByScheduler.ts',
    envVar: 'RECURRING_TOURNAMENT_GENERATION_SCHEDULER_CRON',
    defaultCron: '0 23 * * 0', // 日曜 23:00 JST
  },
  {
    file: 'domains/tournament_createTournament/scheduler/EnqueueTournamentTasksByScheduler.ts',
    envVar: 'ENQUEUE_TOURNAMENT_TASKS_SCHEDULER_CRON',
    defaultCron: '0 5 * * *', // 毎日 5:00 JST
  },
] as const;

describe('D15 CRON 環境変数', () => {
  CRON_SPECS.forEach(({ file, envVar, defaultCron }) => {
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
        expect(content).toMatch(/schedule:\s*(?:WEEKLY_PLANNER_CRON|SCHEDULE_CRON)/);
      });
    });
  });
});
