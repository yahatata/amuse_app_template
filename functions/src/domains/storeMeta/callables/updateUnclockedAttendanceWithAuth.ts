/**
 * Phase4 03 拡張: 未退勤 attendance の退勤打刻（簡易パスワード認証付き）
 *
 * business-secrets.unclockedAttendanceEditPassword と一致するパスワードを入力することで、
 * 未退勤の attendance に退勤時刻を記録する。
 * terminalHome の未退勤一覧から修正する際に使用。
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { CallableRequest } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getStoreConfig } from '../../../shared/config/configLoader';
import { writeAttendanceLog } from '../../attendance/helpers/attendanceLogs';
import {
  endActiveBreaksForClockOut,
  recalculateAttendanceFromBreaks,
} from '../../attendance/helpers/recalculateAttendanceFromBreaks';
import { getBusinessSecrets } from '../../../shared/secrets/secretManager';
import { logOpsError } from '../../../shared/logging/logOpsError';

export const updateUnclockedAttendanceWithAuth = onCall(async (request: CallableRequest) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', '認証が必要です');
  }

  try {
    const { data } = request;
    const {
      docId,
      adminPassword,
      clockOutAt,
    } = (data ?? {}) as {
      docId?: string;
      adminPassword?: string;
      clockOutAt?: string;
    };

    if (!docId || typeof docId !== 'string') {
      throw new HttpsError('invalid-argument', 'docId は必須です');
    }
    if (!adminPassword || typeof adminPassword !== 'string') {
      throw new HttpsError('invalid-argument', 'パスワードを入力してください');
    }

    const { unclockedAttendanceEditPassword: expectedPassword } =
      await getBusinessSecrets();
    if (!expectedPassword || expectedPassword !== adminPassword) {
      throw new HttpsError('permission-denied', 'パスワードが一致しません');
    }

    const db = getFirestore();
    const docRef = db.collection('attendances').doc(docId);
    const attendanceDoc = await docRef.get();

    if (!attendanceDoc.exists) {
      throw new HttpsError('not-found', '勤怠記録が見つかりません');
    }

    const attendanceData = attendanceDoc.data()!;

    if (attendanceData.clockOut) {
      throw new HttpsError('already-exists', 'すでに退勤記録が存在します');
    }
    if (!attendanceData.clockIn) {
      throw new HttpsError('failed-precondition', '出勤記録がありません');
    }

    const clockIn = attendanceData.clockIn as Timestamp;
    const resolvedClockOut = resolveClockOutTimestamp(clockOutAt);
    if (resolvedClockOut.toMillis() < clockIn.toMillis()) {
      throw new HttpsError('failed-precondition', '出勤時刻より過去の退勤時間は登録できません');
    }

    await endActiveBreaksForClockOut(docRef, resolvedClockOut);

    const nowTs = FieldValue.serverTimestamp();
    await docRef.update({
      clockOut: resolvedClockOut,
      closedStoreWithoutClockOut: false,
      updatedAt: nowTs,
    });

    const config = await getStoreConfig();
    const recalcResult = await recalculateAttendanceFromBreaks({
      attendanceRef: docRef,
      attendanceData: {
        clockIn,
        clockOut: resolvedClockOut,
        staffId: attendanceData.staffId,
        date: attendanceData.date,
      },
      config,
    });

    const totalMinutes = Math.floor(
      (resolvedClockOut.toDate().getTime() - clockIn.toDate().getTime()) / (1000 * 60)
    );
    await docRef.update({
      totalMinutes,
      nightMinutes: recalcResult.nightWorkMinutes,
      lastActionType: 'clock_out',
      lastActionAt: nowTs,
      lastActionByDeviceId: null,
    });

    await writeAttendanceLog({
      db,
      attendanceId: docId,
      actionType: 'password_clock_out',
      performedByUid: request.auth?.uid ?? null,
      performedByDeviceId: null,
    });

    const staffName = (attendanceData.staffsFullName as string) ?? '';

    return {
      success: true,
      message: `${staffName}さんの退勤記録を更新しました`,
      docId,
    };
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    logOpsError({
      message: 'updateUnclockedAttendanceWithAuth failed',
      functionEntry: 'updateUnclockedAttendanceWithAuth',
      operation: 'passwordClockOutUpdate',
      cause: error,
      sourceProductHint: 'firestore',
    });
    throw new HttpsError(
      'internal',
      `退勤記録の更新に失敗しました: ${error instanceof Error ? error.message : String(error)}`
    );
  }
});

function resolveClockOutTimestamp(clockOutAt?: string): Timestamp {
  if (!clockOutAt) {
    return Timestamp.now();
  }
  const parsed = new Date(clockOutAt);
  if (Number.isNaN(parsed.getTime())) {
    throw new HttpsError('invalid-argument', '退勤時刻の形式が不正です');
  }
  return Timestamp.fromDate(parsed);
}
