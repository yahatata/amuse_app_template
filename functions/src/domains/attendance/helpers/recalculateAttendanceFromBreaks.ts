/**
 * breaks から attendances 親の breakMinutes, actualWorkMinutes, nightWorkMinutes を再計算するヘルパー
 *
 * Phase4.1-C: 休憩終了時・退勤時・修正申請承認時等で使用。
 * 論理削除された break（isDeleted: true）は休憩時間に含めない。
 *
 * 参照: Flow1_DETAILED_SPEC セクション 2, 5
 */

import type { DocumentReference, Timestamp } from 'firebase-admin/firestore';
import { FieldValue } from 'firebase-admin/firestore';

/**
 * Phase4.1-D: 退勤時に休憩中（endedAt: null）の break を自動終了する
 * @returns 終了した break が存在したか
 */
export async function endActiveBreaksForClockOut(
  attendanceRef: DocumentReference,
  endTimestamp: Timestamp
): Promise<boolean> {
  const breaksSnap = await attendanceRef
    .collection('breaks')
    .where('endedAt', '==', null)
    .get();

  if (breaksSnap.empty) return false;

  const db = attendanceRef.firestore;
  const batch = db.batch();
  for (const doc of breaksSnap.docs) {
    batch.update(doc.ref, {
      endedAt: endTimestamp,
      updatedAt: FieldValue.serverTimestamp(),
    });
  }
  batch.update(attendanceRef, {
    isOnBreak: false,
    currentBreakStartedAt: null,
    updatedAt: FieldValue.serverTimestamp(),
  });
  await batch.commit();
  return true;
}
import {
  DEFAULT_NIGHT_WORK_END_HOUR,
  DEFAULT_NIGHT_WORK_START_HOUR,
} from '../../../shared/config/defaults';
import type { StoreConfig } from '../../../shared/config/types';
import { calculateNightWorkMinutes } from './nightWorkMinutes';

export type RecalculateParams = {
  attendanceRef: DocumentReference;
  attendanceData: {
    clockIn?: Timestamp | null;
    clockOut?: Timestamp | null;
    staffId?: string;
    date?: string;
  };
  config: StoreConfig;
};

export type RecalculateResult = {
  breakMinutes: number;
  actualWorkMinutes: number | null;
  nightWorkMinutes: number;
};

/**
 * breaks サブコレを読み、breakMinutes を算出。clockOut がある場合は actualWorkMinutes, nightWorkMinutes も算出して親を更新する
 */
export async function recalculateAttendanceFromBreaks(
  params: RecalculateParams
): Promise<RecalculateResult> {
  const { attendanceRef, attendanceData, config } = params;
  const clockIn = attendanceData.clockIn;
  const clockOut = attendanceData.clockOut;

  const breaksSnap = await attendanceRef
    .collection('breaks')
    .orderBy('startedAt', 'asc')
    .get();

  let breakMinutes = 0;
  for (const doc of breaksSnap.docs) {
    const d = doc.data();
    if (d.isDeleted === true) continue;
    const startedAt = d.startedAt as Timestamp;
    const endedAt = d.endedAt as Timestamp | null;
    if (!endedAt) continue;
    const minutes = Math.floor((endedAt.toMillis() - startedAt.toMillis()) / (1000 * 60));
    breakMinutes += minutes;
  }

  let actualWorkMinutes: number | null = null;
  let nightWorkMinutes = 0;

  if (clockIn && clockOut) {
    const totalMinutes = Math.floor(
      (clockOut.toDate().getTime() - clockIn.toDate().getTime()) / (1000 * 60)
    );
    actualWorkMinutes = Math.max(0, totalMinutes - breakMinutes);
    const nightWorkStartHour =
      config.attendance?.nightWorkStartHour ?? DEFAULT_NIGHT_WORK_START_HOUR;
    const nightWorkEndHour = config.attendance?.nightWorkEndHour ?? DEFAULT_NIGHT_WORK_END_HOUR;
    const grossNightWorkMinutes = calculateNightWorkMinutes(
      clockIn,
      clockOut,
      nightWorkStartHour,
      nightWorkEndHour
    );

    let nightBreakMinutes = 0;
    for (const doc of breaksSnap.docs) {
      const d = doc.data();
      if (d.isDeleted === true) continue;
      const bStart = d.startedAt as Timestamp;
      const bEnd = d.endedAt as Timestamp | null;
      if (!bEnd) continue;
      nightBreakMinutes += calculateNightWorkMinutes(
        bStart,
        bEnd,
        nightWorkStartHour,
        nightWorkEndHour
      );
    }

    nightWorkMinutes = Math.max(0, grossNightWorkMinutes - nightBreakMinutes);
  }

  const updateData: Record<string, unknown> = {
    breakMinutes,
    updatedAt: FieldValue.serverTimestamp(),
  };
  if (clockOut && actualWorkMinutes !== null) {
    updateData.actualWorkMinutes = actualWorkMinutes;
    updateData.nightWorkMinutes = nightWorkMinutes;
  }

  await attendanceRef.update(updateData);

  return {
    breakMinutes,
    actualWorkMinutes,
    nightWorkMinutes,
  };
}
