/**
 * getPayrollCalcDisplayContext Callable
 *
 * 計算タブの表示用メタ（JST 基準日・paymentPeriodKey・支給予定日）のみ返す。
 * 算出ロジックは getPayrollCandidates / buildPayrollDisplayContext と共有。
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import type { CallableRequest } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';

import { getCallerDeviceByUid, isActive } from '../../../shared/devices';
import { buildPayrollDisplayContext } from '../helpers/payrollDisplayContext';

export const getPayrollCalcDisplayContext = onCall(async (request: CallableRequest) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', '認証が必要です');
  }

  const callerUid = request.auth.uid;
  const device = await getCallerDeviceByUid(callerUid);
  if (!device || !isActive(device.status)) {
    throw new HttpsError('permission-denied', 'デバイスが見つからないか、アクティブではありません');
  }
  if (device.role !== 'admin') {
    throw new HttpsError('permission-denied', '管理者のみ実行できます');
  }

  const displayContext = await buildPayrollDisplayContext();
  const db = getFirestore();
  const mpSnap = await db.collection('monthlyPayroll').doc(displayContext.paymentPeriodKey).get();
  let isConfirmed = false;
  if (mpSnap.exists) {
    const st = mpSnap.data()?.status as string | undefined;
    isConfirmed = st === 'confirmed' || st === 'paid';
  }

  return {
    ...displayContext,
    isConfirmed,
  };
});
