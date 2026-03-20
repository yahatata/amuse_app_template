/**
 * Phase4.1-C: startBreak Callable の単体テスト
 *
 * - 通常: breaks に doc 作成、親 attendance の isOnBreak 等を更新
 * - エラー: already-exists（休憩中）、not-found、permission-denied
 * - attendanceLogs に start_break が書き込まれる
 *
 * Firestore Emulator 使用。
 */

import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import * as admin from 'firebase-admin';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

const PROJECT_ID = 'test-project-phase4-1c-startbreak';

const BUSINESS_DATE = '2026-03-04';

describe('Phase4.1-C: startBreak', () => {
  let testEnv: any;
  let db: admin.firestore.Firestore;
  let startBreak: (req: any) => Promise<any>;
  let emulatorAvailable = true;

  beforeAll(async () => {
    process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || 'localhost:8081';
    testEnv = await initializeTestEnvironment({ projectId: PROJECT_ID });
    if (admin.apps.length > 0) {
      await Promise.all(admin.apps.map((a) => a?.delete()).filter(Boolean));
    }
    admin.initializeApp({ projectId: PROJECT_ID });
    db = getFirestore();

    const mod = await import('../../../src/domains/attendance/callables/startBreak');
    startBreak = (req) => mod.startBreak.run(req);
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
        startBreak({ auth: null, data: { attendanceId: 'att-1' } })
      ).rejects.toMatchObject({ code: 'unauthenticated' });
    });

    it('attendanceId 未指定時は invalid-argument', async () => {
      if (!emulatorAvailable) return;
      await expect(startBreak(authReq({}))).rejects.toMatchObject({
        code: 'invalid-argument',
      });
    });

    it('デバイスが存在しない場合 permission-denied', async () => {
      if (!emulatorAvailable) return;
      await testEnv.clearFirestore();

      const attRef = await db.collection('attendances').add({
        staffId: 'staff-1',
        date: BUSINESS_DATE,
        clockIn: Timestamp.now(),
        clockOut: null,
        staffsFullName: '山田太郎',
      });

      await expect(
        startBreak(authReq({ attendanceId: attRef.id }))
      ).rejects.toMatchObject({ code: 'permission-denied' });
    });
  });

  describe('通常パターン', () => {
    it('休憩開始で success: true, breakId を返し、breaks に doc が作成される', async () => {
      if (!emulatorAvailable) return;
      const attRef = await db.collection('attendances').add({
        staffId: 'staff-1',
        date: BUSINESS_DATE,
        clockIn: Timestamp.now(),
        clockOut: null,
        staffsFullName: '山田太郎',
      });

      const result = await startBreak(authReq({ attendanceId: attRef.id }));

      expect(result.success).toBe(true);
      expect(result.breakId).toBeDefined();
      expect(result.message).toBe('休憩を開始しました');

      const breaksSnap = await attRef.collection('breaks').get();
      expect(breaksSnap.size).toBe(1);
      const breakData = breaksSnap.docs[0].data();
      expect(breakData.startedAt).toBeDefined();
      expect(breakData.endedAt).toBeNull();
      expect(breakData.isDeleted).toBe(false);

      const attUpdated = await attRef.get();
      const attData = attUpdated.data()!;
      expect(attData.isOnBreak).toBe(true);
      expect(attData.currentBreakStartedAt).toBeDefined();
      expect(attData.lastActionType).toBe('break_start');
    });

    it('attendanceLogs に start_break が書き込まれる', async () => {
      if (!emulatorAvailable) return;
      const attRef = await db.collection('attendances').add({
        staffId: 'staff-1',
        date: BUSINESS_DATE,
        clockIn: Timestamp.now(),
        clockOut: null,
        staffsFullName: '山田太郎',
      });

      await startBreak(authReq({ attendanceId: attRef.id }));

      const logsSnap = await db
        .collection('attendanceLogs')
        .where('attendanceId', '==', attRef.id)
        .where('actionType', '==', 'start_break')
        .get();
      expect(logsSnap.size).toBe(1);
    });
  });

  describe('エラー: not-found', () => {
    it('存在しない attendanceId で startBreak を呼ぶと not-found', async () => {
      if (!emulatorAvailable) return;
      await expect(
        startBreak(authReq({ attendanceId: 'nonexistent-att-id' }))
      ).rejects.toMatchObject({ code: 'not-found' });
    });
  });

  describe('エラー: already-exists（休憩中）', () => {
    it('既に休憩中の場合 already-exists', async () => {
      if (!emulatorAvailable) return;
      const attRef = await db.collection('attendances').add({
        staffId: 'staff-1',
        date: BUSINESS_DATE,
        clockIn: Timestamp.now(),
        clockOut: null,
        isOnBreak: true,
        currentBreakStartedAt: Timestamp.now(),
        staffsFullName: '山田太郎',
      });

      await expect(
        startBreak(authReq({ attendanceId: attRef.id }))
      ).rejects.toMatchObject({ code: 'already-exists' });
    });
  });

  describe('エラー: failed-precondition（退勤済み）', () => {
    it('既に退勤済みの attendance の場合 failed-precondition', async () => {
      if (!emulatorAvailable) return;
      const attRef = await db.collection('attendances').add({
        staffId: 'staff-1',
        date: BUSINESS_DATE,
        clockIn: Timestamp.now(),
        clockOut: Timestamp.now(),
        staffsFullName: '山田太郎',
      });

      await expect(
        startBreak(authReq({ attendanceId: attRef.id }))
      ).rejects.toMatchObject({ code: 'failed-precondition' });
    });
  });
});
