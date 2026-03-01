/**
 * ops.ts の単体テスト
 * 
 * STORE_CLOSE_HOUR の取得と cron 生成のテスト
 */

import { getStoreCloseHour, cronFromHourAndMinuteJst, getNightlyCronTriplet } from '../../src/shared/time';

describe('ops.ts', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // 環境変数をクリア
    jest.resetModules();
    process.env = { ...originalEnv };
    delete process.env.STORE_CLOSE_HOUR;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('getStoreCloseHour', () => {
    it('環境変数 STORE_CLOSE_HOUR が設定されている場合はそれを返す', () => {
      process.env.STORE_CLOSE_HOUR = '27';
      const hour = getStoreCloseHour();
      expect(hour).toBe(27);
    });

    it('環境変数が無い場合はデフォルト値 27 を返す', () => {
      const hour = getStoreCloseHour();
      expect(hour).toBe(27);
    });

    it('環境変数が無効な値の場合はデフォルト値 27 を返す', () => {
      process.env.STORE_CLOSE_HOUR = 'invalid';
      const hour = getStoreCloseHour();
      expect(hour).toBe(27);
    });

    it('環境変数が範囲外の場合はデフォルト値 27 を返す', () => {
      process.env.STORE_CLOSE_HOUR = '100';
      const hour = getStoreCloseHour();
      expect(hour).toBe(27);
    });
  });

  describe('cronFromHourAndMinuteJst', () => {
    it('正常な時刻から cron 文字列を生成', () => {
      const cron = cronFromHourAndMinuteJst(3, 0);
      expect(cron).toBe('0 3 * * *');
    });

    it('24以上の時間は 24 で割った余りを使用（翌日繰り上がり）', () => {
      const cron27 = cronFromHourAndMinuteJst(27, 0);
      expect(cron27).toBe('0 3 * * *'); // 27 % 24 = 3

      const cron28 = cronFromHourAndMinuteJst(28, 0);
      expect(cron28).toBe('0 4 * * *'); // 28 % 24 = 4
    });

    it('分が 30 の場合も正しく生成', () => {
      const cron = cronFromHourAndMinuteJst(27, 30);
      expect(cron).toBe('30 3 * * *');
    });

    it('無効な時間でエラーを投げる', () => {
      expect(() => cronFromHourAndMinuteJst(-1, 0)).toThrow();
      expect(() => cronFromHourAndMinuteJst(3, -1)).toThrow();
      expect(() => cronFromHourAndMinuteJst(3, 60)).toThrow();
    });
  });

  describe('getNightlyCronTriplet', () => {
    it('STORE_CLOSE_HOUR=27 の場合、正しい cron 文字列を返す', () => {
      process.env.STORE_CLOSE_HOUR = '27';
      const triplet = getNightlyCronTriplet();
      
      expect(triplet.recalc).toBe('0 3 * * *');      // 27 % 24 = 3, 3:00
      expect(triplet.reconcile).toBe('30 3 * * *');   // 27 % 24 = 3, 3:30
      expect(triplet.integrity).toBe('0 4 * * *');    // (27 + 1) % 24 = 4, 4:00
    });

    it('STORE_CLOSE_HOUR=9 の場合、正しい cron 文字列を返す', () => {
      process.env.STORE_CLOSE_HOUR = '9';
      const triplet = getNightlyCronTriplet();
      
      expect(triplet.recalc).toBe('0 9 * * *');       // 9:00
      expect(triplet.reconcile).toBe('30 9 * * *');   // 9:30
      expect(triplet.integrity).toBe('0 10 * * *');   // 10:00
    });

    it('STORE_CLOSE_HOUR=23 の場合、正しい cron 文字列を返す', () => {
      process.env.STORE_CLOSE_HOUR = '23';
      const triplet = getNightlyCronTriplet();
      
      expect(triplet.recalc).toBe('0 23 * * *');      // 23:00
      expect(triplet.reconcile).toBe('30 23 * * *');  // 23:30
      expect(triplet.integrity).toBe('0 0 * * *');    // (23 + 1) % 24 = 0, 0:00（翌日）
    });

    it('デフォルト値（27）の場合、正しい cron 文字列を返す', () => {
      const triplet = getNightlyCronTriplet();
      
      expect(triplet.recalc).toBe('0 3 * * *');
      expect(triplet.reconcile).toBe('30 3 * * *');
      expect(triplet.integrity).toBe('0 4 * * *');
    });
  });
});

