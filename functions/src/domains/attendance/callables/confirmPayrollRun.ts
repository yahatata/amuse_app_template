/**
 * confirmPayrollRun Callable
 *
 * 計算完了した run を確定し、attendance を reflected 化、
 * キャリーオーバーの deferredAttendances 記録、paymentStatus 初期化を行う。
 *
 * 参照: 04_CALLABLE_API_SPEC §8, 05_PROCESS_FLOW_SPEC §5
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import type { CallableRequest } from 'firebase-functions/v2/https';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';

import { getCallerDeviceByUid, isActive } from '../../../shared/devices';
import { PAYROLL_ERRORS } from '../helpers/payrollErrors';
import { writeAttendanceLog } from '../helpers/attendanceLogs';
import {
  buildDeferredAttendance,
  groupCarryOverByOriginalPeriod,
  chunkArray,
} from '../helpers/confirmPayrollHelpers';
import type { CarryOverItemInfo } from '../helpers/confirmPayrollHelpers';

const PERIOD_KEY_REGEX = /^\d{4}-\d{2}-\d{2}_\d{4}-\d{2}-\d{2}$/;
const BATCH_SIZE = 400;

export const confirmPayrollRun = onCall(
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

    const { paymentPeriodKey, runId: inputRunId } = request.data as {
      paymentPeriodKey?: string;
      runId?: string;
    };

    if (!paymentPeriodKey || !PERIOD_KEY_REGEX.test(paymentPeriodKey)) {
      throw new HttpsError('invalid-argument', PAYROLL_ERRORS.INVALID_PERIOD);
    }

    const db = getFirestore();
    const monthlyPayrollRef = db.collection('monthlyPayroll').doc(paymentPeriodKey);

    // 1. monthlyPayroll の状態チェック
    const mpDoc = await monthlyPayrollRef.get();
    if (mpDoc.exists) {
      const mpStatus = mpDoc.data()?.status;
      if (mpStatus === 'confirmed' || mpStatus === 'paid') {
        throw new HttpsError('failed-precondition', PAYROLL_ERRORS.ALREADY_CONFIRMED);
      }
    }

    // 2. run 特定
    let runId = inputRunId;
    if (!runId) {
      const mpData = mpDoc.exists ? mpDoc.data() : null;
      runId = mpData?.latestRunId;
      if (!runId) {
        throw new HttpsError('not-found', PAYROLL_ERRORS.RUN_NOT_FOUND);
      }
    }

    const runRef = monthlyPayrollRef.collection('payrollRuns').doc(runId);
    const runDoc = await runRef.get();
    if (!runDoc.exists) {
      throw new HttpsError('not-found', PAYROLL_ERRORS.RUN_NOT_FOUND);
    }

    // 3. run.status == "completed" 確認
    const runData = runDoc.data()!;
    if (runData.status !== 'completed') {
      throw new HttpsError('failed-precondition', PAYROLL_ERRORS.RUN_NOT_COMPLETED);
    }

    // 4. staffResults 全件取得 → attendanceItems から全 attendanceId 収集
    const staffResultsSnap = await runRef.collection('staffResults').get();
    const allAttendanceIds: string[] = [];
    const coItems: CarryOverItemInfo[] = [];

    for (const srDoc of staffResultsSnap.docs) {
      const itemsSnap = await srDoc.ref.collection('attendanceItems').get();
      for (const itemDoc of itemsSnap.docs) {
        const itemData = itemDoc.data();
        allAttendanceIds.push(itemData.attendanceId);

        if (itemData.isCarryOver && itemData.originalPaymentPeriodKey) {
          coItems.push({
            attendanceId: itemData.attendanceId,
            originalPaymentPeriodKey: itemData.originalPaymentPeriodKey,
            grossPayContribution: 0,
          });
        }
      }
    }

    // 5. attendance payrollStatus → reflected（400件バッチ）
    const idChunks = chunkArray(allAttendanceIds, BATCH_SIZE);
    const now = FieldValue.serverTimestamp();

    for (const chunk of idChunks) {
      const batch = db.batch();
      for (const attId of chunk) {
        const attRef = db.collection('attendances').doc(attId);
        batch.update(attRef, {
          payrollStatus: 'reflected',
          reflectedPayrollRunId: runId,
          reflectedAt: now,
        });
      }
      await batch.commit();
    }

    // 6. キャリーオーバー処理: 元期間の confirmed staffResults に deferredAttendances 追記
    let carryOverCount = 0;
    if (coItems.length > 0) {
      const grouped = groupCarryOverByOriginalPeriod(coItems);

      for (const [origPeriodKey, items] of grouped) {
        const deferredEntries = items.map((item) =>
          buildDeferredAttendance(item.attendanceId, paymentPeriodKey, runId!, item.grossPayContribution)
        );

        // 元期間の staffResults を探す（staffId ごと）
        const staffIdsForPeriod = new Set<string>();
        for (const item of items) {
          // attendanceId から staffId を逆引き（attendance ドキュメントから取得）
          const attDoc = await db.collection('attendances').doc(item.attendanceId).get();
          if (attDoc.exists) {
            staffIdsForPeriod.add(attDoc.data()?.staffId ?? '');
          }
        }

        const origMpRef = db.collection('monthlyPayroll').doc(origPeriodKey);
        const origMpDoc = await origMpRef.get();
        if (origMpDoc.exists) {
          const origRunId = origMpDoc.data()?.latestRunId;
          if (origRunId) {
            const origRunRef = origMpRef.collection('payrollRuns').doc(origRunId);
            for (const staffId of staffIdsForPeriod) {
              if (!staffId) continue;
              const origSrRef = origRunRef.collection('staffResults').doc(staffId);
              const origSrDoc = await origSrRef.get();
              if (origSrDoc.exists) {
                await origSrRef.update({
                  deferredAttendances: FieldValue.arrayUnion(...deferredEntries.filter((d) => {
                    const matchItem = items.find((i) => i.attendanceId === d.attendanceId);
                    return matchItem !== undefined;
                  })),
                  updatedAt: now,
                });
              }
            }
          }
        }

        carryOverCount += items.length;

        // attendanceLogs: carry_over_deferred
        for (const item of items) {
          await writeAttendanceLog({
            db,
            attendanceId: item.attendanceId,
            actionType: 'carry_over_deferred',
            performedByUid: callerUid,
            performedByDeviceId: device.id ?? null,
          });
        }
      }
    }

    // 7. 全 staffResults の paymentStatus → unpaid
    const paymentBatch = db.batch();
    for (const srDoc of staffResultsSnap.docs) {
      paymentBatch.update(srDoc.ref, {
        paymentStatus: 'unpaid',
        paidAt: null,
        paidByDeviceId: null,
        updatedAt: now,
      });
    }
    await paymentBatch.commit();

    // 8. monthlyPayroll 更新
    const confirmedAt = new Date().toISOString();
    await monthlyPayrollRef.set(
      {
        status: 'confirmed',
        confirmedAt: now,
        confirmedByDeviceId: device.id ?? null,
        latestRunId: runId,
        updatedAt: now,
      },
      { merge: true }
    );

    // 9. attendanceLogs: payroll_confirmed
    for (const attId of allAttendanceIds) {
      await writeAttendanceLog({
        db,
        attendanceId: attId,
        actionType: 'payroll_confirmed',
        performedByUid: callerUid,
        performedByDeviceId: device.id ?? null,
      });
    }

    logger.info('confirmPayrollRun: completed', {
      paymentPeriodKey,
      runId,
      attendanceCount: allAttendanceIds.length,
      carryOverCount,
    });

    return {
      paymentPeriodKey,
      runId,
      confirmedAt,
      confirmedByDeviceId: device.id ?? null,
      carryOverCount,
    };
  }
);
