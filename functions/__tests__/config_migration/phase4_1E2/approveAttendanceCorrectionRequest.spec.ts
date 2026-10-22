/**
 * Phase4.1-E2: approveAttendanceCorrectionRequest Callable の単体テスト
 *
 * - recalculateAttendanceFromBreaks が呼ばれ、break ありの attendance で actualWorkMinutes, nightWorkMinutes が正しく算出される
 * - attendanceLogs に approve_correction_request が書き込まれる
 * - エラー: 申請未存在、非 pending
 *
 * Firestore Emulator 使用。
 */

import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import * as admin from 'firebase-admin';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

const PROJECT_ID = 'test-project-phase4-1e2-approve';

const BUSINESS_DATE = '2026-03-04';

describe('Phase4.1-E2: approveAttendanceCorrectionRequest', () => {
  let testEnv: any;
  let db: admin.firestore.Firestore;
  let approveAttendanceCorrectionRequest: (req: any) => Promise<any>;
  let emulatorAvailable = true;

  beforeAll(async () => {
    process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || 'localhost:8081';
    testEnv = await initializeTestEnvironment({ projectId: PROJECT_ID });
    if (admin.apps.length > 0) {
      await Promise.all(admin.apps.map((a) => a?.delete()).filter(Boolean));
    }
    admin.initializeApp({ projectId: PROJECT_ID });
    db = getFirestore();

    const mod = await import('../../../src/domains/attendance/callables/approveAttendanceCorrectionRequest');
    approveAttendanceCorrectionRequest = (req) => mod.approveAttendanceCorrectionRequest.run(req);
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

  });

  const authReq = (data: Record<string, unknown> = {}) => ({
    auth: { uid: 'caller-uid-1' },
    data,
  });

  describe('recalculateAttendanceFromBreaks', () => {
    it('break ありの attendance で actualWorkMinutes, nightWorkMinutes が正しく算出される', async () => {
      if (!emulatorAvailable) return;

      const clockIn = new Date(`${BUSINESS_DATE}T09:00:00+09:00`);
      const breakStart = new Date(`${BUSINESS_DATE}T12:00:00+09:00`);
      const breakEnd = new Date(`${BUSINESS_DATE}T13:00:00+09:00`);

      const attRef = await db.collection('attendances').add({
        staffId: 'staff-1',
        date: BUSINESS_DATE,
        clockIn: Timestamp.fromDate(clockIn),
        clockOut: null,
        staffsFullName: '山田太郎',
      });
      await attRef.collection('breaks').add({
        startedAt: Timestamp.fromDate(breakStart),
        endedAt: Timestamp.fromDate(breakEnd),
        isDeleted: false,
      });

      const reqRef = await db.collection('attendanceCorrectionRequests').add({
        staffId: 'staff-1',
        date: BUSINESS_DATE,
        type: 'clockOut',
        currentClockIn: '09:00',
        currentClockOut: null,
        newClockIn: null,
        newClockOut: '18:00',
        reason: 'テスト',
        status: 'pending',
      });

      const result = await approveAttendanceCorrectionRequest(
        authReq({ requestId: reqRef.id, adminUserId: 'admin-1' })
      );

      expect(result.success).toBe(true);

      const attSnap = await attRef.get();
      const attData = attSnap.data();
      expect(attData?.clockOut).toBeDefined();
      expect(attData?.breakMinutes).toBe(60); // 12:00-13:00
      expect(attData?.actualWorkMinutes).toBe(480); // 9h - 1h break = 8h
      expect(attData?.totalMinutes).toBe(540); // 9h gross
      expect(attData?.nightWorkMinutes).toBe(0); // 22-5 外
    });

    it('attendanceLogs に approve_correction_request が書き込まれる', async () => {
      if (!emulatorAvailable) return;

      const attRef = await db.collection('attendances').add({
        staffId: 'staff-1',
        date: BUSINESS_DATE,
        clockIn: Timestamp.fromDate(new Date(`${BUSINESS_DATE}T09:00:00+09:00`)),
        clockOut: null,
        staffsFullName: '山田太郎',
      });

      const reqRef = await db.collection('attendanceCorrectionRequests').add({
        staffId: 'staff-1',
        date: BUSINESS_DATE,
        type: 'clockOut',
        currentClockIn: '09:00',
        currentClockOut: null,
        newClockIn: null,
        newClockOut: '18:00',
        reason: 'テスト',
        status: 'pending',
      });

      await approveAttendanceCorrectionRequest(
        authReq({ requestId: reqRef.id, adminUserId: 'admin-1' })
      );

      const logsSnap = await db
        .collection('attendanceLogs')
        .where('attendanceId', '==', attRef.id)
        .where('actionType', '==', 'approve_correction_request')
        .get();
      expect(logsSnap.size).toBeGreaterThanOrEqual(1);
    });
  });

  describe('エラー', () => {
    it('申請が存在しない場合はエラー', async () => {
      if (!emulatorAvailable) return;
      const result = await approveAttendanceCorrectionRequest(
        authReq({ requestId: 'non-existent-request-id', adminUserId: 'admin-1' })
      );
      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('申請が pending でない場合はエラー', async () => {
      if (!emulatorAvailable) return;
      const reqRef = await db.collection('attendanceCorrectionRequests').add({
        staffId: 'staff-1',
        date: BUSINESS_DATE,
        type: 'clockOut',
        status: 'approved',
      });

      const result = await approveAttendanceCorrectionRequest(
        authReq({ requestId: reqRef.id, adminUserId: 'admin-1' })
      );
      expect(result.success).toBe(false);
      expect(result.error).toContain('not in pending');
    });
  });
});
