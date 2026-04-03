/**
 * retryFailedStaffTasks Callable
 *
 * completed_with_errors の run で失敗した staff タスクを再投入する。
 * 参照: 04_CALLABLE_API_SPEC §6
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import type { CallableRequest } from 'firebase-functions/v2/https';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { getRegionalTaskQueue } from '../../../shared/tasks/getRegionalTaskQueue';

import { getCallerDeviceByUid, isActive } from '../../../shared/devices';
import { PAYROLL_ERRORS } from '../helpers/payrollErrors';

const PERIOD_KEY_REGEX = /^\d{4}-\d{2}-\d{2}_\d{4}-\d{2}-\d{2}$/;

export const retryFailedStaffTasks = onCall(async (request: CallableRequest) => {
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

  const { paymentPeriodKey, runId } = request.data as {
    paymentPeriodKey?: string;
    runId?: string;
  };

  if (!paymentPeriodKey || !PERIOD_KEY_REGEX.test(paymentPeriodKey)) {
    throw new HttpsError('invalid-argument', PAYROLL_ERRORS.INVALID_PERIOD);
  }
  if (!runId) {
    throw new HttpsError('invalid-argument', PAYROLL_ERRORS.RUN_NOT_FOUND);
  }

  const db = getFirestore();
  const runRef = db
    .collection('monthlyPayroll').doc(paymentPeriodKey)
    .collection('payrollRuns').doc(runId);

  const runDoc = await runRef.get();
  if (!runDoc.exists) {
    throw new HttpsError('not-found', PAYROLL_ERRORS.RUN_NOT_FOUND);
  }

  const runData = runDoc.data()!;
  if (runData.status !== 'completed_with_errors') {
    throw new HttpsError('failed-precondition', PAYROLL_ERRORS.INVALID_RUN_STATUS);
  }

  // failed staff を抽出
  const staffResultsSnap = await runRef.collection('staffResults')
    .where('taskStatus', '==', 'failed')
    .get();

  const failedStaffIds: string[] = [];
  const queue = getRegionalTaskQueue('processStaffPayroll');

  for (const srDoc of staffResultsSnap.docs) {
    const staffId = srDoc.id;
    failedStaffIds.push(staffId);

    await srDoc.ref.update({
      taskStatus: 'pending',
      taskError: null,
      taskStartedAt: null,
      taskFinishedAt: null,
    });

    await queue.enqueue(
      { runId, paymentPeriodKey, staffId },
      { dispatchDeadlineSeconds: 300 }
    );
  }

  // run 更新
  await runRef.update({
    status: 'processing',
    failedStaffCount: 0,
    updatedAt: FieldValue.serverTimestamp(),
  });

  logger.info('retryFailedStaffTasks: completed', {
    runId,
    retriedCount: failedStaffIds.length,
  });

  return {
    retriedCount: failedStaffIds.length,
    failedStaffIds,
  };
});
