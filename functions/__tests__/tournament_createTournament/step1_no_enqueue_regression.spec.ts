/**
 * Step 1 回帰テスト：Cloud Tasks 投入が削除されたことを担保
 *
 * changeSpec Step 1 に準拠。
 * createScheduledTournament / createTournamentRecurrence / generateRecurringTournamentsCore
 * から enqueueStartTask / enqueueRegistTask の呼び出しが削除されていることを検証する。
 */

import * as fs from 'fs';
import * as path from 'path';

const SRC_ROOT = path.resolve(__dirname, '../../src');

const FILES_MUST_NOT_CONTAIN_ENQUEUE = [
  'domains/tournament_createTournament/callables/createScheduledTournament.ts',
  'domains/tournament_createTournament/callables/createTournamentRecurrence.ts',
  'domains/tournament_createTournament/services/generateRecurringTournamentsCore.ts',
];

const FORBIDDEN_STRINGS = ['enqueueStartTask', 'enqueueRegistTask'];

describe('Step 1: Cloud Tasks 投入削除の回帰テスト', () => {
  FILES_MUST_NOT_CONTAIN_ENQUEUE.forEach((relativePath) => {
    describe(relativePath, () => {
      it('enqueueStartTask / enqueueRegistTask を呼び出していないこと', () => {
        const filePath = path.join(SRC_ROOT, relativePath);
        const content = fs.readFileSync(filePath, 'utf-8');

        FORBIDDEN_STRINGS.forEach((forbidden) => {
          expect(content).not.toContain(forbidden);
        });
      });
    });
  });

  describe('generateRecurringTournamentsCore.ts', () => {
    it('getEnv を import していないこと（tasks 投入削除に伴う）', () => {
      const filePath = path.join(
        SRC_ROOT,
        'domains/tournament_createTournament/services/generateRecurringTournamentsCore.ts'
      );
      const content = fs.readFileSync(filePath, 'utf-8');
      expect(content).not.toMatch(/import\s+.*getEnv.*from/);
    });

    it('recurringTaskOptions が存在しないこと', () => {
      const filePath = path.join(
        SRC_ROOT,
        'domains/tournament_createTournament/services/generateRecurringTournamentsCore.ts'
      );
      const content = fs.readFileSync(filePath, 'utf-8');
      expect(content).not.toContain('recurringTaskOptions');
    });
  });
});
