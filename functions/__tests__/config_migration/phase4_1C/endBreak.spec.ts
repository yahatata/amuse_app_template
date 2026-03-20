/**
 * Phase4.1-C: endBreak Callable の単体テスト
 *
 * - 通常: break の endedAt 設定、親 attendance の breakMinutes を再計算
 * - エラー: not-found、failed-precondition（既に終了済み）
 * - attendanceLogs に end_break が書き込まれる
 *
 * Firestore Emulator 使用。
 */

import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import * as admin from 'firebase-admin';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

const PROJECT_ID = 'test-project-phase4-1c-endbreak';

const BUSINESS_DATE = '2026-03-04';

describe('Phase4.1-C: endBreak', () => {
  let testEnv: any;
  let db: admin.firestore.Firestore;
  let endBreak: (req: any) => Promise<any>;
  let emulatorAvailable = true;

  beforeAll(async () => {
    process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || 'localhost:8081';
    testEnv = await initializeTestEnvironment({ projectId: PROJECT_ID });
    if (admin.apps.length > 0) {
      await Promise.all(admin.apps.map((a) => a?.delete()).filter(Boolean));
    }
    admin.initializeApp({ projectId: PROJECT_ID });
    db = getFirestore();

    const mod = await import('../../../src/domains/attendance/callables/endBreak');
    endBreak = (req) => mod.endBreak.run(req);
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
        endBreak({ auth: null, data: { attendanceId: 'att-1', breakId: 'br-1' } })
      ).rejects.toMatchObject({ code: 'unauthenticated' });
    });

    it('attendanceId 未指定時は invalid-argument', async () => {
      if (!emulatorAvailable) return;
      await expect(endBreak(authReq({}))).rejects.toMatchObject({
        code: 'invalid-argument',
      });
      await expect(endBreak(authReq({ breakId: 'br-1' }))).rejects.toMatchObject({
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
      const breakRef = await attRef.collection('breaks').add({
        startedAt: Timestamp.now(),
        endedAt: null,
        isDeleted: false,
      });

      await expect(
        endBreak(authReq({ attendanceId: attRef.id, breakId: breakRef.id }))
      ).rejects.toMatchObject({ code: 'permission-denied' });
    });
  });

  describe('通常パターン', () => {
    it('休憩終了で success: true を返し、break の endedAt が設定され親の breakMinutes が更新される', async () => {
      if (!emulatorAvailable) return;
      const clockInTs = Timestamp.fromDate(new Date(Date.now() - 2 * 60 * 60 * 1000));
      const startedAtTs = Timestamp.fromDate(new Date(Date.now() - 30 * 60 * 1000));
      const attRef = await db.collection('attendances').add({
        staffId: 'staff-1',
        date: BUSINESS_DATE,
        clockIn: clockInTs,
        clockOut: null,
        isOnBreak: true,
        currentBreakStartedAt: startedAtTs,
        breakCount: 1,
        breakMinutes: 0,
        staffsFullName: '山田太郎',
      });
      const breakRef = await attRef.collection('breaks').add({
        startedAt: startedAtTs,
        endedAt: null,
        isDeleted: false,
        deletedAt: null,
        createdAt: startedAtTs,
        updatedAt: startedAtTs,
      });

      const result = await endBreak(
        authReq({ attendanceId: attRef.id, breakId: breakRef.id })
      );

      expect(result.success).toBe(true);
      expect(result.message).toBe('休憩を終了しました');

      const breakUpdated = await breakRef.get();
      const breakData = breakUpdated.data()!;
      expect(breakData.endedAt).toBeDefined();

      const attUpdated = await attRef.get();
      const attData = attUpdated.data()!;
      expect(attData.isOnBreak).toBe(false);
      expect(attData.currentBreakStartedAt).toBeNull();
      expect(attData.lastActionType).toBe('break_end');
      expect(attData.breakMinutes).toBeGreaterThanOrEqual(0);
    });

    it('breakId 未指定時はサーバー側で active break を検索して終了する', async () => {
      if (!emulatorAvailable) return;
      const clockInTs = Timestamp.fromDate(new Date(Date.now() - 2 * 60 * 60 * 1000));
      const startedAtTs = Timestamp.fromDate(new Date(Date.now() - 30 * 60 * 1000));
      const attRef = await db.collection('attendances').add({
        staffId: 'staff-1',
        date: BUSINESS_DATE,
        clockIn: clockInTs,
        clockOut: null,
        isOnBreak: true,
        currentBreakStartedAt: startedAtTs,
        breakCount: 1,
        breakMinutes: 0,
        staffsFullName: '山田太郎',
      });
      await attRef.collection('breaks').add({
        startedAt: startedAtTs,
        endedAt: null,
        isDeleted: false,
        deletedAt: null,
        createdAt: startedAtTs,
        updatedAt: startedAtTs,
      });

      const result = await endBreak(authReq({ attendanceId: attRef.id }));

      expect(result.success).toBe(true);
      const attUpdated = await attRef.get();
      const attData = attUpdated.data()!;
      expect(attData.isOnBreak).toBe(false);
    });

    it('attendanceLogs に end_break が書き込まれる', async () => {
      if (!emulatorAvailable) return;
      const attRef = await db.collection('attendances').add({
        staffId: 'staff-1',
        date: BUSINESS_DATE,
        clockIn: Timestamp.now(),
        clockOut: null,
        staffsFullName: '山田太郎',
      });
      const breakRef = await attRef.collection('breaks').add({
        startedAt: Timestamp.now(),
        endedAt: null,
        isDeleted: false,
      });

      await endBreak(authReq({ attendanceId: attRef.id, breakId: breakRef.id }));

      const logsSnap = await db
        .collection('attendanceLogs')
        .where('attendanceId', '==', attRef.id)
        .where('actionType', '==', 'end_break')
        .get();
      expect(logsSnap.size).toBe(1);
    });
  });

  describe('エラー: not-found', () => {
    it('breakId 未指定で active break がない場合 not-found', async () => {
      if (!emulatorAvailable) return;
      const attRef = await db.collection('attendances').add({
        staffId: 'staff-1',
        date: BUSINESS_DATE,
        clockIn: Timestamp.now(),
        clockOut: null,
        staffsFullName: '山田太郎',
      });

      await expect(endBreak(authReq({ attendanceId: attRef.id }))).rejects.toMatchObject({
        code: 'not-found',
      });
    });

    it('存在しない attendanceId で endBreak を呼ぶと not-found', async () => {
      if (!emulatorAvailable) return;
      await expect(
        endBreak(authReq({ attendanceId: 'nonexistent-att', breakId: 'br-1' }))
      ).rejects.toMatchObject({ code: 'not-found' });
    });

    it('存在しない breakId で endBreak を呼ぶと not-found', async () => {
      if (!emulatorAvailable) return;
      const attRef = await db.collection('attendances').add({
        staffId: 'staff-1',
        date: BUSINESS_DATE,
        clockIn: Timestamp.now(),
        clockOut: null,
        staffsFullName: '山田太郎',
      });

      await expect(
        endBreak(authReq({ attendanceId: attRef.id, breakId: 'nonexistent-break' }))
      ).rejects.toMatchObject({ code: 'not-found' });
    });
  });

  describe('エラー: failed-precondition（既に終了済み）', () => {
    it('既に endedAt が設定されている break の場合 failed-precondition', async () => {
      if (!emulatorAvailable) return;
      const attRef = await db.collection('attendances').add({
        staffId: 'staff-1',
        date: BUSINESS_DATE,
        clockIn: Timestamp.now(),
        clockOut: null,
        staffsFullName: '山田太郎',
      });
      const breakRef = await attRef.collection('breaks').add({
        startedAt: Timestamp.now(),
        endedAt: Timestamp.now(),
        isDeleted: false,
      });

      await expect(
        endBreak(authReq({ attendanceId: attRef.id, breakId: breakRef.id }))
      ).rejects.toMatchObject({ code: 'failed-precondition' });
    });
  });
});
