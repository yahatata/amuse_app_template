/**
 * registerPaymentStatus Callable
 *
 * staff ごとの支払い済み / 保留登録。全 staff の paymentStatus に基づいて
 * monthlyPayroll.status を自動更新する。
 *
 * 参照: 04_CALLABLE_API_SPEC §9, 05_PROCESS_FLOW_SPEC §8
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import type { CallableRequest } from 'firebase-functions/v2/https';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';

import { getCallerDeviceByUid, isActive } from '../../../shared/devices';
import { logOpsError } from '../../../shared/logging/logOpsError';
import { PAYROLL_ERRORS } from '../helpers/payrollErrors';
import { writeAttendanceLog } from '../helpers/attendanceLogs';
import {
  validatePaymentStatusTransition,
  determineMonthlyPayrollStatus,
} from '../helpers/paymentStatusHelpers';
import type { PaymentStatus } from '../types/payrollCalcTypes';

const PERIOD_KEY_REGEX = /^\d{4}-\d{2}-\d{2}_\d{4}-\d{2}-\d{2}$/;

interface PaymentEntry {
  staffId: string;
  status: 'paid' | 'hold';
}

export const registerPaymentStatus = onCall(
  { timeoutSeconds: 300 },
  async (request: CallableRequest) => {
    // 1. 認証チェック
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

    // 2. 入力バリデーション
    const { paymentPeriodKey, entries } = request.data as {
      paymentPeriodKey?: string;
      entries?: PaymentEntry[];
    };

    if (!paymentPeriodKey || !PERIOD_KEY_REGEX.test(paymentPeriodKey)) {
      throw new HttpsError('invalid-argument', PAYROLL_ERRORS.INVALID_PERIOD);
    }

    if (!entries || !Array.isArray(entries) || entries.length === 0) {
      throw new HttpsError('invalid-argument', 'entries は 1 件以上必要です');
    }

    const db = getFirestore();
    const monthlyPayrollRef = db.collection('monthlyPayroll').doc(paymentPeriodKey);

    // 3. monthlyPayroll の状態チェック
    const mpDoc = await monthlyPayrollRef.get();
    if (!mpDoc.exists) {
      throw new HttpsError('not-found', PAYROLL_ERRORS.NOT_CONFIRMED);
    }

    const mpData = mpDoc.data()!;
    const mpStatus = mpData.status as string;

    if (mpStatus === 'paid') {
      throw new HttpsError('failed-precondition', PAYROLL_ERRORS.ALREADY_PAID);
    }
    if (mpStatus !== 'confirmed' && mpStatus !== 'hold') {
      throw new HttpsError('failed-precondition', PAYROLL_ERRORS.NOT_CONFIRMED);
    }

    // 4. confirmed run 特定
    const runId = mpData.latestRunId as string | undefined;
    if (!runId) {
      throw new HttpsError('not-found', PAYROLL_ERRORS.RUN_NOT_FOUND);
    }

    const runRef = monthlyPayrollRef.collection('payrollRuns').doc(runId);
    const staffResultsCol = runRef.collection('staffResults');

    // 5. 各 entry の paymentStatus 更新
    let updatedCount = 0;
    const logEntries: { staffId: string; actionType: string; attendanceIds: string[] }[] = [];

    for (const entry of entries) {
      const srRef = staffResultsCol.doc(entry.staffId);
      const srDoc = await srRef.get();
      if (!srDoc.exists) {
        logOpsError({
          message:
            'registerPaymentStatus: staffResult が存在しないため当該スタッフの支払状態更新をスキップしました',
          functionEntry: 'registerPaymentStatus',
          operation: 'resolveStaffResultDocument',
          cause: new Error('register_payment_staff_result_not_found'),
          context: {
            paymentPeriodKey,
            runId,
            staffId: entry.staffId,
            entriesLength: entries.length,
          },
        });
        continue;
      }

      const currentStatus = (srDoc.data()?.paymentStatus ?? 'unpaid') as PaymentStatus;
      const transition = validatePaymentStatusTransition(currentStatus, entry.status);

      if (transition.skip) {
        continue;
      }

      if (!transition.allowed) {
        logger.warn('registerPaymentStatus: transition rejected', {
          staffId: entry.staffId,
          currentStatus,
          targetStatus: entry.status,
          errorCode: transition.errorCode,
        });
        continue;
      }

      const updateData: Record<string, unknown> = {
        paymentStatus: entry.status,
        updatedAt: FieldValue.serverTimestamp(),
      };

      if (entry.status === 'paid') {
        updateData.paidAt = FieldValue.serverTimestamp();
        updateData.paidByDeviceId = device.id ?? null;
      }

      await srRef.update(updateData);
      updatedCount++;

      const assignedIds = (srDoc.data()?.assignedAttendanceIds ?? []) as string[];
      const coIds = (srDoc.data()?.assignedCarryOverAttendanceIds ?? []) as string[];
      const allIds = [...assignedIds, ...coIds];

      logEntries.push({
        staffId: entry.staffId,
        actionType: entry.status === 'paid' ? 'payment_registered' : 'payment_hold',
        attendanceIds: allIds,
      });
    }

    // 6. 全 staffResults の paymentStatus 集計
    const allStaffSnap = await staffResultsCol.get();
    let unpaidCount = 0;
    let holdCount = 0;

    for (const doc of allStaffSnap.docs) {
      const ps = (doc.data().paymentStatus ?? 'unpaid') as string;
      if (ps === 'unpaid') unpaidCount++;
      else if (ps === 'hold') holdCount++;
    }

    // 7. monthlyPayroll.status 自動更新
    const newMpStatus = determineMonthlyPayrollStatus(unpaidCount, holdCount);
    const mpUpdateData: Record<string, unknown> = {
      status: newMpStatus,
      updatedAt: FieldValue.serverTimestamp(),
    };

    if (newMpStatus === 'paid') {
      mpUpdateData.paidAt = FieldValue.serverTimestamp();
    }

    await monthlyPayrollRef.update(mpUpdateData);

    // 8. attendanceLogs 書き込み
    for (const logEntry of logEntries) {
      for (const attId of logEntry.attendanceIds) {
        await writeAttendanceLog({
          db,
          attendanceId: attId,
          actionType: logEntry.actionType,
          performedByUid: callerUid,
          performedByDeviceId: device.id ?? null,
        });
      }
    }

    logger.info('registerPaymentStatus: completed', {
      paymentPeriodKey,
      runId,
      updatedCount,
      monthlyPayrollStatus: newMpStatus,
      unpaidCount,
      holdCount,
    });

    return {
      updatedCount,
      monthlyPayrollStatus: newMpStatus,
    };
  }
);
