/**
 * Step 7 テスト：deprecated 関数・死コードの削除確認
 *
 * changeSpec Step 7 に準拠。
 * - tasks.ts から enqueueStartTask / enqueueRegistTask 等が削除されていること
 * - enqueueTournamentTask が残っていること
 * - functions/src 以下（__tests__ 除く）に import 残骸がないこと
 */

import * as fs from 'fs';
import * as path from 'path';

const SRC_ROOT = path.resolve(__dirname, '../../src');
const TASKS_PATH = path.join(
  SRC_ROOT,
  'domains/tournament_createTournament/services/tasks.ts'
);

// 削除対象（changeSpec 5.1, 6.1）
const DELETED_SYMBOLS = [
  'enqueueStartTask',
  'enqueueRegistTask',
  'EnqueueTaskOptions',
  'scheduleTask',
  'listTasks',
  'deleteTask',
  'TaskKind',
  'ScheduleTaskParams',
];

function getAllTsFiles(dir: string, excludeTests = true): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (excludeTests && e.name === '__tests__') continue;
      results.push(...getAllTsFiles(full, excludeTests));
    } else if (e.name.endsWith('.ts') && !e.name.endsWith('.d.ts')) {
      results.push(full);
    }
  }
  return results;
}

describe('Step 7: deprecated 関数・死コード削除の確認', () => {
  describe('tasks.ts', () => {
    it('削除対象の関数・型が含まれていないこと', () => {
      const content = fs.readFileSync(TASKS_PATH, 'utf-8');
      DELETED_SYMBOLS.forEach((symbol) => {
        expect(content).not.toContain(symbol);
      });
    });

    it('enqueueTournamentTask が残っていること', () => {
      const content = fs.readFileSync(TASKS_PATH, 'utf-8');
      expect(content).toContain('enqueueTournamentTask');
      expect(content).toContain('export async function enqueueTournamentTask');
    });

    it('getEnv で環境変数を直接参照していること（定数経由でなく）', () => {
      const content = fs.readFileSync(TASKS_PATH, 'utf-8');
      // 各 env キーが getEnv('KEY') の形で tasks.ts 内に存在すること。
      // モジュール級定数経由だと削除時に事故しやすいため、直接参照であることを検証。
      const requiredEnvKeys = [
        'CONTROL_HOOK_URL',
        'TASKS_QUEUE',
        'TASKS_LOCATION',
        'TASKS_INVOKER_SA',
      ];
      requiredEnvKeys.forEach((key) => {
        expect(content).toContain(`getEnv('${key}')`);
      });
    });

    it('旧モジュール級定数（CONTROL_HOOK_URL, TASK_SA, QUEUE_NAME, REGION）が復活していないこと', () => {
      const content = fs.readFileSync(TASKS_PATH, 'utf-8');
      // 削除した定数宣言のパターンが戻っていないことを確認。
      // getEnv('CONTROL_HOOK_URL') は OK、const CONTROL_HOOK_URL = は NG。
      const oldConstPatterns = [
        /const\s+CONTROL_HOOK_URL\s*=/,
        /const\s+TASK_SA\s*=/,
        /const\s+QUEUE_NAME\s*=/,
        /const\s+REGION\s*=/,
      ];
      oldConstPatterns.forEach((re) => {
        expect(content).not.toMatch(re);
      });
    });
  });

  describe('import 残骸チェック（changeSpec 6.1, 7.2）', () => {
    it('functions/src 以下（__tests__ 除く）に削除シンボルが含まれていないこと', () => {
      const tsFiles = getAllTsFiles(SRC_ROOT);
      const violations: { file: string; symbol: string }[] = [];

      for (const file of tsFiles) {
        const content = fs.readFileSync(file, 'utf-8');
        for (const symbol of DELETED_SYMBOLS) {
          if (content.includes(symbol)) {
            violations.push({
              file: path.relative(SRC_ROOT, file),
              symbol,
            });
          }
        }
      }

      expect(violations).toEqual([]);
    });
  });
});
