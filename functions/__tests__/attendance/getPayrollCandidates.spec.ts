/**
 * getPayrollCandidates — 分類ロジックの単体テスト
 *
 * Firestore 非依存の classifyCandidates / buildEntry / applyMaxCountLimit を検証する。
 * Callable 全体の統合テストはエミュレータで実施。
 */

import {
  classifyCandidates,
  buildEntry,
  applyMaxCountLimit,
  collectCandidateStaffIds,
  buildStaffNameFallbackFromCandidates,
  type AttendanceDoc,
  type CandidateEntry,
} from '../../src/domains/attendance/callables/getPayrollCandidates';
import {
  findWageMissingStaff,
} from '../../src/domains/attendance/helpers/payrollHourlyWageValidation';

/** テスト用の Timestamp 風オブジェクト */
function fakeTimestamp(isoString: string) {
  return {
    toDate: () => new Date(isoString),
  };
}

/** テスト用 attendance doc を簡便に生成 */
function makeDoc(
  id: string,
  overrides: Record<string, unknown> = {}
): AttendanceDoc {
  return {
    id,
    data: {
      staffId: 'staff-1',
      staffsFullName: '田中太郎',
      date: '2026-03-10',
      weekday: 2,
      clockIn: fakeTimestamp('2026-03-10T09:00:00Z'),
      clockOut: fakeTimestamp('2026-03-10T18:00:00Z'),
      actualWorkMinutes: 480,
      nightWorkMinutes: 0,
      isDeleted: false,
      payrollStatus: 'unreflected',
      paymentPeriodKey: '2026-02-26_2026-03-25',
      ...overrides,
    },
  };
}

const PERIOD_KEY = '2026-02-26_2026-03-25';
const PERIOD_END = '2026-03-25';

describe('classifyCandidates', () => {
  it('期間内 + 退勤済 + 非削除 + unreflected → group1', () => {
    const doc = makeDoc('att-1');
    const result = classifyCandidates([doc], [doc], PERIOD_KEY, PERIOD_END, 1000);

    expect(result.group1).toHaveLength(1);
    expect(result.group1[0].attendanceId).toBe('att-1');
    expect(result.group1[0].reasonType).toBe('in_period');
    expect(result.group2).toHaveLength(0);
    expect(result.group3).toHaveLength(0);
  });

  it('期間内 + 退勤済 + corrected_after_reflection → group1', () => {
    const doc = makeDoc('att-2', { payrollStatus: 'corrected_after_reflection' });
    const result = classifyCandidates([doc], [doc], PERIOD_KEY, PERIOD_END, 1000);

    expect(result.group1).toHaveLength(1);
    expect(result.group1[0].reasonType).toBe('in_period');
  });

  it('期間内 + 退勤済 + reflected → 対象外（どのグループにも入らない）', () => {
    const inPeriodDoc = makeDoc('att-3', { payrollStatus: 'reflected' });
    // reflected は unreflectedSnap には入らない
    const result = classifyCandidates([inPeriodDoc], [], PERIOD_KEY, PERIOD_END, 1000);

    expect(result.group1).toHaveLength(0);
    expect(result.group2).toHaveLength(0);
    expect(result.group3).toHaveLength(0);
  });

  it('期間外 + 退勤済 + 非削除 + unreflected → group2', () => {
    const outOfPeriodDoc = makeDoc('att-4', {
      date: '2026-02-10',
      paymentPeriodKey: '2026-01-26_2026-02-25',
    });
    const result = classifyCandidates([], [outOfPeriodDoc], PERIOD_KEY, PERIOD_END, 1000);

    expect(result.group1).toHaveLength(0);
    expect(result.group2).toHaveLength(1);
    expect(result.group2[0].attendanceId).toBe('att-4');
    expect(result.group2[0].reasonType).toBe('carry_over');
    expect(result.group2[0].reasonLabel).toBe('キャリーオーバー');
  });

  it('期間内 + 未退勤 → group3', () => {
    const doc = makeDoc('att-5', { clockOut: null });
    const result = classifyCandidates([doc], [], PERIOD_KEY, PERIOD_END, 1000);

    expect(result.group3).toHaveLength(1);
    expect(result.group3[0].reasonType).toBe('other');
    expect(result.group3[0].reasonLabel).toBe('未退勤');
  });

  it('期間内 + 論理削除 → group3', () => {
    const doc = makeDoc('att-6', { isDeleted: true });
    const result = classifyCandidates([doc], [], PERIOD_KEY, PERIOD_END, 1000);

    expect(result.group3).toHaveLength(1);
    expect(result.group3[0].reasonType).toBe('other');
    expect(result.group3[0].reasonLabel).toBe('論理削除');
  });

  it('期間外 + 論理削除 → 返却対象外', () => {
    const outOfPeriodDeleted = makeDoc('att-7', {
      date: '2026-02-10',
      paymentPeriodKey: '2026-01-26_2026-02-25',
      isDeleted: true,
    });
    // unreflectedDocs に含まれていても isDeleted ならスキップ
    const result = classifyCandidates([], [outOfPeriodDeleted], PERIOD_KEY, PERIOD_END, 1000);

    expect(result.group1).toHaveLength(0);
    expect(result.group2).toHaveLength(0);
    expect(result.group3).toHaveLength(0);
  });

  it('date > periodEnd の attendance は group2 に入らない', () => {
    const futureDoc = makeDoc('att-future', {
      date: '2026-04-01',
      paymentPeriodKey: '2026-03-26_2026-04-25',
    });
    const result = classifyCandidates([], [futureDoc], PERIOD_KEY, PERIOD_END, 1000);

    expect(result.group2).toHaveLength(0);
  });

  it('期間外 + 未退勤 → 返却対象外', () => {
    const outOfPeriodNoClockOut = makeDoc('att-8', {
      date: '2026-02-10',
      paymentPeriodKey: '2026-01-26_2026-02-25',
      clockOut: null,
    });
    const result = classifyCandidates([], [outOfPeriodNoClockOut], PERIOD_KEY, PERIOD_END, 1000);

    expect(result.group2).toHaveLength(0);
  });

  it('inPeriodDocs と unreflectedDocs で重複する doc は group1 に分類される', () => {
    const doc = makeDoc('att-dup');
    const result = classifyCandidates([doc], [doc], PERIOD_KEY, PERIOD_END, 1000);

    expect(result.group1).toHaveLength(1);
    expect(result.group2).toHaveLength(0);
  });
});

describe('buildEntry', () => {
  it('全フィールドが正しくマッピングされる', () => {
    const data: Record<string, unknown> = {
      staffId: 'staff-x',
      staffsFullName: '佐藤花子',
      date: '2026-03-15',
      weekday: 0,
      clockIn: fakeTimestamp('2026-03-15T10:00:00Z'),
      clockOut: fakeTimestamp('2026-03-15T19:00:00Z'),
      actualWorkMinutes: 480,
      nightWorkMinutes: 60,
      isDeleted: false,
      payrollStatus: 'unreflected',
      paymentPeriodKey: '2026-02-26_2026-03-25',
    };

    const entry = buildEntry('doc-1', data, 'in_period', '期間内');

    expect(entry).toEqual({
      attendanceId: 'doc-1',
      staffId: 'staff-x',
      staffName: '佐藤花子',
      date: '2026-03-15',
      weekday: 0,
      clockIn: '2026-03-15T10:00:00.000Z',
      clockOut: '2026-03-15T19:00:00.000Z',
      actualWorkMinutes: 480,
      nightWorkMinutes: 60,
      reasonType: 'in_period',
      reasonLabel: '期間内',
      isDeleted: false,
      payrollStatus: 'unreflected',
      paymentPeriodKey: '2026-02-26_2026-03-25',
    });
  });

  it('clockOut が null の場合は null を返す', () => {
    const data: Record<string, unknown> = {
      staffId: 'staff-y',
      staffsFullName: '山田次郎',
      date: '2026-03-15',
      weekday: 0,
      clockIn: fakeTimestamp('2026-03-15T10:00:00Z'),
      clockOut: null,
      actualWorkMinutes: null,
      nightWorkMinutes: null,
      isDeleted: false,
      payrollStatus: 'unreflected',
      paymentPeriodKey: '2026-02-26_2026-03-25',
    };

    const entry = buildEntry('doc-2', data, 'other', '未退勤');

    expect(entry.clockOut).toBeNull();
    expect(entry.actualWorkMinutes).toBeNull();
    expect(entry.nightWorkMinutes).toBeNull();
  });

  it('フィールドが欠落している場合にデフォルト値が設定される', () => {
    const entry = buildEntry('doc-3', {}, 'other', 'テスト');

    expect(entry.staffId).toBe('');
    expect(entry.staffName).toBe('');
    expect(entry.date).toBe('');
    expect(entry.weekday).toBe(0);
    expect(entry.clockIn).toBe('');
    expect(entry.clockOut).toBeNull();
    expect(entry.actualWorkMinutes).toBeNull();
    expect(entry.nightWorkMinutes).toBeNull();
    expect(entry.isDeleted).toBe(false);
    expect(entry.payrollStatus).toBe('unreflected');
    expect(entry.paymentPeriodKey).toBe('');
  });
});

describe('applyMaxCountLimit', () => {
  function makeEntries(count: number, prefix: string): CandidateEntry[] {
    return Array.from({ length: count }, (_, i) =>
      buildEntry(`${prefix}-${i}`, {
        clockIn: fakeTimestamp('2026-03-10T09:00:00Z'),
      }, 'in_period', 'test')
    );
  }

  it('合計が maxCount 以下なら切り詰めない', () => {
    const g1 = makeEntries(3, 'g1');
    const g2 = makeEntries(2, 'g2');
    const g3 = makeEntries(1, 'g3');

    applyMaxCountLimit(g1, g2, g3, 10);

    expect(g1).toHaveLength(3);
    expect(g2).toHaveLength(2);
    expect(g3).toHaveLength(1);
  });

  it('超過分を group3 から削る', () => {
    const g1 = makeEntries(3, 'g1');
    const g2 = makeEntries(2, 'g2');
    const g3 = makeEntries(5, 'g3');

    applyMaxCountLimit(g1, g2, g3, 8);

    expect(g1).toHaveLength(3);
    expect(g2).toHaveLength(2);
    expect(g3).toHaveLength(3);
  });

  it('group3 では足りず group2 からも削る', () => {
    const g1 = makeEntries(5, 'g1');
    const g2 = makeEntries(4, 'g2');
    const g3 = makeEntries(2, 'g3');

    applyMaxCountLimit(g1, g2, g3, 7);

    expect(g1).toHaveLength(5);
    expect(g2).toHaveLength(2);
    expect(g3).toHaveLength(0);
  });

  it('group2 でも足りず group1 からも削る', () => {
    const g1 = makeEntries(10, 'g1');
    const g2 = makeEntries(3, 'g2');
    const g3 = makeEntries(2, 'g3');

    applyMaxCountLimit(g1, g2, g3, 5);

    expect(g1).toHaveLength(5);
    expect(g2).toHaveLength(0);
    expect(g3).toHaveLength(0);
  });

  it('maxCount=0 なら全て空になる', () => {
    const g1 = makeEntries(3, 'g1');
    const g2 = makeEntries(2, 'g2');
    const g3 = makeEntries(1, 'g3');

    applyMaxCountLimit(g1, g2, g3, 0);

    expect(g1).toHaveLength(0);
    expect(g2).toHaveLength(0);
    expect(g3).toHaveLength(0);
  });
});

describe('classifyCandidates — maxCandidatesCount 統合', () => {
  it('件数制限で group3 が優先的に削られる', () => {
    const inPeriod = [
      makeDoc('g1-1'),
      makeDoc('g1-2'),
      makeDoc('g3-1', { clockOut: null }),
      makeDoc('g3-2', { isDeleted: true }),
    ];
    const unreflected = [
      makeDoc('g1-1'),
      makeDoc('g1-2'),
      makeDoc('g2-1', { date: '2026-02-10', paymentPeriodKey: '2026-01-26_2026-02-25' }),
    ];

    // group1=2, group2=1, group3=2 → 合計5, maxCount=3
    const result = classifyCandidates(inPeriod, unreflected, PERIOD_KEY, PERIOD_END, 3);

    expect(result.group1).toHaveLength(2);
    expect(result.group2).toHaveLength(1);
    expect(result.group3).toHaveLength(0);
  });
});

describe('collectCandidateStaffIds', () => {
  it('group1/2 から staffId を重複排除して収集する', () => {
    const g1 = [
      buildEntry('a1', { staffId: 's1', staffsFullName: 'A' }, 'in_period', '期間内'),
      buildEntry('a2', { staffId: 's1', staffsFullName: 'A' }, 'in_period', '期間内'),
    ];
    const g2 = [
      buildEntry('b1', { staffId: 's2', staffsFullName: 'B' }, 'carry_over', 'CO'),
    ];
    expect(collectCandidateStaffIds(g1, g2).sort()).toEqual(['s1', 's2']);
  });
});

describe('wageMissingStaff resolution', () => {
  it('missing staff が wageMissingStaff に含まれ、正常 staff は含まれない', () => {
    const g1 = [
      buildEntry('a1', { staffId: 's-ok', staffsFullName: '正常' }, 'in_period', '期間内'),
      buildEntry('a2', { staffId: 's-miss', staffsFullName: '未設定' }, 'in_period', '期間内'),
    ];
    const staffDocsById = new Map<string, Record<string, unknown>>([
      ['s-ok', { fullName: '正常', hourlyWage: 1000 }],
      ['s-miss', { fullName: '未設定' }],
    ]);
    const missing = findWageMissingStaff({
      staffIds: collectCandidateStaffIds(g1, []),
      staffDocsById,
      staffNameFallback: buildStaffNameFallbackFromCandidates(g1, []),
    });
    expect(missing).toEqual([{ staffId: 's-miss', staffName: '未設定' }]);
  });
});

describe('paymentPeriodKey バリデーション', () => {
  const PERIOD_KEY_REGEX = /^\d{4}-\d{2}-\d{2}_\d{4}-\d{2}-\d{2}$/;

  it.each([
    ['2026-02-26_2026-03-25', true],
    ['2026-01-01_2026-01-31', true],
    ['202602-26_2026-03-25', false],
    ['2026-02-26', false],
    ['', false],
    ['abc_def', false],
    ['2026-2-26_2026-3-25', false],
  ])('"%s" → %s', (key, expected) => {
    expect(PERIOD_KEY_REGEX.test(key)).toBe(expected);
  });
});
