/**
 * Phase4 01: clockOut Callable の単体テスト
 *
 * - 通常: 退勤記録が更新される
 * - 警告: 他に closedStoreWithoutClockOut の attendance がある場合 warning 付き
 * - エラー: 勤務中データなし (no-unclocked-attendance)
 * - エラー: 1時間猶予超過 (grace-period-expired)
 * - staffId / docId 指定パターン
 * - 認証・権限: 未認証、デバイスなし、権限なしで失敗
 *
 * Firestore Emulator 使用。
 */

import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import * as admin from 'firebase-admin';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

const PROJECT_ID = 'test-project-phase4-01-clockout';

const BUSINESS_DATE = '2026-03-04';

describe('Phase4 01: clockOut', () => {
  let testEnv: any;
  let db: admin.firestore.Firestore;
  let clockOut: (req: any) => Promise<any>;
  let emulatorAvailable = true;

  beforeAll(async () => {
    process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || 'localhost:8081';
    testEnv = await initializeTestEnvironment({ projectId: PROJECT_ID });
    if (admin.apps.length > 0) {
      await Promise.all(admin.apps.map((a) => a?.delete()).filter(Boolean));
    }
    admin.initializeApp({ projectId: PROJECT_ID });
    db = getFirestore();

    const mod = await import('../../../src/domains/attendance/callables/clockOut');
    clockOut = (req) => mod.clockOut.run(req);
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
    await db.collection('storeMeta').doc('currentBusinessDay').set({
      status: 'running',
      currentBusinessDateKey: BUSINESS_DATE,
      lastClosedBusinessDateKey: null,
      updatedAt: Timestamp.now(),
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
        clockOut({ auth: null, data: { staffId: 'staff-1' } })
      ).rejects.toMatchObject({ code: 'unauthenticated' });
    });

    it('staffId / docId 両方未指定時は invalid-argument', async () => {
      if (!emulatorAvailable) return;
      await expect(
        clockOut(authReq({}))
      ).rejects.toMatchObject({ code: 'invalid-argument' });
    });

    it('デバイスが存在しない場合 permission-denied', async () => {
      if (!emulatorAvailable) return;
      await testEnv.clearFirestore();
      await db.collection('storeMeta').doc('currentBusinessDay').set({
        status: 'running',
        currentBusinessDateKey: BUSINESS_DATE,
      });

      await expect(
        clockOut(authReq({ staffId: 'staff-1' }))
      ).rejects.toMatchObject({ code: 'permission-denied' });
    });
  });

  describe('通常パターン: staffId 指定', () => {
    it('退勤記録が更新され success: true を返す', async () => {
      if (!emulatorAvailable) return;
      const clockInTs = Timestamp.fromDate(new Date(Date.now() - 4 * 60 * 60 * 1000));
      const attRef = await db.collection('attendances').add({
        staffId: 'staff-1',
        date: BUSINESS_DATE,
        clockIn: clockInTs,
        clockOut: null,
        closedStoreWithoutClockOut: false,
        staffsFullName: '山田太郎',
      });

      const result = await clockOut(authReq({ staffId: 'staff-1' }));

      expect(result.success).toBe(true);
      expect(result.docId).toBe(attRef.id);
      expect(result.message).toContain('山田太郎');
      expect(result.warning).toBeUndefined();

      const updated = await attRef.get();
      const data = updated.data()!;
      expect(data.clockOut).toBeDefined();
      expect(data.totalMinutes).toBeGreaterThanOrEqual(0);
      expect(data.nightMinutes).toBeDefined();
    });
  });

  describe('通常パターン: docId 指定', () => {
    it('docId 指定で退勤記録が更新される', async () => {
      if (!emulatorAvailable) return;
      const clockInTs = Timestamp.fromDate(new Date(Date.now() - 2 * 60 * 60 * 1000));
      const attRef = await db.collection('attendances').add({
        staffId: 'staff-1',
        date: BUSINESS_DATE,
        clockIn: clockInTs,
        clockOut: null,
        closedStoreWithoutClockOut: false,
        staffsFullName: '山田太郎',
      });

      const result = await clockOut(authReq({ docId: attRef.id }));

      expect(result.success).toBe(true);
      expect(result.docId).toBe(attRef.id);
      expect(result.message).toContain('山田太郎');

      const updated = await attRef.get();
      expect(updated.data()!.clockOut).toBeDefined();
    });
  });

  describe('エラー: no-unclocked-attendance', () => {
    it('勤務中データが存在しない場合 success: false, code: no-unclocked-attendance', async () => {
      if (!emulatorAvailable) return;
      const result = await clockOut(authReq({ staffId: 'staff-1' }));

      expect(result.success).toBe(false);
      expect(result.code).toBe('no-unclocked-attendance');
      expect(result.message).toContain('勤務中のデータがありません');
    });

    it('docId で存在しないドキュメントを指定した場合 no-unclocked-attendance', async () => {
      if (!emulatorAvailable) return;
      const result = await clockOut(authReq({ docId: 'nonexistent-doc-id' }));

      expect(result.success).toBe(false);
      expect(result.code).toBe('no-unclocked-attendance');
    });

    it('既に退勤済みの attendance の場合 no-unclocked-attendance', async () => {
      if (!emulatorAvailable) return;
      const attRef = await db.collection('attendances').add({
        staffId: 'staff-1',
        date: BUSINESS_DATE,
        clockIn: Timestamp.now(),
        clockOut: Timestamp.now(),
        closedStoreWithoutClockOut: false,
        staffsFullName: '山田太郎',
      });

      const result = await clockOut(authReq({ docId: attRef.id }));

      expect(result.success).toBe(false);
      expect(result.code).toBe('no-unclocked-attendance');
    });
  });

  describe('エラー: grace-period-expired', () => {
    it('closedStoreWithoutClockOut + closedAt があり1時間超過の場合 success: false, code: grace-period-expired', async () => {
      if (!emulatorAvailable) return;
      const closedAt = Timestamp.fromDate(new Date(Date.now() - 2 * 60 * 60 * 1000));
      const attRef = await db.collection('attendances').add({
        staffId: 'staff-1',
        date: BUSINESS_DATE,
        clockIn: Timestamp.fromDate(new Date(Date.now() - 5 * 60 * 60 * 1000)),
        clockOut: null,
        closedStoreWithoutClockOut: true,
        closedAt,
        staffsFullName: '山田太郎',
      });

      const result = await clockOut(authReq({ docId: attRef.id }));

      expect(result.success).toBe(false);
      expect(result.code).toBe('grace-period-expired');
      expect(result.message).toContain('閉店から1時間を経過');

      const updated = await attRef.get();
      expect(updated.data()!.clockOut).toBeNull();
    });
  });

  describe('1時間猶予内: 通常退勤可', () => {
    it('closedStoreWithoutClockOut + closedAt があり1時間以内なら通常退勤可', async () => {
      if (!emulatorAvailable) return;
      const closedAt = Timestamp.fromDate(new Date(Date.now() - 30 * 60 * 1000));
      const attRef = await db.collection('attendances').add({
        staffId: 'staff-1',
        date: BUSINESS_DATE,
        clockIn: Timestamp.fromDate(new Date(Date.now() - 2 * 60 * 60 * 1000)),
        clockOut: null,
        closedStoreWithoutClockOut: true,
        closedAt,
        staffsFullName: '山田太郎',
      });

      const result = await clockOut(authReq({ docId: attRef.id }));

      expect(result.success).toBe(true);
      expect(result.code).toBeUndefined();
      expect(result.docId).toBe(attRef.id);

      const updated = await attRef.get();
      expect(updated.data()!.clockOut).toBeDefined();
    });
  });

  describe('警告: 他に closedStoreWithoutClockOut あり', () => {
    it('他に closedStoreWithoutClockOut の attendance がある場合 warning を返す', async () => {
      if (!emulatorAvailable) return;
      await db.collection('attendances').doc('att-closed').set({
        staffId: 'staff-1',
        date: '2026-03-03',
        clockIn: Timestamp.now(),
        clockOut: null,
        closedStoreWithoutClockOut: true,
        closedAt: Timestamp.now(),
        staffsFullName: '山田太郎',
      });
      const attRef = await db.collection('attendances').add({
        staffId: 'staff-1',
        date: BUSINESS_DATE,
        clockIn: Timestamp.fromDate(new Date(Date.now() - 2 * 60 * 60 * 1000)),
        clockOut: null,
        closedStoreWithoutClockOut: false,
        staffsFullName: '山田太郎',
      });

      const result = await clockOut(authReq({ docId: attRef.id }));

      expect(result.success).toBe(true);
      expect(result.warning).toContain('管理者に確認して');
    });
  });
});
