/**
 * cancelPayrollRun Callable
 *
 * preparing / processing の run を中止する。
 * 参照: 04_CALLABLE_API_SPEC §7
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import type { CallableRequest } from 'firebase-functions/v2/https';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';

import { getCallerDeviceByUid, isActive } from '../../../shared/devices';
import { PAYROLL_ERRORS } from '../helpers/payrollErrors';

const PERIOD_KEY_REGEX = /^\d{4}-\d{2}-\d{2}_\d{4}-\d{2}-\d{2}$/;

export const cancelPayrollRun = onCall(async (request: CallableRequest) => {
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
  if (runData.status !== 'preparing' && runData.status !== 'processing') {
    throw new HttpsError('failed-precondition', PAYROLL_ERRORS.INVALID_RUN_STATUS);
  }

  const cancelledAt = new Date().toISOString();

  await runRef.update({
    status: 'cancelled',
    finishedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  logger.info('cancelPayrollRun: completed', { runId, paymentPeriodKey });

  return {
    runId,
    cancelledAt,
  };
});
