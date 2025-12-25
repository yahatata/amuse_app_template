/**
 * calcBusinessDate の単体テスト
 * 
 * ChangeSpec P1-01 に準拠
 */

import { calcBusinessDate } from '../../../src/helpers/billsApi/calcBusinessDate';

describe('calcBusinessDate', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('STORE_CLOSE_HOUR=27（翌日の3:00 JST）', () => {
    beforeEach(() => {
      process.env.STORE_CLOSE_HOUR = '27';
    });

    it('02:59 JST → 前日の営業日', () => {
      // 2025-11-10 02:59 JST = 2025-11-09 17:59 UTC
      const utcDate = new Date('2025-11-09T17:59:00Z');
      const businessDate = calcBusinessDate(utcDate);
      expect(businessDate).toBe('2025-11-09'); // 前日
    });

    it('03:00 JST → 当日の営業日', () => {
      // 2025-11-10 03:00 JST = 2025-11-09 18:00 UTC
      const utcDate = new Date('2025-11-09T18:00:00Z');
      const businessDate = calcBusinessDate(utcDate);
      expect(businessDate).toBe('2025-11-10'); // 当日
    });

    it('03:01 JST → 当日の営業日', () => {
      // 2025-11-10 03:01 JST = 2025-11-09 18:01 UTC
      const utcDate = new Date('2025-11-09T18:01:00Z');
      const businessDate = calcBusinessDate(utcDate);
      expect(businessDate).toBe('2025-11-10'); // 当日
    });
  });

  describe('STORE_CLOSE_HOUR=9（当日の9:00 JST）', () => {
    beforeEach(() => {
      process.env.STORE_CLOSE_HOUR = '9';
    });

    it('08:59 JST → 前日の営業日', () => {
      // 2025-11-10 08:59 JST = 2025-11-09 23:59 UTC
      const utcDate = new Date('2025-11-09T23:59:00Z');
      const businessDate = calcBusinessDate(utcDate);
      expect(businessDate).toBe('2025-11-09'); // 前日
    });

    it('09:00 JST → 当日の営業日', () => {
      // 2025-11-10 09:00 JST = 2025-11-10 00:00 UTC
      const utcDate = new Date('2025-11-10T00:00:00Z');
      const businessDate = calcBusinessDate(utcDate);
      expect(businessDate).toBe('2025-11-10'); // 当日
    });

    it('09:01 JST → 当日の営業日', () => {
      // 2025-11-10 09:01 JST = 2025-11-10 00:01 UTC
      const utcDate = new Date('2025-11-10T00:01:00Z');
      const businessDate = calcBusinessDate(utcDate);
      expect(businessDate).toBe('2025-11-10'); // 当日
    });
  });

  describe('デフォルト値（STORE_CLOSE_HOUR=27）', () => {
    beforeEach(() => {
      delete process.env.STORE_CLOSE_HOUR;
    });

    it('環境変数未設定時はデフォルト値 27 を使用', () => {
      // 2025-11-10 02:59 JST = 2025-11-09 17:59 UTC
      const utcDate = new Date('2025-11-09T17:59:00Z');
      const businessDate = calcBusinessDate(utcDate);
      expect(businessDate).toBe('2025-11-09'); // 前日（27の動作）
    });
  });

  describe('24-48指定の正規化（resolveBusinessDate側に任せる）', () => {
    it('STORE_CLOSE_HOUR=25（翌日の1:00 JST）', () => {
      process.env.STORE_CLOSE_HOUR = '25';
      // 2025-11-10 00:59 JST = 2025-11-09 15:59 UTC
      const utcDate = new Date('2025-11-09T15:59:00Z');
      const businessDate = calcBusinessDate(utcDate);
      expect(businessDate).toBe('2025-11-09'); // 前日（25 % 24 = 1 として扱われる）
    });

    it('STORE_CLOSE_HOUR=25（翌日の1:00 JST以降）', () => {
      process.env.STORE_CLOSE_HOUR = '25';
      // 2025-11-10 01:00 JST = 2025-11-09 16:00 UTC
      const utcDate = new Date('2025-11-09T16:00:00Z');
      const businessDate = calcBusinessDate(utcDate);
      expect(businessDate).toBe('2025-11-10'); // 当日（25 % 24 = 1 として扱われる）
    });
  });
});

