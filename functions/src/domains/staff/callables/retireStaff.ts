import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import * as logger from 'firebase-functions/logger';
import { getCallerDeviceByUid, isActive } from '../../../shared/devices';
import { generateJstDateKey } from '../../../shared/time/generateJstDateKey';
import { logOpsError, logOpsSuccess } from '../../../shared/logging/logOpsError';
import { normalizeStaffStatus } from '../helpers/staffStatus';
import { checkFutureStaffSchedule } from '../helpers/checkFutureStaffSchedule';
import { buildRetiredStaffPiiDeletes } from '../helpers/clearRetiredStaffPii';
import { linkUserRichMenu, unlinkRichMenu } from '../../webhook/services/lineRichMenu';

function resolveRetiredDate(input: unknown): string {
  const raw = typeof input === 'string' ? input.trim() : '';
  const retiredDate = raw || generateJstDateKey();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(retiredDate)) {
    throw new HttpsError('invalid-argument', '退職日は YYYY-MM-DD 形式で入力してください。', {
      errorKey: 'INVALID_RETIRED_DATE',
    });
  }
  return retiredDate;
}

async function switchRichMenuOnRetire(staffId: string): Promise<void> {
  const userDoc = await admin.firestore().collection('users').doc(staffId).get();
  const ok = userDoc.exists
    ? await linkUserRichMenu(staffId)
    : await unlinkRichMenu(staffId);
  if (!ok) {
    logger.warn('retireStaff: rich menu switch failed (non-fatal)', { staffId, hasUserDoc: userDoc.exists });
  }
}

/**
 * 店舗管理者デバイスからスタッフを退職処理する
 */
export const retireStaff = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', '認証が必要です');
  }

  const callerUid = request.auth.uid;
  const device = await getCallerDeviceByUid(callerUid);
  if (!device || !isActive(device.status)) {
    throw new HttpsError('permission-denied', 'デバイスが見つからないか、アクティブではありません');
  }
  if (device.role !== 'admin') {
    throw new HttpsError('permission-denied', '退職処理には管理者権限が必要です');
  }

  const { staffId, retiredDate: retiredDateInput, retiredReason } = request.data as {
    staffId?: string;
    retiredDate?: string;
    retiredReason?: string | null;
  };

  if (!staffId?.trim()) {
    throw new HttpsError('invalid-argument', 'staffId が必要です', { errorKey: 'INVALID_ARGUMENT' });
  }

  const retiredDate = resolveRetiredDate(retiredDateInput);
  const logContext: Record<string, unknown> = { staffId, retiredDate, callerUid };

  try {
    const staffRef = admin.firestore().collection('staffs').doc(staffId);
    const staffSnap = await staffRef.get();
    if (!staffSnap.exists) {
      throw new HttpsError('not-found', 'スタッフが見つかりません', { errorKey: 'STAFF_NOT_FOUND' });
    }

    if (normalizeStaffStatus(staffSnap.data()) === 'retired') {
      throw new HttpsError('failed-precondition', 'このスタッフは既に退職済みです', {
        errorKey: 'STAFF_ALREADY_RETIRED',
      });
    }

    const todayJst = generateJstDateKey();
    const futureSchedule = await checkFutureStaffSchedule(staffId, todayJst);
    if (futureSchedule.blocked) {
      throw new HttpsError(
        'failed-precondition',
        '未来のシフト予定が残っています。シフトを整理してから退職処理を実行してください。',
        {
          errorKey: 'STAFF_FUTURE_SCHEDULE_EXISTS',
          blockingSummary: {
            shiftRequestCount: futureSchedule.shiftRequestCount,
            assignmentCount: futureSchedule.assignmentCount,
            samples: futureSchedule.samples,
          },
        }
      );
    }

    const retiredAt = admin.firestore.Timestamp.now();
    await staffRef.update({
      status: 'retired',
      retiredAt,
      retiredDate,
      retiredReason: retiredReason ?? null,
      ...buildRetiredStaffPiiDeletes(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    try {
      await switchRichMenuOnRetire(staffId);
    } catch (richMenuError) {
      logOpsError({
        message: 'retireStaff: rich menu switch error (non-fatal)',
        functionEntry: 'retireStaff',
        cause: richMenuError,
        context: { staffId },
      });
    }

    logOpsSuccess({
      message: 'retireStaff 成功',
      functionEntry: 'retireStaff',
      context: logContext,
    });

    return {
      success: true,
      staffId,
      retiredDate,
      retiredAt: retiredAt.toDate().toISOString(),
    };
  } catch (error) {
    if (!(error instanceof HttpsError)) {
      logOpsError({
        message: 'retireStaff エラー',
        functionEntry: 'retireStaff',
        cause: error,
        context: logContext,
      });
      throw new HttpsError('internal', '退職処理に失敗しました');
    }
    throw error;
  }
});
