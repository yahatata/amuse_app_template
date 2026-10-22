/**
 * payrollHourlyWageValidation の単体テスト
 */

import { HttpsError } from 'firebase-functions/v2/https';
import {
  isHourlyWageConfigured,
  findWageMissingStaff,
  assertNoHourlyWageMissingStaff,
  PAYROLL_HOURLY_WAGE_MISSING_ERROR_KEY,
} from '../../src/domains/attendance/helpers/payrollHourlyWageValidation';

describe('isHourlyWageConfigured', () => {
  it('field missing → false', () => {
    expect(isHourlyWageConfigured({})).toBe(false);
  });

  it('null → false', () => {
    expect(isHourlyWageConfigured({ hourlyWage: null })).toBe(false);
  });

  it('undefined → false', () => {
    expect(isHourlyWageConfigured({ hourlyWage: undefined })).toBe(false);
  });

  it('non-number → false', () => {
    expect(isHourlyWageConfigured({ hourlyWage: '1000' })).toBe(false);
  });

  it('NaN → false', () => {
    expect(isHourlyWageConfigured({ hourlyWage: NaN })).toBe(false);
  });

  it('Infinity → false', () => {
    expect(isHourlyWageConfigured({ hourlyWage: Infinity })).toBe(false);
  });

  it('Case C: hourlyWage=0 → configured (accept)', () => {
    expect(isHourlyWageConfigured({ hourlyWage: 0 })).toBe(true);
  });

  it('Case D: hourlyWage=1000 → true', () => {
    expect(isHourlyWageConfigured({ hourlyWage: 1000 })).toBe(true);
  });

  it('staff doc missing → false', () => {
    expect(isHourlyWageConfigured(undefined)).toBe(false);
    expect(isHourlyWageConfigured(null)).toBe(false);
  });
});

describe('findWageMissingStaff', () => {
  const staffDocsById = new Map<string, Record<string, unknown>>([
    ['staff-ok', { fullName: '正常太郎', hourlyWage: 1000 }],
    ['staff-zero', { fullName: '零円花子', hourlyWage: 0 }],
    ['staff-missing', { fullName: '未設定次郎' }],
    ['staff-null', { fullName: 'Null三郎', hourlyWage: null }],
  ]);

  it('returns only missing/null staff', () => {
    const missing = findWageMissingStaff({
      staffIds: ['staff-ok', 'staff-zero', 'staff-missing', 'staff-null', 'staff-unknown'],
      staffDocsById,
      staffNameFallback: new Map([['staff-unknown', '不明スタッフ']]),
    });

    expect(missing.map((m) => m.staffId).sort()).toEqual(
      ['staff-missing', 'staff-null', 'staff-unknown'].sort()
    );
    expect(missing.find((m) => m.staffId === 'staff-missing')?.staffName).toBe('未設定次郎');
    expect(missing.find((m) => m.staffId === 'staff-unknown')?.staffName).toBe('不明スタッフ');
  });

  it('does not include configured staff including explicit 0', () => {
    const missing = findWageMissingStaff({
      staffIds: ['staff-ok', 'staff-zero'],
      staffDocsById,
    });
    expect(missing).toHaveLength(0);
  });

  it('deduplicates staffIds', () => {
    const missing = findWageMissingStaff({
      staffIds: ['staff-missing', 'staff-missing'],
      staffDocsById,
    });
    expect(missing).toHaveLength(1);
  });
});

describe('assertNoHourlyWageMissingStaff', () => {
  it('throws PAYROLL_HOURLY_WAGE_MISSING with context', () => {
    expect(() =>
      assertNoHourlyWageMissingStaff([
        { staffId: 's1', staffName: 'A' },
        { staffId: 's2', staffName: 'B' },
      ])
    ).toThrow(HttpsError);

    try {
      assertNoHourlyWageMissingStaff([{ staffId: 's1', staffName: 'A' }]);
    } catch (error) {
      expect(error).toBeInstanceOf(HttpsError);
      const err = error as HttpsError;
      expect(err.code).toBe('failed-precondition');
      const details = err.details as {
        errorKey?: string;
        context?: { staffIds?: string[]; staffNames?: string[] };
      };
      expect(details.errorKey).toBe(PAYROLL_HOURLY_WAGE_MISSING_ERROR_KEY);
      expect(details.context?.staffIds).toEqual(['s1']);
      expect(details.context?.staffNames).toEqual(['A']);
    }
  });

  it('does nothing when empty', () => {
    expect(() => assertNoHourlyWageMissingStaff([])).not.toThrow();
  });
});
