/**
 * Phase4 01: clockIn Callable の単体テスト
 *
 * - 通常: 出勤記録が作成される
 * - 警告: closedStoreWithoutClockOut の attendance が存在する場合、warning を返しつつ出勤可
 * - エラー: 当日の未退勤が既に存在する場合、already-clock-in で失敗
 * - 認証・権限: 未認証、デバイスなし、権限なしで失敗
 *
 * Firestore Emulator 使用。
 */

import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import * as admin from 'firebase-admin';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

const PROJECT_ID = 'test-project-phase4-01-clockin';

const BUSINESS_DATE = '2026-03-04';

describe('Phase4 01: clockIn', () => {
  let testEnv: any;
  let db: admin.firestore.Firestore;
  let clockIn: (req: any) => Promise<any>;
  let emulatorAvailable = true;

  beforeAll(async () => {
    process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || 'localhost:8081';
    testEnv = await initializeTestEnvironment({ projectId: PROJECT_ID });
    if (admin.apps.length > 0) {
      await Promise.all(admin.apps.map((a) => a?.delete()).filter(Boolean));
    }
    admin.initializeApp({ projectId: PROJECT_ID });
    db = getFirestore();

    const mod = await import('../../../src/domains/attendance/callables/clockIn');
    clockIn = (req) => mod.clockIn.run(req);
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
        clockIn({ auth: null, data: { staffId: 'staff-1' } })
      ).rejects.toMatchObject({ code: 'unauthenticated' });
    });

    it('staffId 未指定時は invalid-argument', async () => {
      if (!emulatorAvailable) return;
      await expect(
        clockIn(authReq({}))
      ).rejects.toMatchObject({ code: 'invalid-argument' });
    });

    it('デバイスが存在しない場合 permission-denied', async () => {
      if (!emulatorAvailable) return;
      await testEnv.clearFirestore();
      await db.collection('storeMeta').doc('currentBusinessDay').set({
        status: 'running',
        currentBusinessDateKey: BUSINESS_DATE,
      });
      await db.collection('staffs').doc('staff-1').set({
        fullName: 'Test',
        status: 'active',
      });

      await expect(
        clockIn(authReq({ staffId: 'staff-1' }))
      ).rejects.toMatchObject({ code: 'permission-denied' });
    });
  });

  describe('通常パターン', () => {
    it('出勤記録が作成され success: true を返す', async () => {
      if (!emulatorAvailable) return;
      const result = await clockIn(authReq({ staffId: 'staff-1' }));

      expect(result.success).toBe(true);
      expect(result.docId).toBeDefined();
      expect(result.message).toContain('山田太郎');
      expect(result.warning).toBeUndefined();

      const attendances = await db.collection('attendances')
        .where('staffId', '==', 'staff-1')
        .where('date', '==', BUSINESS_DATE)
        .get();
      expect(attendances.size).toBe(1);
      const data = attendances.docs[0].data();
      expect(data.clockIn).toBeDefined();
      expect(data.clockOut).toBeNull();
      expect(data.closedStoreWithoutClockOut).toBe(false);
      expect(data.staffsFullName).toBe('山田太郎');
    });

    it('staffName を省略した場合 staffs から取得', async () => {
      if (!emulatorAvailable) return;
      const result = await clockIn(authReq({ staffId: 'staff-1' }));

      expect(result.success).toBe(true);
      expect(result.message).toContain('山田太郎');

      const attendances = await db.collection('attendances')
        .where('staffId', '==', 'staff-1')
        .get();
      expect(attendances.docs[0].data().staffsFullName).toBe('山田太郎');
    });

    it('staffName を渡した場合はそれを使用', async () => {
      if (!emulatorAvailable) return;
      const result = await clockIn(authReq({
        staffId: 'staff-1',
        staffName: 'カスタム名',
      }));

      expect(result.success).toBe(true);
      expect(result.message).toContain('カスタム名');

      const attendances = await db.collection('attendances')
        .where('staffId', '==', 'staff-1')
        .get();
      expect(attendances.docs[0].data().staffsFullName).toBe('カスタム名');
    });
  });

  describe('エラー: already-clock-in', () => {
    it('当日の未退勤が既に存在する場合 success: false, code: already-clock-in', async () => {
      if (!emulatorAvailable) return;
      await db.collection('attendances').doc('att-existing').set({
        staffId: 'staff-1',
        date: BUSINESS_DATE,
        clockIn: Timestamp.now(),
        clockOut: null,
        staffsFullName: '山田太郎',
      });

      const result = await clockIn(authReq({ staffId: 'staff-1' }));

      expect(result.success).toBe(false);
      expect(result.code).toBe('already-clock-in');
      expect(result.message).toContain('すでに出勤登録がされています');

      const attendances = await db.collection('attendances')
        .where('staffId', '==', 'staff-1')
        .get();
      expect(attendances.size).toBe(1);
    });
  });

  describe('警告: closedStoreWithoutClockOut 存在', () => {
    it('closedStoreWithoutClockOut の attendance がある場合 warning を返しつつ出勤可', async () => {
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

      const result = await clockIn(authReq({ staffId: 'staff-1' }));

      expect(result.success).toBe(true);
      expect(result.warning).toContain('管理者に確認して');
      expect(result.docId).toBeDefined();

      const attendances = await db.collection('attendances')
        .where('staffId', '==', 'staff-1')
        .get();
      expect(attendances.size).toBe(2);
      const today = attendances.docs.find((d) => d.data().date === BUSINESS_DATE);
      expect(today?.data().closedStoreWithoutClockOut).toBe(false);
    });
  });

  describe('スタッフ存在チェック', () => {
    it('存在しない staffId は permission-denied（STAFF_NOT_ACTIVE）', async () => {
      if (!emulatorAvailable) return;
      await expect(
        clockIn(authReq({ staffId: 'nonexistent-staff' }))
      ).rejects.toMatchObject({
        code: 'permission-denied',
        message: '退職済みのため、この操作は利用できません。',
        details: expect.objectContaining({ errorKey: 'STAFF_NOT_ACTIVE' }),
      });

      const attendances = await db
        .collection('attendances')
        .where('staffId', '==', 'nonexistent-staff')
        .get();
      expect(attendances.empty).toBe(true);
    });

    it('retired staff は permission-denied（STAFF_RETIRED）', async () => {
      if (!emulatorAvailable) return;
      await db.collection('staffs').doc('staff-retired').set({
        fullName: '退職太郎',
        status: 'retired',
      });

      await expect(
        clockIn(authReq({ staffId: 'staff-retired' }))
      ).rejects.toMatchObject({
        code: 'permission-denied',
        details: expect.objectContaining({ errorKey: 'STAFF_RETIRED' }),
      });

      const attendances = await db
        .collection('attendances')
        .where('staffId', '==', 'staff-retired')
        .get();
      expect(attendances.empty).toBe(true);
    });
  });

  describe('L7-A: concurrent clockIn', () => {
    it('同時 clockIn でも open attendance は 1 件', async () => {
      if (!emulatorAvailable) return;
      const results = await Promise.all([
        clockIn(authReq({ staffId: 'staff-1' })),
        clockIn(authReq({ staffId: 'staff-1' })),
      ]);

      const successes = results.filter((r) => r.success === true);
      const duplicates = results.filter((r) => r.code === 'already-clock-in');
      expect(successes.length).toBe(1);
      expect(duplicates.length).toBe(1);

      const attendances = await db
        .collection('attendances')
        .where('staffId', '==', 'staff-1')
        .where('clockOut', '==', null)
        .get();
      const open = attendances.docs.filter((d) => d.data().closedStoreWithoutClockOut !== true);
      expect(open.length).toBe(1);
    });
  });
});
