/**
 * finalizePayrollRun — onTaskDispatched
 *
 * 全 staff の計算完了後にサマリを集計し、run と monthlyPayroll を更新する。
 * 参照: 04_CALLABLE_API_SPEC §5, DISTRIBUTED_EXECUTION_DESIGN.md §5
 */

import { onTaskDispatched } from 'firebase-functions/v2/tasks';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';

import { aggregateStaffResults } from '../helpers/payrollRunHelpers';
import { generateAnomalyFlags } from '../helpers/generateAnomalyFlags';
import {
  createPayrollNotification,
  buildEventIdempotencyKey,
} from '../helpers/payrollNotificationHelper';
import type { StaffResultForAggregation } from '../helpers/payrollRunHelpers';

interface TaskPayload {
  runId: string;
  paymentPeriodKey: string;
}

export const finalizePayrollRun = onTaskDispatched(
  {
    retryConfig: { maxAttempts: 3, minBackoffSeconds: 10, maxBackoffSeconds: 60 },
  },
  async (req) => {
    const { runId, paymentPeriodKey } = req.data as TaskPayload;
    const db = getFirestore();

    const runRef = db
      .collection('monthlyPayroll').doc(paymentPeriodKey)
      .collection('payrollRuns').doc(runId);
    const monthlyPayrollRef = db.collection('monthlyPayroll').doc(paymentPeriodKey);

    // 1. 冪等性ガード
    const runDoc = await runRef.get();
    if (!runDoc.exists) {
      logger.error('finalizePayrollRun: run not found', { runId });
      return;
    }
    const runData = runDoc.data()!;
    if (runData.status === 'completed' || runData.status === 'completed_with_errors') {
      logger.info('finalizePayrollRun: already finalized', { runId, status: runData.status });
      return;
    }

    // 2. status → aggregating
    await runRef.update({
      status: 'aggregating',
      updatedAt: FieldValue.serverTimestamp(),
    });

    // 3. staffResults 全件読み取り
    const staffResultsSnap = await runRef.collection('staffResults').get();
    const staffResults: StaffResultForAggregation[] = staffResultsSnap.docs.map((doc) => {
      const d = doc.data();
      return {
        taskStatus: d.taskStatus ?? 'pending',
        status: d.status,
        basePay: d.basePay,
        lateNightPremiumPay: d.lateNightPremiumPay,
        overtimePremiumPay: d.overtimePremiumPay,
        over60PremiumPay: d.over60PremiumPay,
        legalHolidayPremiumPay: d.legalHolidayPremiumPay,
        grossPay: d.grossPay,
      };
    });

    // 4. サマリ集計
    const summary = aggregateStaffResults(staffResults);

    // 5. anomalyFlags 生成（スタブ）
    const anomalyFlags = generateAnomalyFlags();

    // 6. payrollRuns 更新
    const finalStatus = summary.failedStaffCount > 0 ? 'completed_with_errors' : 'completed';

    await runRef.update({
      status: finalStatus,
      finishedAt: FieldValue.serverTimestamp(),
      totalBasePay: summary.totalBasePay,
      totalPremiumPay: summary.totalPremiumPay,
      totalGrossPay: summary.totalGrossPay,
      warningCount: summary.warningCount,
      completedStaffCount: summary.completedStaffCount,
      failedStaffCount: summary.failedStaffCount,
      anomalyFlags,
      updatedAt: FieldValue.serverTimestamp(),
    });

    // 7. monthlyPayroll ルートドキュメント更新
    const mpDoc = await monthlyPayrollRef.get();
    if (mpDoc.exists) {
      const mpData = mpDoc.data()!;
      const currentStatus = mpData.status;
      // draft のまま維持（confirmed/paid なら変更しない）
      const updateData: Record<string, unknown> = {
        latestRunId: runId,
        latestCalculatedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      };
      if (!currentStatus || currentStatus === 'draft') {
        updateData.status = 'draft';
      }
      await monthlyPayrollRef.update(updateData);
    } else {
      await monthlyPayrollRef.set({
        paymentPeriodKey,
        paymentPeriodStart: runData.paymentPeriodStart ?? paymentPeriodKey.split('_')[0],
        paymentPeriodEnd: runData.paymentPeriodEnd ?? paymentPeriodKey.split('_')[1],
        status: 'draft',
        latestRunId: runId,
        latestCalculatedAt: FieldValue.serverTimestamp(),
        confirmedAt: null,
        confirmedByDeviceId: null,
        paidAt: null,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }

    // 8. イベント駆動通知（07_NOTIFICATION_SCHEDULER_SPEC §2-2）
    const [periodStart, periodEnd] = paymentPeriodKey.split('_');
    try {
      if (finalStatus === 'completed') {
        await createPayrollNotification(
          db,
          'payroll_run_completed',
          {
            periodStart,
            periodEnd,
            staffCount: String(summary.completedStaffCount),
            totalGrossPay: String(summary.totalGrossPay),
          },
          { docId: buildEventIdempotencyKey('payroll_run_completed', runId) }
        );
      } else if (finalStatus === 'completed_with_errors') {
        await createPayrollNotification(
          db,
          'payroll_run_completed_with_errors',
          {
            periodStart,
            periodEnd,
            failedCount: String(summary.failedStaffCount),
          },
          { docId: buildEventIdempotencyKey('payroll_run_completed_with_errors', runId) }
        );
      }
    } catch (notifErr) {
      logger.warn('finalizePayrollRun: notification creation failed (non-fatal)', {
        runId,
        error: String(notifErr),
      });
    }

    logger.info('finalizePayrollRun: completed', {
      runId,
      status: finalStatus,
      totalGrossPay: summary.totalGrossPay,
      completedStaff: summary.completedStaffCount,
      failedStaff: summary.failedStaffCount,
    });
  }
);
