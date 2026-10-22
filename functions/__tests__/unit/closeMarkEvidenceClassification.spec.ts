import {
  classifyCloseMarkEvidence,
  isAlreadyMarkedCloseEvidence,
  isInitialUnmarkedCloseEvidence,
} from '../../src/domains/storeMeta/services/applyCloseSnapshot';
import { buildInitialCloseSummary } from '../../src/domains/bills/services/parentSummary';

describe('close mark evidence classification (UNSETTLED_MARK)', () => {
  describe('isInitialUnmarkedCloseEvidence', () => {
    it('buildInitialCloseSummary() は initial', () => {
      expect(isInitialUnmarkedCloseEvidence(buildInitialCloseSummary())).toBe(true);
      expect(classifyCloseMarkEvidence(buildInitialCloseSummary())).toBe('initial');
    });

    it('production 実機 shape（null 証跡）は initial', () => {
      const productionShape = {
        unresolved: false,
        markedAt: null,
        closedBusinessDate: null,
        displayAmountAtMark: null,
        lastCloseRunId: null,
      };
      expect(isInitialUnmarkedCloseEvidence(productionShape)).toBe(true);
      expect(classifyCloseMarkEvidence(productionShape)).toBe('initial');
    });
  });

  describe('isAlreadyMarkedCloseEvidence', () => {
    it('unresolved=true は marked', () => {
      expect(
        isAlreadyMarkedCloseEvidence({
          unresolved: true,
          lastCloseRunId: 'close_1',
          markedAt: { seconds: 1 },
          closedBusinessDate: '2026-08-24',
          displayAmountAtMark: 1000,
        }),
      ).toBe(true);
      expect(
        classifyCloseMarkEvidence({
          unresolved: true,
          lastCloseRunId: 'close_1',
        }),
      ).toBe('marked');
    });

    it('lastCloseRunId のみでも marked', () => {
      expect(
        classifyCloseMarkEvidence({
          unresolved: false,
          lastCloseRunId: 'close_1',
          markedAt: { seconds: 1 },
          closedBusinessDate: '2026-08-23',
          displayAmountAtMark: 500,
        }),
      ).toBe('marked');
    });
  });

  describe('classifyCloseMarkEvidence', () => {
    it('absent（legacy）', () => {
      expect(classifyCloseMarkEvidence(null)).toBe('absent');
      expect(classifyCloseMarkEvidence(undefined)).toBe('absent');
    });

    it('corrupt は invalid（上書き禁止）', () => {
      expect(classifyCloseMarkEvidence('broken')).toBe('invalid');
      expect(classifyCloseMarkEvidence([])).toBe('invalid');
      expect(
        classifyCloseMarkEvidence({
          unresolved: 'yes',
          lastCloseRunId: null,
        }),
      ).toBe('invalid');
      expect(
        classifyCloseMarkEvidence({
          unresolved: false,
          lastCloseRunId: 123,
        }),
      ).toBe('invalid');
      expect(
        classifyCloseMarkEvidence({
          unresolved: false,
          lastCloseRunId: null,
          markedAt: 'not-a-timestamp',
        }),
      ).toBe('invalid');
    });
  });
});
