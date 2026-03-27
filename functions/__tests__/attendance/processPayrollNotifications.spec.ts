/**
 * processPayrollNotifications — 条件評価ロジックの単体テスト
 *
 * evaluateScheduledNotifications は Firestore 非依存の純粋関数。
 * 参照: 07_NOTIFICATION_SCHEDULER_SPEC §2-1, §3-3, §3-4
 */

import {
  evaluateScheduledNotifications,
} from '../../src/domains/attendance/tasks/processPayrollNotifications';
import { computeActualPaymentDate } from '../../src/domains/attendance/helpers/payrollPeriodUtils';
import type {
  PeriodInfo,
  NotificationAction,
} from '../../src/domains/attendance/tasks/processPayrollNotifications';

function makePeriodInfo(overrides: Partial<PeriodInfo> = {}): PeriodInfo {
  return {
    paymentPeriodKey: '2026-02-26_2026-03-25',
    periodStart: '2026-02-26',
    periodEnd: '2026-03-25',
    monthlyPayrollStatus: null,
    latestRunId: null,
    holdCount: 0,
    ...overrides,
  };
}

function triggerTypes(actions: NotificationAction[]): string[] {
  return actions.map((a) => a.triggerType);
}

describe('computeActualPaymentDate', () => {
  it('paymentDayOfMonth null → null', () => {
    expect(computeActualPaymentDate('2026-03-25', null, 1)).toBeNull();
  });

  it('offset=1 の翌月支給日を返す', () => {
    expect(computeActualPaymentDate('2026-03-25', '25', 1)).toBe('2026-04-25');
  });

  it('offset=0 の同月支給日を返す', () => {
    expect(computeActualPaymentDate('2026-03-25', '31', 0)).toBe('2026-03-31');
  });

  it('offset=2 の翌々月支給日を返す', () => {
    expect(computeActualPaymentDate('2026-03-25', '10', 2)).toBe('2026-05-10');
  });

  it('0 は月末を返す', () => {
    expect(computeActualPaymentDate('2026-03-25', '0', 1)).toBe('2026-04-30');
  });

  it('月末を超える場合はクランプ', () => {
    expect(computeActualPaymentDate('2026-01-25', '31', 1)).toBe('2026-02-28');
  });

  it('不正な文字列 → null', () => {
    expect(computeActualPaymentDate('2026-03-25', 'abc', 1)).toBeNull();
  });
});

describe('evaluateScheduledNotifications', () => {
  const REMINDER_DAYS = 3;
  const PAYMENT_DAY = '25';
  const PAYMENT_MONTH_OFFSET: 0 | 1 | 2 = 1;

  // ── payroll_period_start ──
  describe('payroll_period_start', () => {
    it('periodEnd + 1日 == today で latestRunId なし → 通知あり', () => {
      const period = makePeriodInfo();
      const actions = evaluateScheduledNotifications('2026-03-26', period, PAYMENT_DAY, PAYMENT_MONTH_OFFSET, REMINDER_DAYS);
      expect(triggerTypes(actions)).toContain('payroll_period_start');
    });

    it('periodEnd + 2日 → 通知なし', () => {
      const period = makePeriodInfo();
      const actions = evaluateScheduledNotifications('2026-03-27', period, PAYMENT_DAY, PAYMENT_MONTH_OFFSET, REMINDER_DAYS);
      expect(triggerTypes(actions)).not.toContain('payroll_period_start');
    });

    it('latestRunId が存在する → 通知なし', () => {
      const period = makePeriodInfo({ latestRunId: 'run1', monthlyPayrollStatus: 'draft' });
      const actions = evaluateScheduledNotifications('2026-03-26', period, PAYMENT_DAY, PAYMENT_MONTH_OFFSET, REMINDER_DAYS);
      expect(triggerTypes(actions)).not.toContain('payroll_period_start');
    });
  });

  // ── payroll_calc_remind ──
  describe('payroll_calc_remind', () => {
    it('periodEnd + N 日目で latestRunId なし → 通知あり', () => {
      const period = makePeriodInfo();
      const actions = evaluateScheduledNotifications('2026-03-28', period, PAYMENT_DAY, PAYMENT_MONTH_OFFSET, REMINDER_DAYS);
      expect(triggerTypes(actions)).toContain('payroll_calc_remind');
    });

    it('periodEnd + (N-1) 日目 → 通知なし', () => {
      const period = makePeriodInfo();
      const actions = evaluateScheduledNotifications('2026-03-27', period, PAYMENT_DAY, PAYMENT_MONTH_OFFSET, REMINDER_DAYS);
      expect(triggerTypes(actions)).not.toContain('payroll_calc_remind');
    });

    it('latestRunId あり → 通知なし', () => {
      const period = makePeriodInfo({ latestRunId: 'run1', monthlyPayrollStatus: 'draft' });
      const actions = evaluateScheduledNotifications('2026-03-28', period, PAYMENT_DAY, PAYMENT_MONTH_OFFSET, REMINDER_DAYS);
      expect(triggerTypes(actions)).not.toContain('payroll_calc_remind');
    });

    it('支払日3日前から strong_warning に昇格する', () => {
      const period = makePeriodInfo();
      const actions = evaluateScheduledNotifications('2026-04-22', period, PAYMENT_DAY, PAYMENT_MONTH_OFFSET, REMINDER_DAYS);
      const calcRemind = actions.find((a) => a.triggerType === 'payroll_calc_remind');
      expect(calcRemind).toBeDefined();
      expect(calcRemind!.typeOverride).toBe('strong_warning');
    });

    it('支払日4日前では warning のまま', () => {
      const period = makePeriodInfo();
      const actions = evaluateScheduledNotifications('2026-04-21', period, PAYMENT_DAY, PAYMENT_MONTH_OFFSET, REMINDER_DAYS);
      const calcRemind = actions.find((a) => a.triggerType === 'payroll_calc_remind');
      expect(calcRemind).toBeDefined();
      expect(calcRemind!.typeOverride).toBeUndefined();
    });

    it('同月払いでも実支給日3日前から strong_warning に昇格する', () => {
      const period = makePeriodInfo({ periodEnd: '2026-03-25' });
      const actions = evaluateScheduledNotifications('2026-03-28', period, '31', 0, REMINDER_DAYS);
      const calcRemind = actions.find((a) => a.triggerType === 'payroll_calc_remind');
      expect(calcRemind?.typeOverride).toBe('strong_warning');
    });
  });

  // ── payroll_confirm_remind ──
  describe('payroll_confirm_remind', () => {
    it('periodEnd + N 日以降、latestRunId あり + draft → 通知あり', () => {
      const period = makePeriodInfo({ latestRunId: 'run1', monthlyPayrollStatus: 'draft' });
      const actions = evaluateScheduledNotifications('2026-03-28', period, PAYMENT_DAY, PAYMENT_MONTH_OFFSET, REMINDER_DAYS);
      expect(triggerTypes(actions)).toContain('payroll_confirm_remind');
    });

    it('status == confirmed → 通知なし', () => {
      const period = makePeriodInfo({ latestRunId: 'run1', monthlyPayrollStatus: 'confirmed' });
      const actions = evaluateScheduledNotifications('2026-03-28', period, PAYMENT_DAY, PAYMENT_MONTH_OFFSET, REMINDER_DAYS);
      expect(triggerTypes(actions)).not.toContain('payroll_confirm_remind');
    });

    it('latestRunId なし（計算未実行） → 通知なし', () => {
      const period = makePeriodInfo();
      const actions = evaluateScheduledNotifications('2026-03-28', period, PAYMENT_DAY, PAYMENT_MONTH_OFFSET, REMINDER_DAYS);
      expect(triggerTypes(actions)).not.toContain('payroll_confirm_remind');
    });
  });

  // ── payroll_payment_overdue ──
  describe('payroll_payment_overdue', () => {
    it('支払日翌日 + confirmed → 通知あり', () => {
      const period = makePeriodInfo({ latestRunId: 'run1', monthlyPayrollStatus: 'confirmed' });
      const actions = evaluateScheduledNotifications('2026-04-26', period, PAYMENT_DAY, PAYMENT_MONTH_OFFSET, REMINDER_DAYS);
      expect(triggerTypes(actions)).toContain('payroll_payment_overdue');
    });

    it('支払日当日 → 通知なし', () => {
      const period = makePeriodInfo({ latestRunId: 'run1', monthlyPayrollStatus: 'confirmed' });
      const actions = evaluateScheduledNotifications('2026-04-25', period, PAYMENT_DAY, PAYMENT_MONTH_OFFSET, REMINDER_DAYS);
      expect(triggerTypes(actions)).not.toContain('payroll_payment_overdue');
    });

    it('status == paid → 通知なし', () => {
      const period = makePeriodInfo({ latestRunId: 'run1', monthlyPayrollStatus: 'paid' });
      const actions = evaluateScheduledNotifications('2026-04-26', period, PAYMENT_DAY, PAYMENT_MONTH_OFFSET, REMINDER_DAYS);
      expect(triggerTypes(actions)).not.toContain('payroll_payment_overdue');
    });

    it('status == hold → 通知なし', () => {
      const period = makePeriodInfo({ latestRunId: 'run1', monthlyPayrollStatus: 'hold' });
      const actions = evaluateScheduledNotifications('2026-04-26', period, PAYMENT_DAY, PAYMENT_MONTH_OFFSET, REMINDER_DAYS);
      expect(triggerTypes(actions)).not.toContain('payroll_payment_overdue');
    });

    it('paymentDayOfMonth null → 通知なし', () => {
      const period = makePeriodInfo({ latestRunId: 'run1', monthlyPayrollStatus: 'confirmed' });
      const actions = evaluateScheduledNotifications('2026-04-26', period, null, PAYMENT_MONTH_OFFSET, REMINDER_DAYS);
      expect(triggerTypes(actions)).not.toContain('payroll_payment_overdue');
    });

    it('翌々月払いは実支給日を過ぎるまで overdue にならない', () => {
      const period = makePeriodInfo({ latestRunId: 'run1', monthlyPayrollStatus: 'confirmed' });
      const actions = evaluateScheduledNotifications('2026-05-24', period, '25', 2, REMINDER_DAYS);
      expect(triggerTypes(actions)).not.toContain('payroll_payment_overdue');
    });

    it('0=月末の翌日から overdue になる', () => {
      const period = makePeriodInfo({ latestRunId: 'run1', monthlyPayrollStatus: 'confirmed', periodEnd: '2026-03-25' });
      const actions = evaluateScheduledNotifications('2026-05-01', period, '0', 1, REMINDER_DAYS);
      expect(triggerTypes(actions)).toContain('payroll_payment_overdue');
    });
  });

  // ── payroll_hold_reminder ──
  describe('payroll_hold_reminder', () => {
    it('月曜 + hold + holdCount > 0 → 通知あり', () => {
      // 2026-03-30 is Monday
      const period = makePeriodInfo({ latestRunId: 'run1', monthlyPayrollStatus: 'hold', holdCount: 2 });
      const actions = evaluateScheduledNotifications('2026-03-30', period, PAYMENT_DAY, PAYMENT_MONTH_OFFSET, REMINDER_DAYS);
      expect(triggerTypes(actions)).toContain('payroll_hold_reminder');
      const action = actions.find((a) => a.triggerType === 'payroll_hold_reminder');
      expect(action!.params.holdCount).toBe('2');
    });

    it('月曜以外 → 通知なし', () => {
      // 2026-03-31 is Tuesday
      const period = makePeriodInfo({ latestRunId: 'run1', monthlyPayrollStatus: 'hold', holdCount: 2 });
      const actions = evaluateScheduledNotifications('2026-03-31', period, PAYMENT_DAY, PAYMENT_MONTH_OFFSET, REMINDER_DAYS);
      expect(triggerTypes(actions)).not.toContain('payroll_hold_reminder');
    });

    it('holdCount == 0 → 通知なし', () => {
      const period = makePeriodInfo({ latestRunId: 'run1', monthlyPayrollStatus: 'hold', holdCount: 0 });
      const actions = evaluateScheduledNotifications('2026-03-30', period, PAYMENT_DAY, PAYMENT_MONTH_OFFSET, REMINDER_DAYS);
      expect(triggerTypes(actions)).not.toContain('payroll_hold_reminder');
    });

    it('status != hold → 通知なし', () => {
      const period = makePeriodInfo({ latestRunId: 'run1', monthlyPayrollStatus: 'confirmed', holdCount: 2 });
      const actions = evaluateScheduledNotifications('2026-03-30', period, PAYMENT_DAY, PAYMENT_MONTH_OFFSET, REMINDER_DAYS);
      expect(triggerTypes(actions)).not.toContain('payroll_hold_reminder');
    });
  });

  // ── 通知非作成 ──
  describe('条件不成立時', () => {
    it('periodEnd + 1日より前で何も起きていない → 通知 0 件', () => {
      const period = makePeriodInfo();
      const actions = evaluateScheduledNotifications('2026-03-25', period, PAYMENT_DAY, PAYMENT_MONTH_OFFSET, REMINDER_DAYS);
      expect(actions).toHaveLength(0);
    });

    it('全て完了済み (paid) → 通知 0 件', () => {
      const period = makePeriodInfo({ latestRunId: 'run1', monthlyPayrollStatus: 'paid' });
      const actions = evaluateScheduledNotifications('2026-04-26', period, PAYMENT_DAY, PAYMENT_MONTH_OFFSET, REMINDER_DAYS);
      expect(actions).toHaveLength(0);
    });
  });

  // ── 冪等キー ──
  describe('冪等キー', () => {
    it('同日同一 triggerType では同じ docId を返す', () => {
      const period = makePeriodInfo();
      const a1 = evaluateScheduledNotifications('2026-03-26', period, PAYMENT_DAY, PAYMENT_MONTH_OFFSET, REMINDER_DAYS);
      const a2 = evaluateScheduledNotifications('2026-03-26', period, PAYMENT_DAY, PAYMENT_MONTH_OFFSET, REMINDER_DAYS);
      expect(a1[0].docId).toBe(a2[0].docId);
    });

    it('異なる日では異なる docId を返す', () => {
      const period = makePeriodInfo();
      const a1 = evaluateScheduledNotifications('2026-03-28', period, PAYMENT_DAY, PAYMENT_MONTH_OFFSET, REMINDER_DAYS);
      const a2 = evaluateScheduledNotifications('2026-03-29', period, PAYMENT_DAY, PAYMENT_MONTH_OFFSET, REMINDER_DAYS);
      const calcRemind1 = a1.find((a) => a.triggerType === 'payroll_calc_remind');
      const calcRemind2 = a2.find((a) => a.triggerType === 'payroll_calc_remind');
      expect(calcRemind1!.docId).not.toBe(calcRemind2!.docId);
    });
  });
});
