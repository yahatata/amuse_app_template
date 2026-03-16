/**
 * デモ用: attendances に 2026/03/15 の勤怠データを投入
 *
 * 勤務中 4件 + 退勤済み 3件 を追加する。
 * 後で削除する一時的な機能。
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

  // 勤務中 4件
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
      createdAt: Timestamp.fromDate(clockIn),
      updatedAt: Timestamp.fromDate(clockIn),
    });
  }

  // 退勤済み 3件
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
      createdAt: Timestamp.fromDate(clockIn),
      updatedAt: Timestamp.fromDate(clockOut),
    });
  }

  await batch.commit();

  return {
    success: true,
    message: `${DATE_KEY} の勤怠デモデータを7件投入しました（勤務中4件・退勤済み3件）`,
    count: 7,
  };
});
