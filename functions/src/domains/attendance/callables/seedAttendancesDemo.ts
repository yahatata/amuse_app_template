/**
 * デモ用: attendances に 2026/03/15 の勤怠データを投入
 *
 * Phase4.1-F: 勤務中 4件 + 退勤済み 3件（うち1件休憩あり）+ 論理削除 1件 を追加。
 * 新フィールド（breakMinutes, actualWorkMinutes, nightWorkMinutes 等）を設定。
 */

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";
import * as admin from "firebase-admin";
import { requireAdmin } from "../../../shared/devices";

const DATE_KEY = "2026-03-15";

const RANDOM_NAMES = [
  "山田太郎", "佐藤花子", "鈴木一郎", "高橋美咲", "田中健太",
  "伊藤さくら", "渡辺大輔", "中村優子", "小林翔太", "加藤真由美",
];

function randomId(): string {
  return "U" + Math.random().toString(36).slice(2, 18).padEnd(18, "0").slice(0, 18);
}

function randomName(): string {
  return RANDOM_NAMES[Math.floor(Math.random() * RANDOM_NAMES.length)];
}

function jstToDate(dateStr: string, timeStr: string): Date {
  return new Date(`${dateStr}T${timeStr}:00+09:00`);
}

export const seedAttendancesDemo = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "認証が必要です");
  }
  const adminId = request.auth.uid;
  const db = getFirestore();
  await requireAdmin(db, adminId);

  const { Timestamp } = admin.firestore;
  const batch = db.batch();
  const now = Timestamp.now();

  // 勤務中 4件（Phase4.1-F: 新フィールド追加）
  for (let i = 0; i < 4; i++) {
    const staffId = randomId();
    const staffName = randomName();
    const hour = 8 + Math.floor(Math.random() * 4);
    const min = Math.floor(Math.random() * 60);
    const clockIn = jstToDate(
      DATE_KEY,
      `${hour.toString().padStart(2, "0")}:${min.toString().padStart(2, "0")}`
    );

    const ref = db.collection("attendances").doc();
    batch.set(ref, {
      staffId,
      staffsFullName: staffName,
      date: DATE_KEY,
      clockIn: Timestamp.fromDate(clockIn),
      clockOut: null,
      closedStoreWithoutClockOut: false,
      isManual: false,
      nightMinutes: 0,
      totalMinutes: 0,
      breakMinutes: 0,
      actualWorkMinutes: null,
      nightWorkMinutes: 0,
      isOnBreak: false,
      currentBreakStartedAt: null,
      breakCount: 0,
      lastActionType: "clock_in",
      lastActionAt: Timestamp.fromDate(clockIn),
      lastActionByDeviceId: null,
      manualReason: null,
      payrollReflectedAt: null,
      isDeleted: false,
      deletedAt: null,
      deletedBy: null,
      createdAt: Timestamp.fromDate(clockIn),
      updatedAt: Timestamp.fromDate(clockIn),
    });
  }

  // 退勤済み 3件（Phase4.1-F: 新フィールド追加。actualWorkMinutes, nightWorkMinutes を設定）
  const clockedOutRefs: admin.firestore.DocumentReference[] = [];
  for (let i = 0; i < 3; i++) {
    const staffId = randomId();
    const staffName = randomName();
    const inHour = 9 + Math.floor(Math.random() * 2);
    const inMin = Math.floor(Math.random() * 60);
    const clockIn = jstToDate(
      DATE_KEY,
      `${inHour.toString().padStart(2, "0")}:${inMin.toString().padStart(2, "0")}`
    );

    const outHour = 17 + Math.floor(Math.random() * 6);
    const outMin = Math.floor(Math.random() * 60);
    const clockOut = jstToDate(
      DATE_KEY,
      `${outHour.toString().padStart(2, "0")}:${outMin.toString().padStart(2, "0")}`
    );

    const totalMinutes = Math.floor(
      (clockOut.getTime() - clockIn.getTime()) / (1000 * 60)
    );
    const nightMinutes = outHour >= 22
      ? Math.max(0, (outHour - 22) * 60 + outMin)
      : 0;
    const breakMinutes = i === 0 ? 60 : 0; // 1件目に休憩60分
    const actualWorkMinutes = Math.max(0, totalMinutes - breakMinutes);

    const ref = db.collection("attendances").doc();
    batch.set(ref, {
      staffId,
      staffsFullName: staffName,
      date: DATE_KEY,
      clockIn: Timestamp.fromDate(clockIn),
      clockOut: Timestamp.fromDate(clockOut),
      closedStoreWithoutClockOut: false,
      isManual: false,
      nightMinutes,
      totalMinutes,
      breakMinutes,
      actualWorkMinutes,
      nightWorkMinutes: nightMinutes,
      isOnBreak: false,
      currentBreakStartedAt: null,
      breakCount: i === 0 ? 1 : 0,
      lastActionType: "clock_out",
      lastActionAt: Timestamp.fromDate(clockOut),
      lastActionByDeviceId: null,
      manualReason: null,
      payrollReflectedAt: null,
      isDeleted: false,
      deletedAt: null,
      deletedBy: null,
      createdAt: Timestamp.fromDate(clockIn),
      updatedAt: Timestamp.fromDate(clockOut),
    });
    if (i === 0) clockedOutRefs.push(ref);
  }

  // 論理削除 1件（Phase4.1-F）
  const staffIdDeleted = randomId();
  const staffNameDeleted = randomName();
  const clockInDeleted = jstToDate(DATE_KEY, "09:00");
  const clockOutDeleted = jstToDate(DATE_KEY, "18:00");
  const totalMinutesDeleted = 540;
  const nightMinutesDeleted = 0;

  const refDeleted = db.collection("attendances").doc();
  batch.set(refDeleted, {
    staffId: staffIdDeleted,
    staffsFullName: staffNameDeleted,
    date: DATE_KEY,
    clockIn: Timestamp.fromDate(clockInDeleted),
    clockOut: Timestamp.fromDate(clockOutDeleted),
    closedStoreWithoutClockOut: false,
    isManual: false,
    nightMinutes: nightMinutesDeleted,
    totalMinutes: totalMinutesDeleted,
    breakMinutes: 0,
    actualWorkMinutes: totalMinutesDeleted,
    nightWorkMinutes: nightMinutesDeleted,
    isOnBreak: false,
    currentBreakStartedAt: null,
    breakCount: 0,
    lastActionType: "clock_out",
    lastActionAt: Timestamp.fromDate(clockOutDeleted),
    lastActionByDeviceId: null,
    manualReason: null,
    payrollReflectedAt: null,
    isDeleted: true,
    deletedAt: now,
    deletedBy: "admin",
    createdAt: Timestamp.fromDate(clockInDeleted),
    updatedAt: now,
  });

  await batch.commit();

  // 休憩サンプル: 退勤済み1件目に breaks サブコレを追加
  if (clockedOutRefs.length > 0) {
    const breakStart = jstToDate(DATE_KEY, "12:00");
    const breakEnd = jstToDate(DATE_KEY, "13:00");
    await clockedOutRefs[0].collection("breaks").add({
      startedAt: Timestamp.fromDate(breakStart),
      endedAt: Timestamp.fromDate(breakEnd),
      isDeleted: false,
      deletedAt: null,
      createdAt: Timestamp.fromDate(breakStart),
      updatedAt: Timestamp.fromDate(breakEnd),
    });
  }

  return {
    success: true,
    message: `${DATE_KEY} の勤怠デモデータを8件投入しました（勤務中4件・退勤済み3件・論理削除1件。退勤済み1件に休憩サンプルあり）`,
    count: 8,
  };
});
