/**
 * attendance onWrite トリガー
 *
 * attendance の作成・更新時に帰属情報（weekday, weekStartDate, paymentPeriodKey）を
 * 自動付与し、payrollStatus の遷移を管理する。
 *
 * 参照: 04_CALLABLE_API_SPEC セクション 1
 *       03_DATA_MODEL_SPEC セクション 1-2, 1-3
 */

import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';

import { getStoreConfig } from '../../../shared/config/configLoader';
import { getPayrollConfig } from '../../../shared/config/payrollConfigLoader';
import {
  getPaymentPeriodKey,
  getWeekStartDate,
} from '../helpers/payrollPeriodUtils';
import {
  createPayrollNotification,
  buildEventIdempotencyKey,
} from '../helpers/payrollNotificationHelper';

import {
  DEFAULT_PAYROLL_START_DAY,
  DEFAULT_PAYROLL_END_DAY,
} from '../../../shared/config/defaults';
import { logOpsError } from '../../../shared/logging/logOpsError';

export const attendanceOnWrite = onDocumentWritten(
  'attendances/{attendanceId}',
  async (event) => {
    const afterSnap = event.data?.after;
    if (!afterSnap || !afterSnap.exists) {
      return;
    }

    const afterData = afterSnap.data() as Record<string, unknown>;
    const beforeSnap = event.data?.before;
    const beforeData = beforeSnap?.exists
      ? (beforeSnap.data() as Record<string, unknown>)
      : null;

    const date = afterData.date as string | undefined;
    // 正規 attendance では date（出勤日キー）は必須。欠落は後続の帰属・給与連携をスキップするため運用監視対象とする。
    if (!date) {
      logOpsError({
        message: 'attendanceOnWrite で date が未設定のため処理をスキップしました',
        functionEntry: 'attendanceOnWrite',
        operation: 'validateAttendanceDate',
        cause: new Error('attendance_date_missing'),
        context: {
          attendanceId: event.params.attendanceId,
          hasDate: false,
          staffId: afterData.staffId ?? null,
          isDeleted: afterData.isDeleted ?? null,
          lastActionType: afterData.lastActionType ?? null,
        },
      });
      return;
    }

    // 再処理導線（未確定）: config 復旧後に paymentPeriodKey / weekday / weekStartDate を一括補正する手段は未実装。
    // 欠落期間の attendances はここでは再試行されないため、必要なら別バッチや管理操作での是正を検討する。
    const [config, payrollConfig] = await Promise.all([
      getStoreConfig(),
      getPayrollConfig(),
    ]);

    const startDay = config.payroll?.startDay ?? DEFAULT_PAYROLL_START_DAY;
    const endDay = config.payroll?.endDay ?? DEFAULT_PAYROLL_END_DAY;
    const weekStartDay = payrollConfig.weekStartDay;

    const newWeekday = new Date(`${date}T00:00:00`).getDay();
    const newWeekStartDate = getWeekStartDate(date, weekStartDay);
    const newPaymentPeriodKey = getPaymentPeriodKey(date, startDay, endDay);

    let newPayrollStatus = afterData.payrollStatus as string | undefined;

    if (!beforeData) {
      // 新規作成
      newPayrollStatus = newPayrollStatus || 'unreflected';
    } else {
      const beforePayrollStatus = beforeData.payrollStatus as string | undefined;

      if (beforePayrollStatus === 'reflected') {
        const fieldsChanged = hasAttendanceDataChanged(beforeData, afterData);
        if (fieldsChanged) {
          newPayrollStatus = 'corrected_after_reflection';
        }
      }

      // payrollReflectedAt フォールバック: payrollStatus 未設定で payrollReflectedAt が非 null
      if (
        !beforePayrollStatus &&
        !newPayrollStatus &&
        typeof afterData.payrollReflectedAt === 'string' &&
        afterData.payrollReflectedAt.length > 0
      ) {
        newPayrollStatus = 'reflected';
      }

      if (!newPayrollStatus) {
        newPayrollStatus = beforePayrollStatus || 'unreflected';
      }
    }

    const needsUpdate =
      afterData.weekday !== newWeekday ||
      afterData.weekStartDate !== newWeekStartDate ||
      afterData.paymentPeriodKey !== newPaymentPeriodKey ||
      afterData.payrollStatus !== newPayrollStatus;

    if (!needsUpdate) {
      return;
    }

    const updateFields: Record<string, unknown> = {
      weekday: newWeekday,
      weekStartDate: newWeekStartDate,
      paymentPeriodKey: newPaymentPeriodKey,
      payrollStatus: newPayrollStatus,
    };

    if (!afterData.reflectedPayrollRunId && afterData.reflectedPayrollRunId !== null) {
      updateFields.reflectedPayrollRunId = null;
    }
    if (!afterData.reflectedAt && afterData.reflectedAt !== null) {
      updateFields.reflectedAt = null;
    }

    await afterSnap.ref.update(updateFields);

    // corrected_after_reflection 通知（07_NOTIFICATION_SCHEDULER_SPEC §2-2 #9）
    if (
      newPayrollStatus === 'corrected_after_reflection' &&
      beforeData &&
      (beforeData.payrollStatus as string | undefined) === 'reflected'
    ) {
      try {
        const db = getFirestore();
        const staffId = afterData.staffId as string | undefined;
        let staffName = '不明';
        if (staffId) {
          const staffDoc = await db.collection('staffs').doc(staffId).get();
          if (staffDoc.exists) {
            staffName = (staffDoc.data()?.fullName as string) || staffName;
          }
        }
        const attendanceId = event.params.attendanceId;
        const ts = Date.now();
        await createPayrollNotification(
          db,
          'payroll_attendance_corrected',
          { staffName, date },
          {
            docId: buildEventIdempotencyKey(
              'payroll_attendance_corrected',
              `${attendanceId}_${ts}`
            ),
          }
        );
      } catch (notifErr) {
        logger.warn('attendanceOnWrite: notification creation failed (non-fatal)', {
          attendanceId: event.params.attendanceId,
          error: String(notifErr),
        });
      }
    }

    logger.info('attendanceOnWrite: 帰属情報を付与', {
      attendanceId: event.params.attendanceId,
      weekday: newWeekday,
      weekStartDate: newWeekStartDate,
      paymentPeriodKey: newPaymentPeriodKey,
      payrollStatus: newPayrollStatus,
      isCreate: !beforeData,
    });
  }
);

/**
 * 勤怠データの実質的変更を検出する（トリガー管理フィールドの変更は除外）。
 */
function hasAttendanceDataChanged(
  before: Record<string, unknown>,
  after: Record<string, unknown>
): boolean {
  const keysToCompare = [
    'clockIn',
    'clockOut',
    'actualWorkMinutes',
    'breakMinutes',
    'nightWorkMinutes',
    'totalMinutes',
    'date',
    'isManual',
    'isDeleted',
  ];

  for (const key of keysToCompare) {
    const bVal = before[key];
    const aVal = after[key];
    if (bVal === aVal) continue;

    // Timestamp 比較
    if (
      bVal &&
      aVal &&
      typeof bVal === 'object' &&
      typeof aVal === 'object' &&
      'toMillis' in (bVal as Record<string, unknown>) &&
      'toMillis' in (aVal as Record<string, unknown>)
    ) {
      if (
        (bVal as { toMillis: () => number }).toMillis() ===
        (aVal as { toMillis: () => number }).toMillis()
      ) {
        continue;
      }
    }

    return true;
  }
  return false;
}
