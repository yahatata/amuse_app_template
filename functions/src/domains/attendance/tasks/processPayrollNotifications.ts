/**
 * processPayrollNotifications — onTaskDispatched
 *
 * 1日1回実行。対象期間の monthlyPayroll を読み取り、
 * 5種のスケジューラー経由通知の条件を評価・作成する。
 *
 * 参照: 07_NOTIFICATION_SCHEDULER_SPEC §3-3
 */

import { onTaskDispatched } from 'firebase-functions/v2/tasks';
import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';

import { getPayrollConfig } from '../../../shared/config/payrollConfigLoader';
import { getStoreConfig } from '../../../shared/config/configLoader';
import { getPayrollPeriodRange } from '../helpers/payrollPeriodUtils';
import {
  createPayrollNotification,
  buildSchedulerIdempotencyKey,
} from '../helpers/payrollNotificationHelper';
import {
  DEFAULT_PAYROLL_START_DAY,
  DEFAULT_PAYROLL_END_DAY,
} from '../../../shared/config/defaults';

// ─── Pure types & helpers (Firestore-independent, unit-testable) ───

export interface PeriodInfo {
  paymentPeriodKey: string;
  periodStart: string;
  periodEnd: string;
  monthlyPayrollStatus: string | null;
  latestRunId: string | null;
  holdCount: number;
}

export interface NotificationAction {
  triggerType: string;
  params: Record<string, string>;
  docId: string;
  typeOverride?: string;
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + days);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${dd}`;
}

/**
 * 期間終了月の翌月の paymentDay 日を実際の支払日として算出する。
 */
export function computeActualPaymentDate(
  paymentDayStr: string | null,
  periodEnd: string
): string | null {
  if (!paymentDayStr) return null;
  const paymentDay = parseInt(paymentDayStr, 10);
  if (isNaN(paymentDay) || paymentDay < 1 || paymentDay > 31) return null;

  const [y, m] = periodEnd.split('-').map(Number);
  let payMonth = m + 1;
  let payYear = y;
  if (payMonth > 12) {
    payMonth = 1;
    payYear++;
  }

  const lastDay = new Date(payYear, payMonth, 0).getDate();
  const clampedDay = Math.min(paymentDay, lastDay);
  return `${payYear}-${String(payMonth).padStart(2, '0')}-${String(clampedDay).padStart(2, '0')}`;
}

/**
 * 5種のスケジューラー通知条件を純粋に評価する（Firestore 非依存）。
 */
export function evaluateScheduledNotifications(
  todayStr: string,
  recentPeriod: PeriodInfo,
  paymentDate: string | null,
  reminderStartDays: number
): NotificationAction[] {
  const actions: NotificationAction[] = [];

  const dayAfterPeriodEnd = addDays(recentPeriod.periodEnd, 1);
  const reminderStartDate = addDays(recentPeriod.periodEnd, reminderStartDays);
  const actualPaymentDate = computeActualPaymentDate(paymentDate, recentPeriod.periodEnd);

  // 1. payroll_period_start: periodEnd+1 == today, まだ計算未実行
  if (
    todayStr === dayAfterPeriodEnd &&
    (!recentPeriod.monthlyPayrollStatus || !recentPeriod.latestRunId)
  ) {
    actions.push({
      triggerType: 'payroll_period_start',
      params: {
        periodStart: recentPeriod.periodStart,
        periodEnd: recentPeriod.periodEnd,
      },
      docId: buildSchedulerIdempotencyKey(
        'payroll_period_start',
        recentPeriod.paymentPeriodKey,
        todayStr
      ),
    });
  }

  // 2. payroll_calc_remind: periodEnd+N <= today, 計算未実行
  if (todayStr >= reminderStartDate && !recentPeriod.latestRunId) {
    let typeOverride: string | undefined;
    if (actualPaymentDate) {
      const threeDaysBefore = addDays(actualPaymentDate, -3);
      if (todayStr >= threeDaysBefore) {
        typeOverride = 'strong_warning';
      }
    }
    actions.push({
      triggerType: 'payroll_calc_remind',
      params: {
        periodStart: recentPeriod.periodStart,
        periodEnd: recentPeriod.periodEnd,
        paymentDate: actualPaymentDate || '未設定',
      },
      docId: buildSchedulerIdempotencyKey(
        'payroll_calc_remind',
        recentPeriod.paymentPeriodKey,
        todayStr
      ),
      typeOverride,
    });
  }

  // 3. payroll_confirm_remind: 計算済み + draft
  if (
    todayStr >= reminderStartDate &&
    recentPeriod.latestRunId &&
    recentPeriod.monthlyPayrollStatus === 'draft'
  ) {
    actions.push({
      triggerType: 'payroll_confirm_remind',
      params: {
        periodStart: recentPeriod.periodStart,
        periodEnd: recentPeriod.periodEnd,
      },
      docId: buildSchedulerIdempotencyKey(
        'payroll_confirm_remind',
        recentPeriod.paymentPeriodKey,
        todayStr
      ),
    });
  }

  // 4. payroll_payment_overdue: 支払日超過 + confirmed
  if (
    actualPaymentDate &&
    todayStr > actualPaymentDate &&
    recentPeriod.monthlyPayrollStatus === 'confirmed'
  ) {
    actions.push({
      triggerType: 'payroll_payment_overdue',
      params: {
        periodStart: recentPeriod.periodStart,
        periodEnd: recentPeriod.periodEnd,
      },
      docId: buildSchedulerIdempotencyKey(
        'payroll_payment_overdue',
        recentPeriod.paymentPeriodKey,
        todayStr
      ),
    });
  }

  // 5. payroll_hold_reminder: 月曜 + hold
  const dayOfWeek = new Date(`${todayStr}T00:00:00`).getDay();
  if (
    dayOfWeek === 1 &&
    recentPeriod.monthlyPayrollStatus === 'hold' &&
    recentPeriod.holdCount > 0
  ) {
    actions.push({
      triggerType: 'payroll_hold_reminder',
      params: {
        holdCount: String(recentPeriod.holdCount),
      },
      docId: buildSchedulerIdempotencyKey(
        'payroll_hold_reminder',
        recentPeriod.paymentPeriodKey,
        todayStr
      ),
    });
  }

  return actions;
}

// ─── Cloud Task handler ───

export const processPayrollNotifications = onTaskDispatched(
  {
    retryConfig: { maxAttempts: 3, minBackoffSeconds: 10, maxBackoffSeconds: 60 },
  },
  async () => {
    const db = getFirestore();

    const [payrollConfig, storeConfig] = await Promise.all([
      getPayrollConfig(db),
      getStoreConfig(db),
    ]);

    const startDay = storeConfig.payroll?.startDay ?? DEFAULT_PAYROLL_START_DAY;
    const endDay = storeConfig.payroll?.endDay ?? DEFAULT_PAYROLL_END_DAY;
    const paymentDate = payrollConfig.paymentDate;
    const reminderStartDays = payrollConfig.reminderStartDaysAfterPeriodEnd;

    // JST の today を算出
    const now = new Date();
    const jstOffsetMs = 9 * 60 * 60 * 1000;
    const jstDate = new Date(now.getTime() + now.getTimezoneOffset() * 60000 + jstOffsetMs);
    const todayStr = [
      jstDate.getFullYear(),
      String(jstDate.getMonth() + 1).padStart(2, '0'),
      String(jstDate.getDate()).padStart(2, '0'),
    ].join('-');

    // 対象期間: today が属する期間 → その直前の期間
    const activePeriod = getPayrollPeriodRange(todayStr, startDay, endDay);
    const recentPeriodRange = getPayrollPeriodRange(
      addDays(activePeriod.periodStart, -1),
      startDay,
      endDay
    );
    const recentPeriodKey = `${recentPeriodRange.periodStart}_${recentPeriodRange.periodEnd}`;

    // monthlyPayroll 読み取り
    const mpDoc = await db.collection('monthlyPayroll').doc(recentPeriodKey).get();
    const mpData = mpDoc.exists ? mpDoc.data()! : null;

    // holdCount 算出
    let holdCount = 0;
    if (mpData?.latestRunId && mpData.status === 'hold') {
      const staffResultsSnap = await db
        .collection('monthlyPayroll')
        .doc(recentPeriodKey)
        .collection('payrollRuns')
        .doc(mpData.latestRunId)
        .collection('staffResults')
        .where('paymentStatus', '==', 'hold')
        .get();
      holdCount = staffResultsSnap.size;
    }

    const recentPeriodInfo: PeriodInfo = {
      paymentPeriodKey: recentPeriodKey,
      periodStart: recentPeriodRange.periodStart,
      periodEnd: recentPeriodRange.periodEnd,
      monthlyPayrollStatus: mpData?.status ?? null,
      latestRunId: mpData?.latestRunId ?? null,
      holdCount,
    };

    const actions = evaluateScheduledNotifications(
      todayStr,
      recentPeriodInfo,
      paymentDate,
      reminderStartDays
    );

    for (const action of actions) {
      await createPayrollNotification(db, action.triggerType, action.params, {
        docId: action.docId,
        typeOverride: action.typeOverride,
      });
    }

    logger.info('processPayrollNotifications: completed', {
      todayStr,
      recentPeriodKey,
      actionsCount: actions.length,
      actions: actions.map((a) => a.triggerType),
    });
  }
);
