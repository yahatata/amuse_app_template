/**
 * Phase4 03 拡張: 未退勤 attendance の退勤打刻（簡易パスワード認証付き）
 *
 * 環境変数 UNCLOCKED_ATTENDANCE_EDIT_PASSWORD と一致するパスワードを入力することで、
 * 未退勤の attendance に退勤時刻を記録する。
 * terminalHome の未退勤一覧から修正する際に使用。
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { CallableRequest } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';

const ENV_PASSWORD_KEY = 'UNCLOCKED_ATTENDANCE_EDIT_PASSWORD';

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

    const expectedPassword = process.env[ENV_PASSWORD_KEY];
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

    await docRef.update({
      clockOut: resolvedClockOut,
      closedStoreWithoutClockOut: false,
      updatedAt: FieldValue.serverTimestamp(),
    });

    const updatedDoc = await docRef.get();
    const updatedData = updatedDoc.data()!;
    const clockOutVal = updatedData.clockOut as Timestamp;

    const { totalMinutes, nightMinutes } = calculateMinutes(
      { toDate: () => new Date(clockIn.toDate()) },
      { toDate: () => new Date(clockOutVal.toDate()) }
    );

    await docRef.update({
      totalMinutes,
      nightMinutes,
    });

    const staffName = (attendanceData.staffsFullName as string) ?? '';

    return {
      success: true,
      message: `${staffName}さんの退勤記録を更新しました`,
      docId,
    };
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    throw new HttpsError(
      'internal',
      `退勤記録の更新に失敗しました: ${error instanceof Error ? error.message : String(error)}`
    );
  }
});

function calculateMinutes(
  clockIn: { toDate: () => Date },
  clockOut: { toDate: () => Date }
): { totalMinutes: number; nightMinutes: number } {
  const clockInTime = clockIn.toDate();
  const clockOutTime = clockOut.toDate();

  const jstOffset = 9 * 60 * 60 * 1000;
  const clockInJST = new Date(clockInTime.getTime() + jstOffset);
  const clockOutJST = new Date(clockOutTime.getTime() + jstOffset);

  const totalMinutes = Math.floor(
    (clockOutJST.getTime() - clockInJST.getTime()) / (1000 * 60)
  );

  const nightStartHour = 22;
  const nightEndHour = 5;
  let nightMinutes = 0;
  let currentTime = new Date(clockInJST);

  while (currentTime < clockOutJST) {
    const hour = currentTime.getHours();
    if (hour >= nightStartHour || hour < nightEndHour) {
      nightMinutes++;
    }
    currentTime.setMinutes(currentTime.getMinutes() + 1);
  }

  return { totalMinutes, nightMinutes };
}

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
