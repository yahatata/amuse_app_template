/**
 * payrollAttendanceValidation の単体テスト（Firestore 非依存）
 */

import { Timestamp } from 'firebase-admin/firestore';
import {
  validatePayrollAttendanceDocuments,
  validateSingleAttendanceForPayroll,
  DEFAULT_INVALID_ATTENDANCE_SAMPLE_LIMIT,
  type PayrollAttendanceValidationItem,
} from '../../src/domains/attendance/helpers/payrollAttendanceValidation';

const REQUEST_PERIOD_KEY = '2025-01-26_2025-02-25';

function baseGoodData(): Record<string, unknown> {
  return {
    staffId: 'staff-1',
    date: '2025-02-01',
    isDeleted: false,
    clockOut: Timestamp.fromMillis(1_700_000_000_000),
    paymentPeriodKey: REQUEST_PERIOD_KEY,
    payrollStatus: 'unreflected',
    weekStartDate: '2025-01-27',
    weekday: 6,
  };
}

function item(
  attendanceId: string,
  overrides?: {
    exists?: boolean;
    data?: Record<string, unknown> | null;
  }
): PayrollAttendanceValidationItem {
  const exists = overrides?.exists ?? true;
  const data =
    overrides?.data !== undefined
      ? overrides.data
      : exists
        ? baseGoodData()
        : null;
  return { attendanceId, exists, data };
}

describe('validateSingleAttendanceForPayroll', () => {
  it('正常系', () => {
    expect(validateSingleAttendanceForPayroll(item('a1'))).toBeNull();
  });

  it('missing attendance doc', () => {
    const r = validateSingleAttendanceForPayroll({
      attendanceId: 'missing-1',
      exists: false,
      data: null,
    });
    expect(r).toEqual({
      attendanceId: 'missing-1',
      staffId: null,
      date: null,
      reasons: ['missingAttendanceDoc'],
    });
  });

  it('isDeleted === true は NG', () => {
    const r = validateSingleAttendanceForPayroll(
      item('a1', { data: { ...baseGoodData(), isDeleted: true } })
    );
    expect(r?.reasons).toContain('attendanceDeleted');
  });

  it('staffId missing / invalid type / empty', () => {
    expect(
      validateSingleAttendanceForPayroll(item('a1', { data: { ...baseGoodData(), staffId: undefined } }))
        ?.reasons
    ).toContain('missingStaffId');

    expect(
      validateSingleAttendanceForPayroll(item('a1', { data: { ...baseGoodData(), staffId: 123 } }))
        ?.reasons
    ).toContain('invalidStaffIdType');

    expect(
      validateSingleAttendanceForPayroll(item('a1', { data: { ...baseGoodData(), staffId: '' } }))
        ?.reasons
    ).toContain('emptyStaffId');

    expect(
      validateSingleAttendanceForPayroll(item('a1', { data: { ...baseGoodData(), staffId: '   ' } }))
        ?.reasons
    ).toContain('emptyStaffId');
  });

  it('date missing / invalid type / invalid format', () => {
    expect(
      validateSingleAttendanceForPayroll(item('a1', { data: { ...baseGoodData(), date: undefined } }))
        ?.reasons
    ).toContain('missingDate');

    expect(
      validateSingleAttendanceForPayroll(item('a1', { data: { ...baseGoodData(), date: 20250201 } }))
        ?.reasons
    ).toContain('invalidDateType');

    expect(
      validateSingleAttendanceForPayroll(item('a1', { data: { ...baseGoodData(), date: '2025/02/01' } }))
        ?.reasons
    ).toContain('invalidDateFormat');
  });

  it('clockOut missing / invalid type', () => {
    expect(
      validateSingleAttendanceForPayroll(item('a1', { data: { ...baseGoodData(), clockOut: undefined } }))
        ?.reasons
    ).toContain('missingClockOut');

    expect(
      validateSingleAttendanceForPayroll(item('a1', { data: { ...baseGoodData(), clockOut: null } }))
        ?.reasons
    ).toContain('missingClockOut');

    expect(
      validateSingleAttendanceForPayroll(
        item('a1', { data: { ...baseGoodData(), clockOut: new Date() } })
      )?.reasons
    ).toContain('invalidClockOutType');

    expect(
      validateSingleAttendanceForPayroll(item('a1', { data: { ...baseGoodData(), clockOut: {} } }))
        ?.reasons
    ).toContain('invalidClockOutType');
  });

  it('paymentPeriodKey missing / invalid type / empty / invalid format', () => {
    expect(
      validateSingleAttendanceForPayroll(
        item('a1', { data: { ...baseGoodData(), paymentPeriodKey: undefined } })
      )?.reasons
    ).toContain('missingPaymentPeriodKey');

    expect(
      validateSingleAttendanceForPayroll(item('a1', { data: { ...baseGoodData(), paymentPeriodKey: 1 } }))
        ?.reasons
    ).toContain('invalidPaymentPeriodKeyType');

    expect(
      validateSingleAttendanceForPayroll(item('a1', { data: { ...baseGoodData(), paymentPeriodKey: '' } }))
        ?.reasons
    ).toContain('emptyPaymentPeriodKey');

    expect(
      validateSingleAttendanceForPayroll(
        item('a1', { data: { ...baseGoodData(), paymentPeriodKey: '2025-01-01' } })
      )?.reasons
    ).toContain('invalidPaymentPeriodKeyFormat');
  });

  it('payrollStatus missing / invalid type / invalid enum', () => {
    expect(
      validateSingleAttendanceForPayroll(item('a1', { data: { ...baseGoodData(), payrollStatus: undefined } }))
        ?.reasons
    ).toContain('missingPayrollStatus');

    expect(
      validateSingleAttendanceForPayroll(item('a1', { data: { ...baseGoodData(), payrollStatus: true } }))
        ?.reasons
    ).toContain('invalidPayrollStatusType');

    expect(
      validateSingleAttendanceForPayroll(
        item('a1', { data: { ...baseGoodData(), payrollStatus: 'pending' } })
      )?.reasons
    ).toContain('invalidPayrollStatusEnum');
  });

  it('weekStartDate missing / invalid type / empty / invalid format', () => {
    expect(
      validateSingleAttendanceForPayroll(
        item('a1', { data: { ...baseGoodData(), weekStartDate: undefined } })
      )?.reasons
    ).toContain('missingWeekStartDate');

    expect(
      validateSingleAttendanceForPayroll(item('a1', { data: { ...baseGoodData(), weekStartDate: 1 } }))
        ?.reasons
    ).toContain('invalidWeekStartDateType');

    expect(
      validateSingleAttendanceForPayroll(item('a1', { data: { ...baseGoodData(), weekStartDate: '' } }))
        ?.reasons
    ).toContain('emptyWeekStartDate');

    expect(
      validateSingleAttendanceForPayroll(
        item('a1', { data: { ...baseGoodData(), weekStartDate: '01-27-2025' } })
      )?.reasons
    ).toContain('invalidWeekStartDateFormat');
  });

  it('weekday missing / invalid type / out of range / non-integer', () => {
    expect(
      validateSingleAttendanceForPayroll(item('a1', { data: { ...baseGoodData(), weekday: undefined } }))
        ?.reasons
    ).toContain('missingWeekday');

    expect(
      validateSingleAttendanceForPayroll(item('a1', { data: { ...baseGoodData(), weekday: '6' } }))
        ?.reasons
    ).toContain('invalidWeekdayType');

    expect(
      validateSingleAttendanceForPayroll(item('a1', { data: { ...baseGoodData(), weekday: 1.5 } }))
        ?.reasons
    ).toContain('invalidWeekdayType');

    expect(
      validateSingleAttendanceForPayroll(item('a1', { data: { ...baseGoodData(), weekday: 7 } }))
        ?.reasons
    ).toContain('weekdayOutOfRange');

    expect(
      validateSingleAttendanceForPayroll(item('a1', { data: { ...baseGoodData(), weekday: -1 } }))
        ?.reasons
    ).toContain('weekdayOutOfRange');
  });

  it('複数 reasons が1 doc に載る', () => {
    const r = validateSingleAttendanceForPayroll(
      item('multi', {
        data: {
          ...baseGoodData(),
          staffId: '',
          date: 'bad',
          weekday: 99,
        },
      })
    );
    expect(r?.reasons.length).toBeGreaterThanOrEqual(3);
    expect(r?.reasons).toContain('emptyStaffId');
    expect(r?.reasons).toContain('invalidDateFormat');
    expect(r?.reasons).toContain('weekdayOutOfRange');
  });

  it('payrollStatus: corrected_after_reflection は OK', () => {
    expect(
      validateSingleAttendanceForPayroll(
        item('a1', { data: { ...baseGoodData(), payrollStatus: 'corrected_after_reflection' } })
      )
    ).toBeNull();
  });

  it('payrollStatus: reflected は OK', () => {
    expect(
      validateSingleAttendanceForPayroll(
        item('a1', { data: { ...baseGoodData(), payrollStatus: 'reflected' } })
      )
    ).toBeNull();
  });

  it('doc の paymentPeriodKey が request と異なるが形式が正しければ OK', () => {
    expect(
      validateSingleAttendanceForPayroll(
        item('carry', {
          data: {
            ...baseGoodData(),
            paymentPeriodKey: '2024-12-26_2025-01-25',
          },
        })
      )
    ).toBeNull();
  });
});

describe('validatePayrollAttendanceDocuments', () => {
  it('空配列は OK', () => {
    expect(validatePayrollAttendanceDocuments([], REQUEST_PERIOD_KEY)).toEqual({ ok: true });
  });

  it('正常系（複数 doc）', () => {
    const r = validatePayrollAttendanceDocuments(
      [item('a1'), item('a2', { data: { ...baseGoodData(), staffId: 'staff-2' } })],
      REQUEST_PERIOD_KEY
    );
    expect(r).toEqual({ ok: true });
  });

  it('複数 invalid doc がある', () => {
    const r = validatePayrollAttendanceDocuments(
      [
        item('bad1', { data: { ...baseGoodData(), staffId: '' } }),
        item('bad2', { data: { ...baseGoodData(), date: 'x' } }),
      ],
      REQUEST_PERIOD_KEY
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.invalidAttendanceCount).toBe(2);
      expect(r.invalidAttendanceSamples).toHaveLength(2);
    }
  });

  it('invalidAttendanceSamples が最大10件で打ち切られる', () => {
    const items = Array.from({ length: 11 }, (_, i) =>
      item(`att-${i}`, { exists: false, data: null })
    );
    const r = validatePayrollAttendanceDocuments(items, REQUEST_PERIOD_KEY, {
      invalidSampleLimit: DEFAULT_INVALID_ATTENDANCE_SAMPLE_LIMIT,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.invalidAttendanceCount).toBe(11);
      expect(r.invalidAttendanceSamples).toHaveLength(10);
    }
  });

  it('invalidSampleLimit を指定できる', () => {
    const items = Array.from({ length: 5 }, (_, i) =>
      item(`att-${i}`, { exists: false, data: null })
    );
    const r = validatePayrollAttendanceDocuments(items, REQUEST_PERIOD_KEY, {
      invalidSampleLimit: 3,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.invalidAttendanceCount).toBe(5);
      expect(r.invalidAttendanceSamples).toHaveLength(3);
    }
  });
});
