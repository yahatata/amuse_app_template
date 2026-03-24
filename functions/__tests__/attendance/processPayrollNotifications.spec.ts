/**
 * processPayrollNotifications — 条件評価ロジックの単体テスト
 *
 * evaluateScheduledNotifications は Firestore 非依存の純粋関数。
 * 参照: 07_NOTIFICATION_SCHEDULER_SPEC §2-1, §3-3, §3-4
 */

import {
  evaluateScheduledNotifications,
  computeActualPaymentDate,
} from '../../src/domains/attendance/tasks/processPayrollNotifications';
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
  it('paymentDate null → null', () => {
    expect(computeActualPaymentDate(null, '2026-03-25')).toBeNull();
  });

  it('翌月の paymentDay を返す', () => {
    expect(computeActualPaymentDate('25', '2026-03-25')).toBe('2026-04-25');
  });

  it('12月 → 翌年1月', () => {
    expect(computeActualPaymentDate('10', '2026-12-25')).toBe('2027-01-10');
  });

  it('月末を超える場合はクランプ', () => {
    expect(computeActualPaymentDate('31', '2026-01-25')).toBe('2026-02-28');
  });

  it('不正な文字列 → null', () => {
    expect(computeActualPaymentDate('abc', '2026-03-25')).toBeNull();
  });
});

describe('evaluateScheduledNotifications', () => {
  const REMINDER_DAYS = 3;
  const PAYMENT_DATE = '25';

  // ── payroll_period_start ──
  describe('payroll_period_start', () => {
    it('periodEnd + 1日 == today で latestRunId なし → 通知あり', () => {
      const period = makePeriodInfo();
      const actions = evaluateScheduledNotifications('2026-03-26', period, PAYMENT_DATE, REMINDER_DAYS);
      expect(triggerTypes(actions)).toContain('payroll_period_start');
    });

    it('periodEnd + 2日 → 通知なし', () => {
      const period = makePeriodInfo();
      const actions = evaluateScheduledNotifications('2026-03-27', period, PAYMENT_DATE, REMINDER_DAYS);
      expect(triggerTypes(actions)).not.toContain('payroll_period_start');
    });

    it('latestRunId が存在する → 通知なし', () => {
      const period = makePeriodInfo({ latestRunId: 'run1', monthlyPayrollStatus: 'draft' });
      const actions = evaluateScheduledNotifications('2026-03-26', period, PAYMENT_DATE, REMINDER_DAYS);
      expect(triggerTypes(actions)).not.toContain('payroll_period_start');
    });
  });

  // ── payroll_calc_remind ──
  describe('payroll_calc_remind', () => {
    it('periodEnd + N 日目で latestRunId なし → 通知あり', () => {
      const period = makePeriodInfo();
      const actions = evaluateScheduledNotifications('2026-03-28', period, PAYMENT_DATE, REMINDER_DAYS);
      expect(triggerTypes(actions)).toContain('payroll_calc_remind');
    });

    it('periodEnd + (N-1) 日目 → 通知なし', () => {
      const period = makePeriodInfo();
      const actions = evaluateScheduledNotifications('2026-03-27', period, PAYMENT_DATE, REMINDER_DAYS);
      expect(triggerTypes(actions)).not.toContain('payroll_calc_remind');
    });

    it('latestRunId あり → 通知なし', () => {
      const period = makePeriodInfo({ latestRunId: 'run1', monthlyPayrollStatus: 'draft' });
      const actions = evaluateScheduledNotifications('2026-03-28', period, PAYMENT_DATE, REMINDER_DAYS);
      expect(triggerTypes(actions)).not.toContain('payroll_calc_remind');
    });

    it('支払日3日前から strong_warning に昇格する', () => {
      const period = makePeriodInfo();
      const actions = evaluateScheduledNotifications('2026-04-22', period, PAYMENT_DATE, REMINDER_DAYS);
      const calcRemind = actions.find((a) => a.triggerType === 'payroll_calc_remind');
      expect(calcRemind).toBeDefined();
      expect(calcRemind!.typeOverride).toBe('strong_warning');
    });

    it('支払日4日前では warning のまま', () => {
      const period = makePeriodInfo();
      const actions = evaluateScheduledNotifications('2026-04-21', period, PAYMENT_DATE, REMINDER_DAYS);
      const calcRemind = actions.find((a) => a.triggerType === 'payroll_calc_remind');
      expect(calcRemind).toBeDefined();
      expect(calcRemind!.typeOverride).toBeUndefined();
    });
  });

  // ── payroll_confirm_remind ──
  describe('payroll_confirm_remind', () => {
    it('periodEnd + N 日以降、latestRunId あり + draft → 通知あり', () => {
      const period = makePeriodInfo({ latestRunId: 'run1', monthlyPayrollStatus: 'draft' });
      const actions = evaluateScheduledNotifications('2026-03-28', period, PAYMENT_DATE, REMINDER_DAYS);
      expect(triggerTypes(actions)).toContain('payroll_confirm_remind');
    });

    it('status == confirmed → 通知なし', () => {
      const period = makePeriodInfo({ latestRunId: 'run1', monthlyPayrollStatus: 'confirmed' });
      const actions = evaluateScheduledNotifications('2026-03-28', period, PAYMENT_DATE, REMINDER_DAYS);
      expect(triggerTypes(actions)).not.toContain('payroll_confirm_remind');
    });

    it('latestRunId なし（計算未実行） → 通知なし', () => {
      const period = makePeriodInfo();
      const actions = evaluateScheduledNotifications('2026-03-28', period, PAYMENT_DATE, REMINDER_DAYS);
      expect(triggerTypes(actions)).not.toContain('payroll_confirm_remind');
    });
  });

  // ── payroll_payment_overdue ──
  describe('payroll_payment_overdue', () => {
    it('支払日翌日 + confirmed → 通知あり', () => {
      const period = makePeriodInfo({ latestRunId: 'run1', monthlyPayrollStatus: 'confirmed' });
      const actions = evaluateScheduledNotifications('2026-04-26', period, PAYMENT_DATE, REMINDER_DAYS);
      expect(triggerTypes(actions)).toContain('payroll_payment_overdue');
    });

    it('支払日当日 → 通知なし', () => {
      const period = makePeriodInfo({ latestRunId: 'run1', monthlyPayrollStatus: 'confirmed' });
      const actions = evaluateScheduledNotifications('2026-04-25', period, PAYMENT_DATE, REMINDER_DAYS);
      expect(triggerTypes(actions)).not.toContain('payroll_payment_overdue');
    });

    it('status == paid → 通知なし', () => {
      const period = makePeriodInfo({ latestRunId: 'run1', monthlyPayrollStatus: 'paid' });
      const actions = evaluateScheduledNotifications('2026-04-26', period, PAYMENT_DATE, REMINDER_DAYS);
      expect(triggerTypes(actions)).not.toContain('payroll_payment_overdue');
    });

    it('status == hold → 通知なし', () => {
      const period = makePeriodInfo({ latestRunId: 'run1', monthlyPayrollStatus: 'hold' });
      const actions = evaluateScheduledNotifications('2026-04-26', period, PAYMENT_DATE, REMINDER_DAYS);
      expect(triggerTypes(actions)).not.toContain('payroll_payment_overdue');
    });

    it('paymentDate null → 通知なし', () => {
      const period = makePeriodInfo({ latestRunId: 'run1', monthlyPayrollStatus: 'confirmed' });
      const actions = evaluateScheduledNotifications('2026-04-26', period, null, REMINDER_DAYS);
      expect(triggerTypes(actions)).not.toContain('payroll_payment_overdue');
    });
  });

  // ── payroll_hold_reminder ──
  describe('payroll_hold_reminder', () => {
    it('月曜 + hold + holdCount > 0 → 通知あり', () => {
      // 2026-03-30 is Monday
      const period = makePeriodInfo({ latestRunId: 'run1', monthlyPayrollStatus: 'hold', holdCount: 2 });
      const actions = evaluateScheduledNotifications('2026-03-30', period, PAYMENT_DATE, REMINDER_DAYS);
      expect(triggerTypes(actions)).toContain('payroll_hold_reminder');
      const action = actions.find((a) => a.triggerType === 'payroll_hold_reminder');
      expect(action!.params.holdCount).toBe('2');
    });

    it('月曜以外 → 通知なし', () => {
      // 2026-03-31 is Tuesday
      const period = makePeriodInfo({ latestRunId: 'run1', monthlyPayrollStatus: 'hold', holdCount: 2 });
      const actions = evaluateScheduledNotifications('2026-03-31', period, PAYMENT_DATE, REMINDER_DAYS);
      expect(triggerTypes(actions)).not.toContain('payroll_hold_reminder');
    });

    it('holdCount == 0 → 通知なし', () => {
      const period = makePeriodInfo({ latestRunId: 'run1', monthlyPayrollStatus: 'hold', holdCount: 0 });
      const actions = evaluateScheduledNotifications('2026-03-30', period, PAYMENT_DATE, REMINDER_DAYS);
      expect(triggerTypes(actions)).not.toContain('payroll_hold_reminder');
    });

    it('status != hold → 通知なし', () => {
      const period = makePeriodInfo({ latestRunId: 'run1', monthlyPayrollStatus: 'confirmed', holdCount: 2 });
      const actions = evaluateScheduledNotifications('2026-03-30', period, PAYMENT_DATE, REMINDER_DAYS);
      expect(triggerTypes(actions)).not.toContain('payroll_hold_reminder');
    });
  });

  // ── 通知非作成 ──
  describe('条件不成立時', () => {
    it('periodEnd + 1日より前で何も起きていない → 通知 0 件', () => {
      const period = makePeriodInfo();
      const actions = evaluateScheduledNotifications('2026-03-25', period, PAYMENT_DATE, REMINDER_DAYS);
      expect(actions).toHaveLength(0);
    });

    it('全て完了済み (paid) → 通知 0 件', () => {
      const period = makePeriodInfo({ latestRunId: 'run1', monthlyPayrollStatus: 'paid' });
      const actions = evaluateScheduledNotifications('2026-04-26', period, PAYMENT_DATE, REMINDER_DAYS);
      expect(actions).toHaveLength(0);
    });
  });

  // ── 冪等キー ──
  describe('冪等キー', () => {
    it('同日同一 triggerType では同じ docId を返す', () => {
      const period = makePeriodInfo();
      const a1 = evaluateScheduledNotifications('2026-03-26', period, PAYMENT_DATE, REMINDER_DAYS);
      const a2 = evaluateScheduledNotifications('2026-03-26', period, PAYMENT_DATE, REMINDER_DAYS);
      expect(a1[0].docId).toBe(a2[0].docId);
    });

    it('異なる日では異なる docId を返す', () => {
      const period = makePeriodInfo();
      const a1 = evaluateScheduledNotifications('2026-03-28', period, PAYMENT_DATE, REMINDER_DAYS);
      const a2 = evaluateScheduledNotifications('2026-03-29', period, PAYMENT_DATE, REMINDER_DAYS);
      const calcRemind1 = a1.find((a) => a.triggerType === 'payroll_calc_remind');
      const calcRemind2 = a2.find((a) => a.triggerType === 'payroll_calc_remind');
      expect(calcRemind1!.docId).not.toBe(calcRemind2!.docId);
    });
  });
});
