/**
 * Step 8.5 テスト：安全性向上
 *
 * - enqueueCore 既存データ混入ガード（validateRequiredFields）
 * - controlHook taskIndex 不在は logger.warn（step6 で 200 no-op 確認済み）
 */

import { validateRequiredFields } from '../../src/domains/tournament_createTournament/services/enqueueTournamentTasksCore';
import { Timestamp } from 'firebase-admin/firestore';

describe('Step 8.5: 安全性向上', () => {
  describe('validateRequiredFields（既存データ混入ガード）', () => {
    // startTournament に必要な最低限（blindStructure は任意）
    const validData = {
      startAt: Timestamp.fromDate(new Date('2026-02-19T05:00:00.000Z')),
      storeId: 'store-1',
      tenantId: 'tenant-1',
    };

    it('必須フィールド（startAt, storeId, tenantId）が揃っていれば null を返す', () => {
      expect(validateRequiredFields(validData)).toBeNull();
    });

    it('blindStructure 無しでも通過（startTournament のみ実行可能。closeRegistration は processTournament 内でスキップ）', () => {
      expect(validateRequiredFields({ ...validData, snapshot: {} })).toBeNull();
    });

    it('startAt が無いと missing_startAt', () => {
      const data = { ...validData };
      delete (data as Record<string, unknown>).startAt;
      expect(validateRequiredFields(data)).toBe('missing_startAt');
    });

    it('storeId が無いと missing_storeId', () => {
      expect(validateRequiredFields({ ...validData, storeId: '' })).toBe('missing_storeId');
      expect(validateRequiredFields({ ...validData, storeId: '   ' })).toBe('missing_storeId');
    });

    it('tenantId が無いと missing_tenantId', () => {
      expect(validateRequiredFields({ ...validData, tenantId: '' })).toBe('missing_tenantId');
      expect(validateRequiredFields({ ...validData, tenantId: '   ' })).toBe('missing_tenantId');
    });

    it('startAt が不正だと invalid_startAt', () => {
      expect(
        validateRequiredFields({ ...validData, startAt: 'invalid-date' })
      ).toBe('invalid_startAt');
    });
  });
});
