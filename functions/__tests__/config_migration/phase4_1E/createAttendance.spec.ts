/**
 * Phase4.1-E: createAttendance Callable の単体テスト
 *
 * - 通常: attendances に doc 作成、新フィールドが設定される
 * - clockOut あり: recalculateAttendanceFromBreaks で actualWorkMinutes, nightWorkMinutes が算出される
 * - attendanceLogs に create_attendance が書き込まれる
 * - エラー: permission-denied（admin でない）, invalid-argument, not-found
 *
 * Firestore Emulator 使用。
 */

import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';

const PROJECT_ID = 'test-project-phase4-1e-createattendance';

const BUSINESS_DATE = '2026-03-04';

describe('Phase4.1-E: createAttendance', () => {
  let testEnv: any;
  let db: admin.firestore.Firestore;
  let createAttendance: (req: any) => Promise<any>;
  let emulatorAvailable = true;

  beforeAll(async () => {
    process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || 'localhost:8081';
    testEnv = await initializeTestEnvironment({ projectId: PROJECT_ID });
    if (admin.apps.length > 0) {
      await Promise.all(admin.apps.map((a) => a?.delete()).filter(Boolean));
    }
    admin.initializeApp({ projectId: PROJECT_ID });
    db = getFirestore();

    const mod = await import('../../../src/domains/attendance/callables/createAttendance');
    createAttendance = (req) => mod.createAttendance.run(req);
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
    await db.collection('staffs').doc('staff-1').set({
      fullName: '山田太郎',
      fullNameKana: 'ヤマダタロウ',
    });
  });

  const authReq = (data: Record<string, unknown> = {}) => ({
    auth: { uid: 'caller-uid-1' },
    data,
  });

  describe('認証・権限', () => {
    it('未認証時は unauthenticated', async () => {
      await expect(
        createAttendance({
          auth: null,
          data: {
            staffId: 'staff-1',
            staffName: '山田太郎',
            date: BUSINESS_DATE,
            clockIn: new Date(`${BUSINESS_DATE}T09:00:00Z`).toISOString(),
          },
        })
      ).rejects.toMatchObject({ code: 'unauthenticated' });
    });

    it('staffId 未指定時は invalid-argument', async () => {
      if (!emulatorAvailable) return;
      await expect(
        createAttendance(
          authReq({
            staffName: '山田太郎',
            date: BUSINESS_DATE,
            clockIn: new Date(`${BUSINESS_DATE}T09:00:00Z`).toISOString(),
          })
        )
      ).rejects.toMatchObject({ code: 'invalid-argument' });
    });

    it('admin でないデバイスは permission-denied', async () => {
      if (!emulatorAvailable) return;
      await db.collection('devices').doc('dev-1').update({ role: 'terminal' });

      await expect(
        createAttendance(
          authReq({
            staffId: 'staff-1',
            staffName: '山田太郎',
            date: BUSINESS_DATE,
            clockIn: new Date(`${BUSINESS_DATE}T09:00:00Z`).toISOString(),
          })
        )
      ).rejects.toMatchObject({ code: 'permission-denied' });
    });
  });

  describe('通常パターン', () => {
    it('勤怠が作成され success: true, docId を返す', async () => {
      if (!emulatorAvailable) return;
      const clockInIso = new Date(`${BUSINESS_DATE}T09:00:00Z`).toISOString();

      const result = await createAttendance(
        authReq({
          staffId: 'staff-1',
          staffName: '山田太郎',
          date: BUSINESS_DATE,
          clockIn: clockInIso,
        })
      );

      expect(result.success).toBe(true);
      expect(result.docId).toBeDefined();
      expect(result.message).toContain('山田太郎');

      const attSnap = await db.collection('attendances').doc(result.docId).get();
      expect(attSnap.exists).toBe(true);
      const attData = attSnap.data()!;
      expect(attData.staffId).toBe('staff-1');
      expect(attData.date).toBe(BUSINESS_DATE);
      expect(attData.staffsFullName).toBe('山田太郎');
      expect(attData.breakMinutes).toBe(0);
      expect(attData.isDeleted).toBe(false);
      expect(attData.actualWorkMinutes).toBeNull();
    });

    it('clockOut ありで actualWorkMinutes, nightWorkMinutes が算出される', async () => {
      if (!emulatorAvailable) return;
      const clockInIso = new Date(`${BUSINESS_DATE}T09:00:00Z`).toISOString();
      const clockOutIso = new Date(`${BUSINESS_DATE}T18:00:00Z`).toISOString();

      const result = await createAttendance(
        authReq({
          staffId: 'staff-1',
          staffName: '山田太郎',
          date: BUSINESS_DATE,
          clockIn: clockInIso,
          clockOut: clockOutIso,
        })
      );

      expect(result.success).toBe(true);

      const attSnap = await db.collection('attendances').doc(result.docId).get();
      const attData = attSnap.data()!;
      expect(attData.actualWorkMinutes).toBeGreaterThanOrEqual(0);
      expect(attData.nightWorkMinutes).toBeDefined();
      expect(attData.totalMinutes).toBe(9 * 60);
    });

    it('attendanceLogs に create_attendance が書き込まれる', async () => {
      if (!emulatorAvailable) return;
      const result = await createAttendance(
        authReq({
          staffId: 'staff-1',
          staffName: '山田太郎',
          date: BUSINESS_DATE,
          clockIn: new Date(`${BUSINESS_DATE}T09:00:00Z`).toISOString(),
        })
      );

      const logsSnap = await db
        .collection('attendanceLogs')
        .where('attendanceId', '==', result.docId)
        .where('actionType', '==', 'create_attendance')
        .get();
      expect(logsSnap.size).toBe(1);
    });
  });
});
