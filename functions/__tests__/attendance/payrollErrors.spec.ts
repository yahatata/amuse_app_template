/**
 * payrollErrors の単体テスト
 */

import { PAYROLL_ERRORS } from '../../src/domains/attendance/helpers/payrollErrors';

describe('payrollErrors', () => {
  it('全12エラーコードが export されている', () => {
    const keys = Object.keys(PAYROLL_ERRORS);
    expect(keys).toHaveLength(12);
  });

  it('各エラーコードが正しい値を持つ', () => {
    expect(PAYROLL_ERRORS.PERMISSION_DENIED).toBe('permission-denied');
    expect(PAYROLL_ERRORS.ALREADY_CONFIRMED).toBe('already-confirmed');
    expect(PAYROLL_ERRORS.INVALID_PERIOD).toBe('invalid-period');
    expect(PAYROLL_ERRORS.NO_ATTENDANCE_SELECTED).toBe('no-attendance-selected');
    expect(PAYROLL_ERRORS.PAYROLL_CONFIG_NOT_FOUND).toBe('payroll-config-not-found');
    expect(PAYROLL_ERRORS.RUN_NOT_FOUND).toBe('run-not-found');
    expect(PAYROLL_ERRORS.RUN_NOT_COMPLETED).toBe('run-not-completed');
    expect(PAYROLL_ERRORS.INVALID_RUN_STATUS).toBe('invalid-run-status');
    expect(PAYROLL_ERRORS.RUN_CANCELLED).toBe('run-cancelled');
    expect(PAYROLL_ERRORS.NOT_CONFIRMED).toBe('not-confirmed');
    expect(PAYROLL_ERRORS.ALREADY_PAID).toBe('already-paid');
    expect(PAYROLL_ERRORS.STAFF_ALREADY_PAID).toBe('staff-already-paid');
  });

  it('PAYROLL_ERRORS の値が全て string である', () => {
    for (const value of Object.values(PAYROLL_ERRORS)) {
      expect(typeof value).toBe('string');
    }
  });
});
