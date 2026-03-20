/**
 * Phase4.1-E: updateAttendance Callable の単体テスト
 *
 * - 通常: clockIn/clockOut が更新される
 * - 論理削除: markDeleted で isDeleted, deletedAt, deletedBy が設定される
 * - attendanceLogs に update_attendance が書き込まれる
 * - エラー: permission-denied, not-found, failed-precondition（削除済み）
 *
 * Firestore Emulator 使用。
 */

import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import * as admin from 'firebase-admin';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

const PROJECT_ID = 'test-project-phase4-1e-updateattendance';

const BUSINESS_DATE = '2026-03-04';

describe('Phase4.1-E: updateAttendance', () => {
  let testEnv: any;
  let db: admin.firestore.Firestore;
  let updateAttendance: (req: any) => Promise<any>;
  let emulatorAvailable = true;

  beforeAll(async () => {
    process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || 'localhost:8081';
    testEnv = await initializeTestEnvironment({ projectId: PROJECT_ID });
    if (admin.apps.length > 0) {
      await Promise.all(admin.apps.map((a) => a?.delete()).filter(Boolean));
    }
    admin.initializeApp({ projectId: PROJECT_ID });
    db = getFirestore();

    const mod = await import('../../../src/domains/attendance/callables/updateAttendance');
    updateAttendance = (req) => mod.updateAttendance.run(req);
  });

  afterAll(async () => {
    await testEnv.cleanup();
    if (admin.apps.length) {
      await Promise.all(admin.apps.map((a) => a?.delete()).filter(Boolean));
    }
    delete process.env.FIRESTORE_EMULATOR_HOST;
  });

  beforeEach(async () => {
    if (!emulatorAvailable) return;
    try {
      await testEnv.clearFirestore();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('fetch failed') || msg.includes('ECONNREFUSED')) {
        emulatorAvailable = false;
        console.warn('Firestore Emulator 未起動のためスキップします。');
        return;
      }
      throw e;
    }

    await db.collection('devices').doc('dev-1').set({
      uid: 'caller-uid-1',
      role: 'admin',
      name: 'Test Device',
      status: 'active',
    });
  });

  const authReq = (data: Record<string, unknown> = {}) => ({
    auth: { uid: 'caller-uid-1' },
    data,
  });

  describe('認証・権限', () => {
    it('未認証時は unauthenticated', async () => {
      await expect(
        updateAttendance({ auth: null, data: { attendanceId: 'att-1' } })
      ).rejects.toMatchObject({ code: 'unauthenticated' });
    });

    it('attendanceId 未指定時は invalid-argument', async () => {
      if (!emulatorAvailable) return;
      await expect(updateAttendance(authReq({}))).rejects.toMatchObject({
        code: 'invalid-argument',
      });
    });

    it('admin でないデバイスは permission-denied', async () => {
      if (!emulatorAvailable) return;
      const attRef = await db.collection('attendances').add({
        staffId: 'staff-1',
        date: BUSINESS_DATE,
        clockIn: Timestamp.now(),
        clockOut: null,
        staffsFullName: '山田太郎',
      });
      await db.collection('devices').doc('dev-1').update({ role: 'terminal' });

      await expect(
        updateAttendance(authReq({ attendanceId: attRef.id }))
      ).rejects.toMatchObject({ code: 'permission-denied' });
    });
  });

  describe('通常パターン', () => {
    it('clockIn/clockOut が更新される', async () => {
      if (!emulatorAvailable) return;
      const clockInTs = Timestamp.fromDate(new Date(`${BUSINESS_DATE}T09:00:00Z`));
      const attRef = await db.collection('attendances').add({
        staffId: 'staff-1',
        date: BUSINESS_DATE,
        clockIn: clockInTs,
        clockOut: null,
        staffsFullName: '山田太郎',
      });

      const newClockOutIso = new Date(`${BUSINESS_DATE}T18:00:00Z`).toISOString();
      const result = await updateAttendance(
        authReq({
          attendanceId: attRef.id,
          clockOut: newClockOutIso,
        })
      );

      expect(result.success).toBe(true);

      const attSnap = await attRef.get();
      const attData = attSnap.data()!;
      expect(attData.clockOut).toBeDefined();
      expect(attData.actualWorkMinutes).toBeGreaterThanOrEqual(0);
    });

    it('論理削除で isDeleted, deletedAt, deletedBy が設定される', async () => {
      if (!emulatorAvailable) return;
      const attRef = await db.collection('attendances').add({
        staffId: 'staff-1',
        date: BUSINESS_DATE,
        clockIn: Timestamp.now(),
        clockOut: null,
        staffsFullName: '山田太郎',
        isDeleted: false,
      });

      const result = await updateAttendance(
        authReq({
          attendanceId: attRef.id,
          markDeleted: true,
        })
      );

      expect(result.success).toBe(true);

      const attSnap = await attRef.get();
      const attData = attSnap.data()!;
      expect(attData.isDeleted).toBe(true);
      expect(attData.deletedAt).toBeDefined();
      expect(attData.deletedBy).toBe('admin');
    });

    it('attendanceLogs に update_attendance が書き込まれる', async () => {
      if (!emulatorAvailable) return;
      const attRef = await db.collection('attendances').add({
        staffId: 'staff-1',
        date: BUSINESS_DATE,
        clockIn: Timestamp.now(),
        clockOut: null,
        staffsFullName: '山田太郎',
      });

      await updateAttendance(
        authReq({
          attendanceId: attRef.id,
          clockOut: new Date(`${BUSINESS_DATE}T18:00:00Z`).toISOString(),
        })
      );

      const logsSnap = await db
        .collection('attendanceLogs')
        .where('attendanceId', '==', attRef.id)
        .where('actionType', '==', 'update_attendance')
        .get();
      expect(logsSnap.size).toBe(1);
    });
  });

  describe('エラー: not-found', () => {
    it('存在しない attendanceId で not-found', async () => {
      if (!emulatorAvailable) return;
      await expect(
        updateAttendance(authReq({ attendanceId: 'nonexistent-att-id' }))
      ).rejects.toMatchObject({ code: 'not-found' });
    });
  });

  describe('エラー: failed-precondition（削除済み）', () => {
    it('既に論理削除済みの attendance は failed-precondition', async () => {
      if (!emulatorAvailable) return;
      const attRef = await db.collection('attendances').add({
        staffId: 'staff-1',
        date: BUSINESS_DATE,
        clockIn: Timestamp.now(),
        clockOut: null,
        staffsFullName: '山田太郎',
        isDeleted: true,
        deletedAt: Timestamp.now(),
        deletedBy: 'admin',
      });

      await expect(
        updateAttendance(
          authReq({
            attendanceId: attRef.id,
            clockOut: new Date(`${BUSINESS_DATE}T18:00:00Z`).toISOString(),
          })
        )
      ).rejects.toMatchObject({ code: 'failed-precondition' });
    });
  });
});
