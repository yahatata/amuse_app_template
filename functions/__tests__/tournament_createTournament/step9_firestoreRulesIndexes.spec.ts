/**
 * Step 9 テスト：Firestore ルール・インデックスの確認
 *
 * changeSpec Step 9 に準拠。
 * - taskIndex が scheduledTournaments 内側にネストされていること
 * - enqueue 用 3 パターンのインデックスが存在すること
 */

import * as fs from 'fs';
import * as path from 'path';

const PROJECT_ROOT = path.resolve(__dirname, '../../..');
const RULES_PATH = path.join(PROJECT_ROOT, 'firestore.rules');
const INDEXES_PATH = path.join(PROJECT_ROOT, 'firestore.indexes.json');

// 必要なインデックス（changeSpec 3.2）
const REQUIRED_INDEXES = [
  { fields: ['status', 'startAt'], desc: 'status + startAt' },
  { fields: ['status', 'storeId', 'startAt'], desc: 'status + storeId + startAt' },
  {
    fields: ['status', 'storeId', 'tenantId', 'startAt'],
    desc: 'status + storeId + tenantId + startAt',
  },
];

function findScheduledTournamentsIndexes(indexes: { indexes: Array<{ collectionGroup?: string; queryScope?: string; fields?: Array<{ fieldPath: string }> }> }) {
  return (indexes.indexes || []).filter(
    (idx) =>
      idx.collectionGroup === 'scheduledTournaments' &&
      idx.queryScope === 'COLLECTION'
  );
}

function indexFieldsMatch(idx: { fields?: Array<{ fieldPath: string }> }, required: string[]): boolean {
  const actual = (idx.fields || []).map((f) => f.fieldPath);
  if (actual.length !== required.length) return false;
  return required.every((r, i) => actual[i] === r);
}

describe('Step 9: Firestore ルール・インデックス', () => {
  describe('firestore.rules', () => {
    it('taskIndex が scheduledTournaments の内側にネストされていること', () => {
      const content = fs.readFileSync(RULES_PATH, 'utf-8');
      // scheduledTournaments の match ブロック内に taskIndex があること
      const scheduledMatch = content.indexOf('match /scheduledTournaments/{tournamentId}');
      const taskIndexMatch = content.indexOf('match /taskIndex/{taskType}');
      expect(scheduledMatch).toBeGreaterThanOrEqual(0);
      expect(taskIndexMatch).toBeGreaterThanOrEqual(0);
      expect(taskIndexMatch).toBeGreaterThan(scheduledMatch);

      // ルート直下の match /taskIndex ではないこと（scheduledTournaments より前に単独で出てこない）
      const beforeScheduled = content.substring(0, scheduledMatch);
      const rootTaskIndex = beforeScheduled.match(/match\s+\/taskIndex\//);
      expect(rootTaskIndex).toBeNull();
    });

    it('taskIndex が read, write: if false であること', () => {
      const content = fs.readFileSync(RULES_PATH, 'utf-8');
      expect(content).toMatch(/match\s+\/taskIndex\/\{taskType\}\s*\{/);
      expect(content).toContain('allow read, write: if false');
    });
  });

  describe('firestore.indexes.json', () => {
    it('enqueue 用 3 パターンのインデックスが存在すること', () => {
      const indexes = JSON.parse(fs.readFileSync(INDEXES_PATH, 'utf-8'));
      const stIndexes = findScheduledTournamentsIndexes(indexes);

      for (const req of REQUIRED_INDEXES) {
        const found = stIndexes.some((idx) => indexFieldsMatch(idx, req.fields));
        expect(found).toBe(true);
      }
    });

    it('enqueue 用インデックスは collectionGroup が scheduledTournaments であること', () => {
      const indexes = JSON.parse(fs.readFileSync(INDEXES_PATH, 'utf-8'));
      const stIndexes = findScheduledTournamentsIndexes(indexes);

      for (const req of REQUIRED_INDEXES) {
        const idx = stIndexes.find((i) => indexFieldsMatch(i, req.fields));
        expect(idx).toBeDefined();
        expect(idx?.collectionGroup).toBe('scheduledTournaments');
      }
    });

    it('enqueue 用インデックスは queryScope: COLLECTION であること', () => {
      const indexes = JSON.parse(fs.readFileSync(INDEXES_PATH, 'utf-8'));
      const stIndexes = findScheduledTournamentsIndexes(indexes);

      for (const req of REQUIRED_INDEXES) {
        const idx = stIndexes.find((i) => indexFieldsMatch(i, req.fields));
        expect(idx?.queryScope).toBe('COLLECTION');
      }
    });
  });
});
