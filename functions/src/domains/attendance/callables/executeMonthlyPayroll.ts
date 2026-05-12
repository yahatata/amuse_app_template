/**
 * executeMonthlyPayroll Callable
 *
 * run の作成と Cloud Tasks 投入のみ。計算処理は行わない。
 * 参照: 04_CALLABLE_API_SPEC §3, DISTRIBUTED_EXECUTION_DESIGN.md §3
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import type { CallableRequest } from 'firebase-functions/v2/https';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { logOpsError, logOpsSuccess } from '../../../shared/logging/logOpsError';
import { getRegionalTaskQueue } from '../../../shared/tasks/getRegionalTaskQueue';

import { getCallerDeviceByUid, isActive } from '../../../shared/devices';
import { getPayrollConfig } from '../../../shared/config/payrollConfigLoader';
import { PAYROLL_ERRORS } from '../helpers/payrollErrors';
import {
  classifyAttendancesForRun,
  groupByStaffId,
  buildRunSnapshot,
} from '../helpers/payrollRunHelpers';
import {
  createPayrollNotification,
  buildEventIdempotencyKey,
} from '../helpers/payrollNotificationHelper';
import type { AttendanceForRun } from '../helpers/payrollRunHelpers';

const PERIOD_KEY_REGEX = /^\d{4}-\d{2}-\d{2}_\d{4}-\d{2}-\d{2}$/;

export const executeMonthlyPayroll = onCall(
  { timeoutSeconds: 300 },
  async (request: CallableRequest) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', '認証が必要です');
    }

    const callerUid = request.auth.uid;
    const device = await getCallerDeviceByUid(callerUid);
    if (!device || !isActive(device.status)) {
      throw new HttpsError('permission-denied', 'デバイスが見つからないか、アクティブではありません');
    }
    if (device.role !== 'admin') {
      throw new HttpsError('permission-denied', PAYROLL_ERRORS.PERMISSION_DENIED);
    }

    const { paymentPeriodKey, attendanceIds } = request.data as {
      paymentPeriodKey?: string;
      attendanceIds?: string[];
    };

    if (!paymentPeriodKey || !PERIOD_KEY_REGEX.test(paymentPeriodKey)) {
      throw new HttpsError('invalid-argument', PAYROLL_ERRORS.INVALID_PERIOD);
    }
    if (!attendanceIds || attendanceIds.length === 0) {
      throw new HttpsError('invalid-argument', PAYROLL_ERRORS.NO_ATTENDANCE_SELECTED);
    }

    const [periodStart, periodEnd] = paymentPeriodKey.split('_');

    const db = getFirestore();

    // confirmed チェック
    const monthlyPayrollRef = db.collection('monthlyPayroll').doc(paymentPeriodKey);
    const monthlyPayrollDoc = await monthlyPayrollRef.get();
    if (monthlyPayrollDoc.exists) {
      const mpStatus = monthlyPayrollDoc.data()?.status;
      if (mpStatus === 'confirmed' || mpStatus === 'paid') {
        throw new HttpsError('failed-precondition', PAYROLL_ERRORS.ALREADY_CONFIRMED);
      }
    }

    // config snapshot 取得
    let payrollConfig;
    try {
      payrollConfig = await getPayrollConfig(db);
    } catch (configError) {
      logOpsError({
        message: 'executeMonthlyPayroll: payroll config not found',
        functionEntry: 'executeMonthlyPayroll',
        operation: 'loadPayrollConfig',
        cause: configError,
        context: {
          paymentPeriodKey,
          attendanceIdsCount: attendanceIds.length,
        },
      });
      throw new HttpsError('not-found', PAYROLL_ERRORS.PAYROLL_CONFIG_NOT_FOUND);
    }
    // attendance 一括取得
    const attendanceDocs = await Promise.all(
      attendanceIds.map((id) => db.collection('attendances').doc(id).get())
    );

    const attendances: AttendanceForRun[] = [];
    for (const doc of attendanceDocs) {
      if (!doc.exists) {
        logOpsError({
          message:
            'executeMonthlyPayroll: 指定された attendances ドキュメントが存在しません（この ID はラン計算から除外されます）',
          functionEntry: 'executeMonthlyPayroll',
          operation: 'resolveAttendanceDocumentMissing',
          cause: new Error('execute_monthly_payroll_attendance_doc_missing'),
          context: {
            attendanceId: doc.id,
            paymentPeriodKey,
            requestedAttendanceIdsCount: attendanceIds.length,
          },
        });
        continue;
      }
      const data = doc.data()!;
      attendances.push({
        id: doc.id,
        staffId: data.staffId ?? '',
        paymentPeriodKey: data.paymentPeriodKey ?? '',
        clockOut: data.clockOut,
        isDeleted: data.isDeleted === true,
      });
    }

    // 分類 + グルーピング
    const classified = classifyAttendancesForRun(attendances, paymentPeriodKey);
    const staffGroups = groupByStaffId(classified);
    const targetStaffCount = staffGroups.length;
    const targetAttendanceCount = attendanceIds.length;
    const carryOverAttendanceCount = classified.carryOver.length;

    // snapshot 構築
    const snapshot = buildRunSnapshot(payrollConfig, paymentPeriodKey, periodStart, periodEnd);

    // payrollRuns ドキュメント作成
    const runRef = monthlyPayrollRef.collection('payrollRuns').doc();
    const runId = runRef.id;

    await runRef.set({
      runId,
      ...snapshot,
      triggerSource: 'manual',
      calculatedAt: FieldValue.serverTimestamp(),
      startedAt: FieldValue.serverTimestamp(),
      finishedAt: null,
      status: 'preparing',
      calculatedByDeviceId: device.id ?? null,
      targetStaffCount,
      completedStaffCount: 0,
      failedStaffCount: 0,
      targetAttendanceCount,
      carryOverAttendanceCount,
      referencedAttendanceCount: 0,
      totalBasePay: 0,
      totalPremiumPay: 0,
      totalGrossPay: 0,
      warningCount: 0,
      anomalyFlags: null,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    // staff ごとに staffResults 作成 + Cloud Tasks 投入
    try {
      const queue = getRegionalTaskQueue('processStaffPayroll');

      for (const group of staffGroups) {
        const staffResultRef = runRef.collection('staffResults').doc(group.staffId);
        await staffResultRef.set({
          staffId: group.staffId,
          taskStatus: 'pending',
          taskStartedAt: null,
          taskFinishedAt: null,
          taskError: null,
          assignedAttendanceIds: group.assignedAttendanceIds,
          assignedCarryOverAttendanceIds: group.assignedCarryOverAttendanceIds,
          createdAt: FieldValue.serverTimestamp(),
        });

        await queue.enqueue(
          { runId, paymentPeriodKey, staffId: group.staffId },
          { dispatchDeadlineSeconds: 300 }
        );
      }

      // status → processing
      await runRef.update({
        status: 'processing',
        updatedAt: FieldValue.serverTimestamp(),
      });

      logOpsSuccess({
        message: 'executeMonthlyPayroll 成功',
        functionEntry: 'executeMonthlyPayroll',
        operation: 'taskDispatch',
        context: {
          runId,
          paymentPeriodKey,
          targetStaffCount,
          targetAttendanceCount,
          carryOverAttendanceCount,
          callerUid,
          deviceId: device.id ?? null,
        },
      });

      return {
        runId,
        paymentPeriodKey,
        targetStaffCount,
        targetAttendanceCount,
        carryOverAttendanceCount,
        status: 'processing',
      };
    } catch (dispatchErr) {
      logOpsError({
        message: 'executeMonthlyPayroll: task dispatch failed',
        functionEntry: 'executeMonthlyPayroll',
        operation: 'taskDispatch',
        cause: dispatchErr,
        context: { runId },
      });

      await runRef.update({
        status: 'failed',
        finishedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });

      try {
        await createPayrollNotification(
          db,
          'payroll_run_failed',
          { periodStart, periodEnd },
          { docId: buildEventIdempotencyKey('payroll_run_failed', runId) }
        );
      } catch (notifErr) {
        logger.warn('executeMonthlyPayroll: notification creation failed', {
          runId,
          error: String(notifErr),
        });
      }

      throw new HttpsError('internal', 'タスクディスパッチに失敗しました');
    }
  }
);
