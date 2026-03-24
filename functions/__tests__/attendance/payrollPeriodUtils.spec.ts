/**
 * payrollPeriodUtils の単体テスト
 *
 * 参照: docs/config_migration/phase4_3/specs/02_CONFIG_SPEC.md セクション5-7
 */

import {
  getPaymentPeriodKey,
  getPayrollPeriodRange,
  getWeekStartDate,
  getCalculablePeriod,
} from '../../src/domains/attendance/helpers/payrollPeriodUtils';

describe('payrollPeriodUtils', () => {
  describe('getPayrollPeriodRange / getPaymentPeriodKey', () => {
    it('通常パターン: startDay=26, endDay=25', () => {
      const result = getPayrollPeriodRange('2026-03-18', 26, 25);
      expect(result).toEqual({ periodStart: '2026-02-26', periodEnd: '2026-03-25' });
      expect(getPaymentPeriodKey('2026-03-18', 26, 25)).toBe('2026-02-26_2026-03-25');
    });

    it('期間開始日ちょうど', () => {
      const result = getPayrollPeriodRange('2026-02-26', 26, 25);
      expect(result).toEqual({ periodStart: '2026-02-26', periodEnd: '2026-03-25' });
    });

    it('期間終了日ちょうど', () => {
      const result = getPayrollPeriodRange('2026-03-25', 26, 25);
      expect(result).toEqual({ periodStart: '2026-02-26', periodEnd: '2026-03-25' });
    });

    it('endDay=0（月末）: 期間内', () => {
      const result = getPayrollPeriodRange('2026-02-15', 1, 0);
      expect(result).toEqual({ periodStart: '2026-02-01', periodEnd: '2026-02-28' });
    });

    it('閏年の月末', () => {
      const result = getPayrollPeriodRange('2028-02-15', 1, 0);
      expect(result).toEqual({ periodStart: '2028-02-01', periodEnd: '2028-02-29' });
    });

    it('startDay=1, endDay=31（同一月内）', () => {
      const result = getPayrollPeriodRange('2026-03-15', 1, 31);
      expect(result).toEqual({ periodStart: '2026-03-01', periodEnd: '2026-03-31' });
    });

    it('年跨ぎ: startDay=26, endDay=25', () => {
      const result = getPayrollPeriodRange('2026-01-10', 26, 25);
      expect(result).toEqual({ periodStart: '2025-12-26', periodEnd: '2026-01-25' });
    });

    it('endDay=0 の年跨ぎ', () => {
      const result = getPayrollPeriodRange('2026-01-15', 1, 0);
      expect(result).toEqual({ periodStart: '2026-01-01', periodEnd: '2026-01-31' });
    });

    it('翌月跨ぎ期間の開始日ちょうど: 26日', () => {
      const result = getPayrollPeriodRange('2026-03-26', 26, 25);
      expect(result).toEqual({ periodStart: '2026-03-26', periodEnd: '2026-04-25' });
    });

    it('翌月跨ぎ期間の中間日: endDay < day < startDay の場合', () => {
      // day=26 なので startDay=26 に合致 → 今月の期間
      const result = getPayrollPeriodRange('2026-04-26', 26, 25);
      expect(result).toEqual({ periodStart: '2026-04-26', periodEnd: '2026-05-25' });
    });
  });

  describe('getWeekStartDate', () => {
    it('日曜始まり: 水曜日の date', () => {
      // 2026-03-18 = 水曜日
      expect(getWeekStartDate('2026-03-18', 0)).toBe('2026-03-15');
    });

    it('月曜始まり: 水曜日の date', () => {
      expect(getWeekStartDate('2026-03-18', 1)).toBe('2026-03-16');
    });

    it('当日が開始曜日: 水曜始まり + 水曜', () => {
      expect(getWeekStartDate('2026-03-18', 3)).toBe('2026-03-18');
    });

    it('土曜始まり: 水曜日の date', () => {
      expect(getWeekStartDate('2026-03-18', 6)).toBe('2026-03-14');
    });

    it('日曜始まり: 日曜日の date', () => {
      // 2026-03-15 = 日曜日
      expect(getWeekStartDate('2026-03-15', 0)).toBe('2026-03-15');
    });

    it('月跨ぎ: 月曜始まり + 3月1日(日曜)', () => {
      // 2026-03-01 = 日曜日, weekStartDay=1(月曜) → 2026-02-23(月)
      expect(getWeekStartDate('2026-03-01', 1)).toBe('2026-02-23');
    });
  });

  describe('getCalculablePeriod', () => {
    it('通常: periodEnd + paymentDate', () => {
      const result = getCalculablePeriod('2026-03-25', '2026-04-25');
      expect(result).toEqual({ calcStart: '2026-03-26', calcEnd: '2026-04-24' });
    });

    it('paymentDate=null → null（常時計算可能）', () => {
      const result = getCalculablePeriod('2026-03-25', null);
      expect(result).toBeNull();
    });

    it('年跨ぎ: periodEnd=12月, paymentDate=翌年1月', () => {
      const result = getCalculablePeriod('2026-12-25', '2027-01-25');
      expect(result).toEqual({ calcStart: '2026-12-26', calcEnd: '2027-01-24' });
    });
  });
});
