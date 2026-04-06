/**
 * processStaffPayroll — onTaskDispatched
 *
 * 1 staff の給与計算を実行し、結果を Firestore に保存する。
 * 参照: 04_CALLABLE_API_SPEC §4, DISTRIBUTED_EXECUTION_DESIGN.md §4
 */

import { onTaskDispatched } from 'firebase-functions/v2/tasks';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { logOpsError } from '../../../shared/logging/logOpsError';
import { getRegionalTaskQueue } from '../../../shared/tasks/getRegionalTaskQueue';

import { calculateStaffPayroll, calculateCarryOverPayroll } from '../helpers/payrollCalcEngine';
import { buildCalcConfigFromSnapshot } from '../helpers/payrollRunHelpers';
import type { PayrollRunSnapshot } from '../types/payrollRunTypes';
import type { CalcAttendanceInput, AttendanceItemResult } from '../types/payrollCalcTypes';

interface TaskPayload {
  runId: string;
  paymentPeriodKey: string;
  staffId: string;
}

export const processStaffPayroll = onTaskDispatched(
  {
    retryConfig: { maxAttempts: 3, minBackoffSeconds: 10, maxBackoffSeconds: 300 },
    rateLimits: { maxConcurrentDispatches: 20 },
  },
  async (req) => {
    const { runId, paymentPeriodKey, staffId } = req.data as TaskPayload;
    const db = getFirestore();

    const runRef = db
      .collection('monthlyPayroll').doc(paymentPeriodKey)
      .collection('payrollRuns').doc(runId);
    const staffResultRef = runRef.collection('staffResults').doc(staffId);

    try {
      // 1. payrollRuns status チェック
      const runDoc = await runRef.get();
      if (!runDoc.exists) {
        logOpsError({
          message: 'processStaffPayroll: run not found',
          failureType: 'business',
          functionEntry: 'processStaffPayroll',
          context: { runId },
        });
        return;
      }
      const runData = runDoc.data()!;
      if (runData.status === 'cancelled' || runData.status === 'failed') {
        logger.info('processStaffPayroll: run cancelled/failed, skipping', { runId, status: runData.status });
        return;
      }

      // 2. 冪等性ガード
      const staffResultDoc = await staffResultRef.get();
      if (!staffResultDoc.exists) {
        logOpsError({
          message: 'processStaffPayroll: staffResult not found',
          failureType: 'business',
          functionEntry: 'processStaffPayroll',
          context: { runId, staffId },
        });
        return;
      }
      const srData = staffResultDoc.data()!;
      if (srData.taskStatus === 'completed') {
        logger.info('processStaffPayroll: already completed, skipping', { runId, staffId });
        return;
      }

      // 3. taskStatus → processing
      await staffResultRef.update({
        taskStatus: 'processing',
        taskStartedAt: FieldValue.serverTimestamp(),
      });

      // 4. assignedAttendanceIds 取得
      const assignedIds: string[] = srData.assignedAttendanceIds ?? [];
      const assignedCoIds: string[] = srData.assignedCarryOverAttendanceIds ?? [];
      const allIds = [...assignedIds, ...assignedCoIds];

      // 5. attendance 一括取得
      const attDocs = await Promise.all(
        allIds.map((id) => db.collection('attendances').doc(id).get())
      );

      // 6. config snapshot 取得
      const snapshot: PayrollRunSnapshot = {
        paymentPeriodKey: runData.paymentPeriodKey,
        paymentPeriodStart: runData.paymentPeriodStart,
        paymentPeriodEnd: runData.paymentPeriodEnd,
        weekStartDaySnapshot: runData.weekStartDaySnapshot,
        weeklyLegalLimitMinutesSnapshot: runData.weeklyLegalLimitMinutesSnapshot,
        legalHolidayWeekdaySnapshot: runData.legalHolidayWeekdaySnapshot,
        nightPremiumRateSnapshot: runData.nightPremiumRateSnapshot,
        overtimePremiumRateSnapshot: runData.overtimePremiumRateSnapshot,
        over60PremiumRateSnapshot: runData.over60PremiumRateSnapshot,
        legalHolidayPremiumRateSnapshot: runData.legalHolidayPremiumRateSnapshot,
        roundingMethodSnapshot: runData.roundingMethodSnapshot,
        roundingPrecisionSnapshot: runData.roundingPrecisionSnapshot,
        calcVersion: runData.calcVersion,
      };

      // 7. staff 情報取得
      const staffDoc = await db.collection('staffs').doc(staffId).get();
      const staffData = staffDoc.exists ? staffDoc.data()! : {};
      const baseHourlyWage = (staffData.hourlyWage as number) ?? 0;
      const staffName = (staffData.fullName as string) ?? '';

      const calcConfig = buildCalcConfigFromSnapshot(snapshot, baseHourlyWage);

      // attendance → CalcAttendanceInput 変換
      const normalAtts: CalcAttendanceInput[] = [];
      const coAtts: CalcAttendanceInput[] = [];
      const coIdSet = new Set(assignedCoIds);

      for (const doc of attDocs) {
        if (!doc.exists) continue;
        const d = doc.data()!;
        const input: CalcAttendanceInput = {
          attendanceId: doc.id,
          staffId: d.staffId ?? '',
          date: d.date ?? '',
          weekday: d.weekday ?? 0,
          weekStartDate: d.weekStartDate ?? '',
          paymentPeriodKey: d.paymentPeriodKey ?? '',
          payrollStatus: d.payrollStatus ?? 'unreflected',
          actualWorkMinutes: d.actualWorkMinutes ?? 0,
          nightWorkMinutes: d.nightWorkMinutes ?? 0,
          clockIn: d.clockIn?.toDate?.()?.toISOString?.() ?? '',
          createdAt: d.createdAt?.toDate?.()?.toISOString?.() ?? '',
        };
        if (coIdSet.has(doc.id)) {
          coAtts.push(input);
        } else {
          normalAtts.push(input);
        }
      }

      // 8. 月跨ぎ週の参照用 attendance 追加取得
      const weekStartDates = new Set<string>();
      for (const att of normalAtts) {
        if (att.weekStartDate) weekStartDates.add(att.weekStartDate);
      }

      const referenceAtts: CalcAttendanceInput[] = [];
      const existingIds = new Set(allIds);

      for (const wsd of weekStartDates) {
        const refSnap = await db.collection('attendances')
          .where('staffId', '==', staffId)
          .where('weekStartDate', '==', wsd)
          .get();

        for (const doc of refSnap.docs) {
          if (existingIds.has(doc.id)) continue;
          existingIds.add(doc.id);
          const d = doc.data();
          referenceAtts.push({
            attendanceId: doc.id,
            staffId: d.staffId ?? '',
            date: d.date ?? '',
            weekday: d.weekday ?? 0,
            weekStartDate: d.weekStartDate ?? '',
            paymentPeriodKey: d.paymentPeriodKey ?? '',
            payrollStatus: d.payrollStatus ?? 'unreflected',
            actualWorkMinutes: d.actualWorkMinutes ?? 0,
            nightWorkMinutes: d.nightWorkMinutes ?? 0,
            clockIn: d.clockIn?.toDate?.()?.toISOString?.() ?? '',
            createdAt: d.createdAt?.toDate?.()?.toISOString?.() ?? '',
          });
        }
      }

      // 10. 計算実行
      const allNormalAtts = [...normalAtts, ...referenceAtts];
      const normalResult = calculateStaffPayroll(allNormalAtts, calcConfig);

      // キャリーオーバー計算
      let coTotalGrossPay = 0;
      let coItems: AttendanceItemResult[] = [];

      if (coAtts.length > 0) {
        const coByPeriod = new Map<string, CalcAttendanceInput[]>();
        for (const co of coAtts) {
          const key = co.paymentPeriodKey;
          const arr = coByPeriod.get(key) || [];
          arr.push(co);
          coByPeriod.set(key, arr);
        }

        for (const [origPeriodKey, coGroup] of coByPeriod) {
          // 元期間の attendance を参照用に取得
          const origSnap = await db.collection('attendances')
            .where('staffId', '==', staffId)
            .where('paymentPeriodKey', '==', origPeriodKey)
            .get();

          const origAtts: CalcAttendanceInput[] = origSnap.docs.map((doc) => {
            const d = doc.data();
            return {
              attendanceId: doc.id,
              staffId: d.staffId ?? '',
              date: d.date ?? '',
              weekday: d.weekday ?? 0,
              weekStartDate: d.weekStartDate ?? '',
              paymentPeriodKey: d.paymentPeriodKey ?? '',
              payrollStatus: d.payrollStatus ?? 'unreflected',
              actualWorkMinutes: d.actualWorkMinutes ?? 0,
              nightWorkMinutes: d.nightWorkMinutes ?? 0,
              clockIn: d.clockIn?.toDate?.()?.toISOString?.() ?? '',
              createdAt: d.createdAt?.toDate?.()?.toISOString?.() ?? '',
            };
          });

          const coResult = calculateCarryOverPayroll(coGroup, origAtts, origPeriodKey, calcConfig);
          coTotalGrossPay += coResult.grossPay;
          coItems.push(...coResult.items);
        }
      }

      // 11. attendanceItems 書き込み（batch.set で冪等）
      const batch = db.batch();
      const allItems = [...normalResult.attendanceItems, ...coItems];
      for (const item of allItems) {
        const itemRef = staffResultRef.collection('attendanceItems').doc(item.attendanceId);
        batch.set(itemRef, item);
      }
      await batch.commit();

      // 12. トランザクションで結果保存 + カウンタ更新
      // Firestore トランザクションは「全 read のあとに全 write」。write 後の get は不可のため、
      // run は先に1回だけ読み、increment 後の件数は読み取り値から算出する。
      const { completedCount, failedCount, targetCount } = await db.runTransaction(async (trx) => {
        const srSnap = await trx.get(staffResultRef);
        const runSnap = await trx.get(runRef);
        const srCurrent = srSnap.data();
        const rdRun = runSnap.data()!;

        if (srCurrent?.taskStatus === 'completed') {
          return {
            completedCount: rdRun.completedStaffCount ?? 0,
            failedCount: rdRun.failedStaffCount ?? 0,
            targetCount: rdRun.targetStaffCount ?? 0,
          };
        }

        trx.update(staffResultRef, {
          taskStatus: 'completed',
          taskFinishedAt: FieldValue.serverTimestamp(),
          staffNameSnapshot: staffName,
          baseHourlyWageSnapshot: baseHourlyWage,
          totalActualWorkMinutes: normalResult.totalActualWorkMinutes + (coAtts.length > 0 ? coItems.reduce((s, i) => s + (i.includedInCurrentRun ? i.actualWorkMinutes : 0), 0) : 0),
          totalNightWorkMinutes: normalResult.totalNightWorkMinutes,
          totalLegalOvertimeMinutes: normalResult.totalLegalOvertimeMinutes,
          over60OvertimeMinutes: normalResult.over60OvertimeMinutes,
          totalLegalHolidayWorkMinutes: normalResult.totalLegalHolidayWorkMinutes,
          totalNonLegalHolidayWorkMinutes: normalResult.totalNonLegalHolidayWorkMinutes,
          targetAttendanceCount: assignedIds.length + assignedCoIds.length,
          carryOverAttendanceCount: assignedCoIds.length,
          basePayRaw: normalResult.basePayRaw,
          basePay: normalResult.basePay,
          lateNightPremiumPay: normalResult.lateNightPremiumPay,
          overtimePremiumPay: normalResult.overtimePremiumPay,
          over60PremiumPay: normalResult.over60PremiumPay,
          legalHolidayPremiumPay: normalResult.legalHolidayPremiumPay,
          grossPayRaw: normalResult.grossPayRaw,
          grossPay: normalResult.grossPay + coTotalGrossPay,
          carryOverGrossPay: coTotalGrossPay,
          status: 'success',
          warnings: [],
          calcVersion: snapshot.calcVersion,
          calculatedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });

        trx.update(runRef, {
          completedStaffCount: FieldValue.increment(1),
          updatedAt: FieldValue.serverTimestamp(),
        });

        return {
          completedCount: (rdRun.completedStaffCount ?? 0) + 1,
          failedCount: rdRun.failedStaffCount ?? 0,
          targetCount: rdRun.targetStaffCount ?? 0,
        };
      });

      // 13. 完了判定
      if (completedCount + failedCount >= targetCount) {
        const finalizeQueue = getRegionalTaskQueue('finalizePayrollRun');
        await finalizeQueue.enqueue({ runId, paymentPeriodKey });
        logger.info('processStaffPayroll: dispatched finalizePayrollRun', { runId });
      }

      logger.info('processStaffPayroll: completed', { runId, staffId });
    } catch (error) {
      logOpsError({
        message: 'processStaffPayroll: failed',
        failureType: 'business',
        functionEntry: 'processStaffPayroll',
        cause: error,
        context: { runId, staffId },
      });

      // 失敗処理（トランザクション）
      // 成功時と同様、read を先にまとめる（write 後の get は不可）。
      try {
        const { completedCount, failedCount, targetCount } = await db.runTransaction(async (trx) => {
          const srSnap = await trx.get(staffResultRef);
          const runSnap = await trx.get(runRef);
          const srCurrent = srSnap.data();
          const rdRun = runSnap.data()!;

          if (srCurrent?.taskStatus === 'completed' || srCurrent?.taskStatus === 'failed') {
            return {
              completedCount: rdRun.completedStaffCount ?? 0,
              failedCount: rdRun.failedStaffCount ?? 0,
              targetCount: rdRun.targetStaffCount ?? 0,
            };
          }

          trx.update(staffResultRef, {
            taskStatus: 'failed',
            taskError: error instanceof Error ? error.message : String(error),
            taskFinishedAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          });

          trx.update(runRef, {
            failedStaffCount: FieldValue.increment(1),
            updatedAt: FieldValue.serverTimestamp(),
          });

          return {
            completedCount: rdRun.completedStaffCount ?? 0,
            failedCount: (rdRun.failedStaffCount ?? 0) + 1,
            targetCount: rdRun.targetStaffCount ?? 0,
          };
        });

        if (completedCount + failedCount >= targetCount) {
          const finalizeQueue = getRegionalTaskQueue('finalizePayrollRun');
          await finalizeQueue.enqueue({ runId, paymentPeriodKey });
        }
      } catch (trxError) {
        logOpsError({
          message: 'processStaffPayroll: failed to update failure status',
          failureType: 'business',
          functionEntry: 'processStaffPayroll',
          operation: 'failureStatusUpdate',
          cause: trxError,
          context: { runId, staffId },
        });
      }

      throw error;
    }
  }
);
