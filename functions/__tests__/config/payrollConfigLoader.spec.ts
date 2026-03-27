/**
 * payrollConfigLoader の単体テスト
 *
 * 参照: docs/config_migration/phase4_3/specs/02_CONFIG_SPEC.md
 */

jest.unmock('../../src/shared/config/payrollConfigLoader');

import {
  buildPayrollConfigFromDefaults,
  mergePayrollConfigWithDefaults,
  mergePayrollConfigForUpsert,
} from '../../src/shared/config/payrollConfigLoader';
import {
  DEFAULT_PAYROLL_CONFIG_PAYMENT_DAY_OF_MONTH,
  DEFAULT_PAYROLL_CONFIG_PAYMENT_MONTH_OFFSET,
  DEFAULT_PAYROLL_CONFIG_BULK_PAYMENT_REGISTRATION_ENABLED,
  DEFAULT_PAYROLL_CONFIG_EXPECTED_RANGE,
  DEFAULT_PAYROLL_CONFIG_MAX_CANDIDATES_COUNT,
  DEFAULT_PAYROLL_CONFIG_WEEK_START_DAY,
  DEFAULT_PAYROLL_CONFIG_WEEKLY_LEGAL_LIMIT_MINUTES,
  DEFAULT_PAYROLL_CONFIG_LEGAL_HOLIDAY_WEEKDAY,
  DEFAULT_PAYROLL_CONFIG_CALC_VERSION,
  DEFAULT_PAYROLL_CONFIG_NIGHT_PREMIUM_RATE,
  DEFAULT_PAYROLL_CONFIG_OVERTIME_PREMIUM_RATE,
  DEFAULT_PAYROLL_CONFIG_OVER_60_PREMIUM_RATE,
  DEFAULT_PAYROLL_CONFIG_LEGAL_HOLIDAY_PREMIUM_RATE,
  DEFAULT_PAYROLL_CONFIG_ROUNDING_METHOD,
  DEFAULT_PAYROLL_CONFIG_ROUNDING_PRECISION,
  DEFAULT_PAYROLL_CONFIG_SCHEDULER_NOTIFICATION_HOUR,
  DEFAULT_PAYROLL_CONFIG_REMINDER_START_DAYS_AFTER_PERIOD_END,
} from '../../src/shared/config/payrollConfigDefaults';

describe('payrollConfigLoader', () => {
  const warnSpy = jest.spyOn(require('firebase-functions').logger, 'warn').mockImplementation(() => {});
  const errorSpy = jest.spyOn(require('firebase-functions').logger, 'error').mockImplementation(() => {});
  const infoSpy = jest.spyOn(require('firebase-functions').logger, 'info').mockImplementation(() => {});

  beforeEach(() => {
    warnSpy.mockClear();
    errorSpy.mockClear();
    infoSpy.mockClear();
  });

  afterAll(() => {
    warnSpy.mockRestore();
    errorSpy.mockRestore();
    infoSpy.mockRestore();
  });

  describe('buildPayrollConfigFromDefaults', () => {
    it('全17フィールドがデフォルト値と一致する', () => {
      const config = buildPayrollConfigFromDefaults();
      expect(config.paymentDayOfMonth).toBe(DEFAULT_PAYROLL_CONFIG_PAYMENT_DAY_OF_MONTH);
      expect(config.paymentMonthOffset).toBe(DEFAULT_PAYROLL_CONFIG_PAYMENT_MONTH_OFFSET);
      expect(config.bulkPaymentRegistrationEnabled).toBe(DEFAULT_PAYROLL_CONFIG_BULK_PAYMENT_REGISTRATION_ENABLED);
      expect(config.expectedRange).toBe(DEFAULT_PAYROLL_CONFIG_EXPECTED_RANGE);
      expect(config.maxCandidatesCount).toBe(DEFAULT_PAYROLL_CONFIG_MAX_CANDIDATES_COUNT);
      expect(config.weekStartDay).toBe(DEFAULT_PAYROLL_CONFIG_WEEK_START_DAY);
      expect(config.weeklyLegalLimitMinutes).toBe(DEFAULT_PAYROLL_CONFIG_WEEKLY_LEGAL_LIMIT_MINUTES);
      expect(config.legalHolidayWeekday).toBe(DEFAULT_PAYROLL_CONFIG_LEGAL_HOLIDAY_WEEKDAY);
      expect(config.calcVersion).toBe(DEFAULT_PAYROLL_CONFIG_CALC_VERSION);
      expect(config.nightPremiumRate).toBe(DEFAULT_PAYROLL_CONFIG_NIGHT_PREMIUM_RATE);
      expect(config.overtimePremiumRate).toBe(DEFAULT_PAYROLL_CONFIG_OVERTIME_PREMIUM_RATE);
      expect(config.over60PremiumRate).toBe(DEFAULT_PAYROLL_CONFIG_OVER_60_PREMIUM_RATE);
      expect(config.legalHolidayPremiumRate).toBe(DEFAULT_PAYROLL_CONFIG_LEGAL_HOLIDAY_PREMIUM_RATE);
      expect(config.roundingMethod).toBe(DEFAULT_PAYROLL_CONFIG_ROUNDING_METHOD);
      expect(config.roundingPrecision).toBe(DEFAULT_PAYROLL_CONFIG_ROUNDING_PRECISION);
      expect(config.schedulerNotificationHour).toBe(DEFAULT_PAYROLL_CONFIG_SCHEDULER_NOTIFICATION_HOUR);
      expect(config.reminderStartDaysAfterPeriodEnd).toBe(DEFAULT_PAYROLL_CONFIG_REMINDER_START_DAYS_AFTER_PERIOD_END);
    });
  });

  describe('mergePayrollConfigWithDefaults', () => {
    it('新フィールドの値がデフォルトより優先される', () => {
      const config = mergePayrollConfigWithDefaults({
        paymentDayOfMonth: '25',
        paymentMonthOffset: 0,
        weekStartDay: 1,
        weeklyLegalLimitMinutes: 2640,
        nightPremiumRate: 0.30,
        roundingMethod: 'round',
        roundingPrecision: 10,
      });
      expect(config.paymentDayOfMonth).toBe('25');
      expect(config.paymentMonthOffset).toBe(0);
      expect(config.weekStartDay).toBe(1);
      expect(config.weeklyLegalLimitMinutes).toBe(2640);
      expect(config.nightPremiumRate).toBe(0.30);
      expect(config.roundingMethod).toBe('round');
      expect(config.roundingPrecision).toBe(10);
      // 未設定フィールドはデフォルト
      expect(config.legalHolidayWeekday).toBe(DEFAULT_PAYROLL_CONFIG_LEGAL_HOLIDAY_WEEKDAY);
      expect(config.calcVersion).toBe(DEFAULT_PAYROLL_CONFIG_CALC_VERSION);
    });

    it('旧 paymentDate が paymentDayOfMonth に読み替えられる', () => {
      const config = mergePayrollConfigWithDefaults({
        paymentDate: '2026-04-25',
      });
      expect(config.paymentDayOfMonth).toBe('25');
      expect(config.paymentMonthOffset).toBe(DEFAULT_PAYROLL_CONFIG_PAYMENT_MONTH_OFFSET);
    });

    it('旧 paymentDate の日のみ文字列も読み替えられる', () => {
      const config = mergePayrollConfigWithDefaults({
        paymentDate: '0',
      });
      expect(config.paymentDayOfMonth).toBe('0');
    });

    it('無効な paymentDayOfMonth は null にフォールバックする', () => {
      const config = mergePayrollConfigWithDefaults({
        paymentDayOfMonth: '32',
      });
      expect(config.paymentDayOfMonth).toBeNull();
    });

    it('無効な paymentMonthOffset はデフォルトにフォールバックする', () => {
      const config = mergePayrollConfigWithDefaults({
        paymentMonthOffset: 3,
      });
      expect(config.paymentMonthOffset).toBe(DEFAULT_PAYROLL_CONFIG_PAYMENT_MONTH_OFFSET);
    });

    it('不正な roundingMethod はデフォルトにフォールバック', () => {
      const config = mergePayrollConfigWithDefaults({
        roundingMethod: 'invalid',
      });
      expect(config.roundingMethod).toBe('floor');
    });

    it('legalHolidayWeekday = null が正当値として保持される', () => {
      const config = mergePayrollConfigWithDefaults({
        legalHolidayWeekday: null,
      });
      expect(config.legalHolidayWeekday).toBeNull();
    });

    it('legalHolidayWeekday = 0（日曜）が正当値として保持される', () => {
      const config = mergePayrollConfigWithDefaults({
        legalHolidayWeekday: 0,
      });
      expect(config.legalHolidayWeekday).toBe(0);
    });

    it('不正な型の値はデフォルトにフォールバック', () => {
      const config = mergePayrollConfigWithDefaults({
        weekStartDay: 'monday',
        nightPremiumRate: 'high',
        roundingPrecision: -1,
      });
      expect(config.weekStartDay).toBe(0);
      expect(config.nightPremiumRate).toBe(0.25);
      expect(config.roundingPrecision).toBe(1);
    });

    it('expectedRange のオブジェクトが正しくパースされる', () => {
      const config = mergePayrollConfigWithDefaults({
        expectedRange: {
          attendanceCountMin: 10,
          attendanceCountMax: 50,
          totalHoursMin: 100,
        },
      });
      expect(config.expectedRange).toEqual({
        attendanceCountMin: 10,
        attendanceCountMax: 50,
        totalHoursMin: 100,
      });
    });

    it('expectedRange = null が正当値として保持される', () => {
      const config = mergePayrollConfigWithDefaults({
        expectedRange: null,
      });
      expect(config.expectedRange).toBeNull();
    });
  });

  describe('mergePayrollConfigForUpsert', () => {
    it('既存値を上書きしない', () => {
      const defaults = buildPayrollConfigFromDefaults();
      const merged = mergePayrollConfigForUpsert(
        {
          paymentDayOfMonth: '25',
          paymentMonthOffset: 0,
          weekStartDay: 1,
          legalHolidayWeekday: 0,
          roundingMethod: 'ceil',
        },
        defaults
      );
      expect(merged.paymentDayOfMonth).toBe('25');
      expect(merged.paymentMonthOffset).toBe(0);
      expect(merged.weekStartDay).toBe(1);
      expect(merged.legalHolidayWeekday).toBe(0);
      expect(merged.roundingMethod).toBe('ceil');
    });

    it('不足フィールドのみデフォルトで補完される', () => {
      const defaults = buildPayrollConfigFromDefaults();
      const merged = mergePayrollConfigForUpsert(
        { paymentDate: '2026-04-25', weekStartDay: 1 },
        defaults
      );
      expect(merged.paymentDayOfMonth).toBe('25');
      expect(merged.paymentMonthOffset).toBe(DEFAULT_PAYROLL_CONFIG_PAYMENT_MONTH_OFFSET);
      expect(merged.weekStartDay).toBe(1);
      expect(merged.weeklyLegalLimitMinutes).toBe(2400);
      expect(merged.legalHolidayWeekday).toBeNull();
      expect(merged.roundingMethod).toBe('floor');
    });
  });

  // getPayrollConfig の Firestore 結合テストは firebase emulators:exec 経由で実行する。
  // setupFirebase.ts が FIRESTORE_EMULATOR_HOST を常にセットするが、
  // エミュレータプロセスが実際に起動していないと Firestore 操作がタイムアウトする。
  // 単体テスト（buildFromDefaults, merge*）で全分岐をカバーしているため、
  // ここでは結合テストを定義しない。
});
