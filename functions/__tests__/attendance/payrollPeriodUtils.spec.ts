/**
 * payrollPeriodUtils の単体テスト
 *
 * 参照: docs/config_migration/phase4_3/specs/02_CONFIG_SPEC.md セクション5-7
 */

import {
  computeActualPaymentDate,
  getCalcTargetPaymentPeriodKey,
  getCalcTargetPeriodRange,
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

  describe('getCalcTargetPeriodRange / getCalcTargetPaymentPeriodKey', () => {
    describe('calendar month (startDay=1, endDay=0)', () => {
      it('2026-09-01 → 2026-08-01〜2026-08-31', () => {
        expect(getCalcTargetPeriodRange('2026-09-01', 1, 0)).toEqual({
          periodStart: '2026-08-01',
          periodEnd: '2026-08-31',
        });
        expect(getCalcTargetPaymentPeriodKey('2026-09-01', 1, 0)).toBe(
          '2026-08-01_2026-08-31'
        );
      });

      it('2026-03-01 → 2026-02-01〜2026-02-28', () => {
        expect(getCalcTargetPeriodRange('2026-03-01', 1, 0)).toEqual({
          periodStart: '2026-02-01',
          periodEnd: '2026-02-28',
        });
      });

      it('2028-03-01（閏年）→ 2028-02-01〜2028-02-29', () => {
        expect(getCalcTargetPeriodRange('2028-03-01', 1, 0)).toEqual({
          periodStart: '2028-02-01',
          periodEnd: '2028-02-29',
        });
      });

      it('2026-04-30 → 2026-03-01〜2026-03-31', () => {
        expect(getCalcTargetPeriodRange('2026-04-30', 1, 0)).toEqual({
          periodStart: '2026-03-01',
          periodEnd: '2026-03-31',
        });
      });
    });

    describe('26〜25 (startDay=26, endDay=25)', () => {
      it('2026-09-26 → 2026-08-26〜2026-09-25', () => {
        expect(getCalcTargetPeriodRange('2026-09-26', 26, 25)).toEqual({
          periodStart: '2026-08-26',
          periodEnd: '2026-09-25',
        });
        expect(getCalcTargetPaymentPeriodKey('2026-09-26', 26, 25)).toBe(
          '2026-08-26_2026-09-25'
        );
      });

      it('2026-09-01 → 2026-07-26〜2026-08-25', () => {
        expect(getCalcTargetPeriodRange('2026-09-01', 26, 25)).toEqual({
          periodStart: '2026-07-26',
          periodEnd: '2026-08-25',
        });
      });
    });

    describe('boundaries', () => {
      it('periodEnd 当日 (26〜25): まだ終了していない active 期間ではなく、その直前に終了した期間', () => {
        // 2026-09-25 は active Aug26-Sep25 の最終日。calc target は Jul26-Aug25。
        expect(getCalcTargetPeriodRange('2026-09-25', 26, 25)).toEqual({
          periodStart: '2026-07-26',
          periodEnd: '2026-08-25',
        });
      });

      it('periodEnd 翌日 (26〜25): 直前に終了した period を返す', () => {
        expect(getCalcTargetPeriodRange('2026-09-26', 26, 25)).toEqual({
          periodStart: '2026-08-26',
          periodEnd: '2026-09-25',
        });
      });

      it('periodEnd 当日 (calendar month): 直前に終了した period', () => {
        // 2026-08-31 は active Aug1-31 の最終日。calc target は Jul1-31。
        expect(getCalcTargetPeriodRange('2026-08-31', 1, 0)).toEqual({
          periodStart: '2026-07-01',
          periodEnd: '2026-07-31',
        });
      });

      it('periodEnd 翌日 (calendar month): 直前に終了した period', () => {
        expect(getCalcTargetPeriodRange('2026-09-01', 1, 0)).toEqual({
          periodStart: '2026-08-01',
          periodEnd: '2026-08-31',
        });
      });
    });

    it('processPayrollNotifications の recentPeriod 導出と一致する', () => {
      const cases: Array<{ asOf: string; startDay: number; endDay: number }> = [
        { asOf: '2026-09-01', startDay: 1, endDay: 0 },
        { asOf: '2026-09-26', startDay: 26, endDay: 25 },
        { asOf: '2026-09-25', startDay: 26, endDay: 25 },
        { asOf: '2028-03-01', startDay: 1, endDay: 0 },
      ];

      for (const { asOf, startDay, endDay } of cases) {
        const activePeriod = getPayrollPeriodRange(asOf, startDay, endDay);
        const dayBeforeActiveStart = (() => {
          const d = new Date(`${activePeriod.periodStart}T00:00:00`);
          d.setDate(d.getDate() - 1);
          const y = d.getFullYear();
          const m = String(d.getMonth() + 1).padStart(2, '0');
          const day = String(d.getDate()).padStart(2, '0');
          return `${y}-${m}-${day}`;
        })();
        const recentFromNotification = getPayrollPeriodRange(dayBeforeActiveStart, startDay, endDay);
        expect(getCalcTargetPeriodRange(asOf, startDay, endDay)).toEqual(recentFromNotification);
      }
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

  describe('computeActualPaymentDate', () => {
    it('offset=0 の同月払いを返す', () => {
      expect(computeActualPaymentDate('2026-03-25', '31', 0)).toBe('2026-03-31');
    });

    it('offset=1 の翌月払いを返す', () => {
      expect(computeActualPaymentDate('2026-03-25', '25', 1)).toBe('2026-04-25');
    });

    it('offset=2 の翌々月払いを返す', () => {
      expect(computeActualPaymentDate('2026-03-25', '25', 2)).toBe('2026-05-25');
    });

    it('paymentDayOfMonth=0 は月末になる', () => {
      expect(computeActualPaymentDate('2026-03-25', '0', 1)).toBe('2026-04-30');
    });

    it('存在しない日付は月末へクランプされる', () => {
      expect(computeActualPaymentDate('2026-01-25', '31', 1)).toBe('2026-02-28');
    });

    it('年跨ぎを正しく処理する', () => {
      expect(computeActualPaymentDate('2026-12-25', '31', 1)).toBe('2027-01-31');
    });

    it('paymentDayOfMonth=null は null', () => {
      expect(computeActualPaymentDate('2026-03-25', null, 1)).toBeNull();
    });

    it('不正値は null', () => {
      expect(computeActualPaymentDate('2026-03-25', 'abc', 1)).toBeNull();
    });
  });

  describe('getCalculablePeriod', () => {
    it('通常: periodEnd + actualPaymentDate', () => {
      const result = getCalculablePeriod('2026-03-25', '2026-04-25');
      expect(result).toEqual({ calcStart: '2026-03-26', calcEnd: '2026-04-24' });
    });

    it('actualPaymentDate=null → null（常時計算可能）', () => {
      const result = getCalculablePeriod('2026-03-25', null);
      expect(result).toBeNull();
    });

    it('年跨ぎ: periodEnd=12月, actualPaymentDate=翌年1月', () => {
      const result = getCalculablePeriod('2026-12-25', '2027-01-25');
      expect(result).toEqual({ calcStart: '2026-12-26', calcEnd: '2027-01-24' });
    });
  });
});
