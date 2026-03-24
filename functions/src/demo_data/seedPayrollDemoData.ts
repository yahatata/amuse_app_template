/**
 * 給与検証用デモ: staffs 30 件 + attendances 200 件（2026-03-01〜31）を投入する。
 * LIFF createStaffAccount と整合するフィールド + 削除用フラグを付与する。
 */

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import * as admin from "firebase-admin";

import { requireAdmin } from "../shared/devices";
import { getStoreConfig } from "../shared/config/configLoader";
import {
  PAYROLL_DEMO_BATCH_FIELD,
  PAYROLL_DEMO_FLAG_FIELD,
} from "./demoFlags";
import {
  buildClosedAttendanceFromSchedule,
  buildOpenAttendanceOnlyClockIn,
  buildOpenAttendanceOnBreak,
  type BreakSpec,
} from "./payrollDemoAttendanceBuilder";

const STAFF_COUNT = 30;
const ATTENDANCE_COUNT = 200;
/** Firestore バッチは最大 500 オペレーション */
const BATCH_SAFE = 480;

function jstTs(dateStr: string, hhmm: string): Timestamp {
  return Timestamp.fromDate(new Date(`${dateStr}T${hhmm}:00+09:00`));
}

export const seedPayrollDemoData = onCall(
  { timeoutSeconds: 540, memory: "512MiB" },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "認証が必要です");
    }
    const adminId = request.auth.uid;
    const db = getFirestore();
    await requireAdmin(db, adminId);

    const existing = await db
      .collection("staffs")
      .where(PAYROLL_DEMO_FLAG_FIELD, "==", true)
      .limit(1)
      .get();
    if (!existing.empty) {
      throw new HttpsError(
        "failed-precondition",
        "既に給与デモデータが存在します。先に deletePayrollDemoData を実行してください。"
      );
    }

    const batchId = `pd_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    const demoFlags: Record<string, unknown> = {
      [PAYROLL_DEMO_FLAG_FIELD]: true,
      [PAYROLL_DEMO_BATCH_FIELD]: batchId,
    };

    const config = await getStoreConfig();
    const nowTs = admin.firestore.FieldValue.serverTimestamp();

    const staffMeta: { id: string; fullName: string; fullNameKana: string; birthMonthDay: string }[] =
      [];

    let batch = db.batch();
    let ops = 0;

    const flushBatch = async (): Promise<void> => {
      if (ops === 0) return;
      await batch.commit();
      batch = db.batch();
      ops = 0;
    };

    const ensureCapacity = async (nextUnitOps: number): Promise<void> => {
      if (ops + nextUnitOps > BATCH_SAFE) {
        await flushBatch();
      }
    };

    for (let i = 0; i < STAFF_COUNT; i++) {
      await ensureCapacity(1);
      const ref = db.collection("staffs").doc();
      const fullName = `デモ太郎${String(i + 1).padStart(2, "0")}`;
      const fullNameKana = `たろう${String(i).padStart(3, "0")}`;
      const birthMonthDay = `${String(1 + (i % 9)).padStart(2, "0")}${String(1 + (i % 28)).padStart(2, "0")}`;
      const loginId = `${fullNameKana}${birthMonthDay}`;
      const phoneNumber = `080${String(10000000 + i).padStart(8, "0")}`;
      const email = `payroll-demo-${i}@example.invalid`;

      staffMeta.push({ id: ref.id, fullName, fullNameKana, birthMonthDay });

      batch.set(ref, {
        uid: ref.id,
        fullName,
        fullNameKana,
        StaffFullName: fullName,
        email,
        phoneNumber,
        birthMonthDay,
        loginId,
        hourlyWage: 1000 + (i % 6) * 100,
        createdAt: nowTs,
        qrCodeUrl: "https://example.invalid/payroll-demo-qr.png",
        qrExpiresAt: Timestamp.fromDate(new Date("2030-12-31T23:59:59+09:00")),
        ...demoFlags,
      });
      ops += 1;
    }

    for (let i = 0; i < ATTENDANCE_COUNT; i++) {
      const staffIdx = i % STAFF_COUNT;
      const day = 1 + Math.floor(i / STAFF_COUNT) % 31;
      const dateStr = `2026-03-${String(day).padStart(2, "0")}`;
      const s = staffMeta[staffIdx]!;
      const variant = i % 10;

      const attRef = db.collection("attendances").doc();
      const createdAt = nowTs;
      const updatedAt = nowTs;

      if (variant === 8) {
        await ensureCapacity(1);
        const clockIn = jstTs(dateStr, "09:00");
        const parent = buildOpenAttendanceOnlyClockIn({
          staffId: s.id,
          staffsFullName: s.fullName,
          date: dateStr,
          clockIn,
          demoFlags,
        });
        batch.set(attRef, {
          ...parent,
          createdAt,
          updatedAt,
        });
        ops += 1;
        continue;
      }

      if (variant === 9) {
        await ensureCapacity(2);
        const clockIn = jstTs(dateStr, "09:00");
        const breakStartedAt = jstTs(dateStr, "12:00");
        const { parent, breaks } = buildOpenAttendanceOnBreak({
          staffId: s.id,
          staffsFullName: s.fullName,
          date: dateStr,
          clockIn,
          breakStartedAt,
          demoFlags,
        });
        batch.set(attRef, {
          ...parent,
          createdAt,
          updatedAt,
        });
        ops += 1;
        const br = breaks[0]!;
        const breakRef = attRef.collection("breaks").doc();
        batch.set(breakRef, {
          startedAt: br.startedAt,
          endedAt: null,
          isDeleted: false,
          deletedAt: null,
          createdAt,
          updatedAt,
        });
        ops += 1;
        continue;
      }

      const shiftKind = i % 3;
      const clockInStr =
        shiftKind === 0 ? "09:00" : shiftKind === 1 ? "10:00" : "22:00";
      const clockOutStr =
        shiftKind === 0 ? "18:00" : shiftKind === 1 ? "19:30" : "23:30";

      const clockIn = jstTs(dateStr, clockInStr);
      const clockOut = jstTs(dateStr, clockOutStr);

      let breakSpecs: BreakSpec[] = [];
      if (variant >= 3 && variant <= 5) {
        breakSpecs = [
          { startedAt: jstTs(dateStr, "12:00"), endedAt: jstTs(dateStr, "13:00") },
        ];
      } else if (variant >= 6 && variant <= 7) {
        breakSpecs = [
          { startedAt: jstTs(dateStr, "12:00"), endedAt: jstTs(dateStr, "12:30") },
          { startedAt: jstTs(dateStr, "15:00"), endedAt: jstTs(dateStr, "15:15") },
        ];
      }

      const unitOps = 1 + breakSpecs.length;
      await ensureCapacity(unitOps);

      const built = buildClosedAttendanceFromSchedule({
        staffId: s.id,
        staffsFullName: s.fullName,
        date: dateStr,
        clockIn,
        clockOut,
        breaks: breakSpecs,
        demoFlags,
        config,
      });

      batch.set(attRef, {
        ...built.parent,
        createdAt: clockIn,
        updatedAt: clockOut,
      });
      ops += 1;

      let bi = 0;
      for (const b of built.breaks) {
        const breakRef = attRef.collection("breaks").doc(`demoBreak${bi++}`);
        batch.set(breakRef, {
          startedAt: b.startedAt,
          endedAt: b.endedAt,
          isDeleted: false,
          deletedAt: null,
          createdAt,
          updatedAt,
        });
        ops += 1;
      }
    }

    await flushBatch();

    return {
      success: true,
      message: `給与デモデータを投入しました（staffs ${STAFF_COUNT} 件・attendances ${ATTENDANCE_COUNT} 件）。`,
      batchId,
      staffCount: STAFF_COUNT,
      attendanceCount: ATTENDANCE_COUNT,
    };
  }
);
