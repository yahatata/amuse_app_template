/**
 * Step 10 テスト：ドキュメント更新の確認
 *
 * changeSpec Step 10 に準拠。
 * cloud_scheduler_and_tasks_summary.md と アプリフロー一覧 に enqueue 関連の記載があること
 */

import * as fs from 'fs';
import * as path from 'path';

const PROJECT_ROOT = path.resolve(__dirname, '../../..');
const CLOUD_SUMMARY_PATH = path.join(PROJECT_ROOT, 'docs/cloud_scheduler_and_tasks_summary.md');
const FLOW_LIST_PATH = path.join(PROJECT_ROOT, 'docs/アプリフロー一覧_Step2_詳細フロー列挙.md');

describe('Step 10: ドキュメント更新', () => {
  describe('cloud_scheduler_and_tasks_summary.md', () => {
    let content: string;
    beforeAll(() => {
      content = fs.readFileSync(CLOUD_SUMMARY_PATH, 'utf-8');
    });

    it('enqueueTournamentTasksByScheduler が記載されていること', () => {
      expect(content).toContain('enqueueTournamentTasksByScheduler');
    });

    it('合計6つのスケジュール関数と記載されていること', () => {
      expect(content).toMatch(/合計\s*6\s*つのスケジュール関数/);
    });

    it('taskIndex の説明が含まれていること', () => {
      expect(content).toContain('taskIndex');
      expect(content).toContain('scheduledTournaments/{tournamentId}/taskIndex');
      expect(content).toContain('startTournament');
      expect(content).toContain('closeRegistration');
    });

    it('controlHook payload が記載されていること', () => {
      expect(content).toContain('planVersion');
      expect(content).toContain('planHash');
      expect(content).toContain('no-op');
    });

    it('enqueueTournamentTasks Callable が記載されていること', () => {
      expect(content).toContain('enqueueTournamentTasks');
      expect(content).toContain('手動実行');
    });
  });

  describe('アプリフロー一覧_Step2_詳細フロー列挙.md', () => {
    let content: string;
    beforeAll(() => {
      content = fs.readFileSync(FLOW_LIST_PATH, 'utf-8');
    });

    it('3.4 単発トーナメントに runEnqueueTournamentTasks が含まれていること', () => {
      expect(content).toContain('runEnqueueTournamentTasks');
      expect(content).toMatch(/単発.*\n[\s\S]*?runEnqueueTournamentTasks/);
    });

    it('3.3 定期開催に enqueue の記載が含まれていること', () => {
      const idx = content.indexOf('### 3.3 定期開催トーナメント設定フロー');
      const nextSection = content.indexOf('### 3.4', idx);
      const section = content.substring(idx, nextSection > 0 ? nextSection : content.length);
      expect(section).toContain('enqueue');
    });

    it('12.5 Cloud Tasks 投入フローが含まれていること', () => {
      expect(content).toContain('12.5 Cloud Tasks 投入フロー');
      expect(content).toContain('enqueueTournamentTasksByScheduler');
      expect(content).toContain('taskIndex');
    });

    it('12.4 定期トーナメント自動生成に runEnqueueTournamentTasks が含まれていること', () => {
      const idx = content.indexOf('12.4 定期トーナメント自動生成');
      const nextSection = content.indexOf('### 12.5', idx);
      const section = content.substring(idx, nextSection > 0 ? nextSection : content.length);
      expect(section).toContain('runEnqueueTournamentTasks');
    });
  });
});
