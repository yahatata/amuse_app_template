/**
 * Phase4.1-F: monthlyPayrollTrigger の単体テスト
 *
 * - 新規 attendance（actualWorkMinutes あり）で actualWorkMinutes, nightWorkMinutes を使用
 * - 既存 attendance（totalMinutes のみ）で totalMinutes, nightMinutes を使用
 * - 論理削除（isDeleted: true）を除外
 * - payrollReflectedAt を付与
 * - attendanceLogs に monthly_payroll_reflect を書き込み
 *
 * Firestore Emulator 使用。
 */

import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import * as admin from 'firebase-admin';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

const PROJECT_ID = 'test-project-phase4-1f-payroll';

describe('Phase4.1-F: monthlyPayrollTrigger', () => {
  let testEnv: any;
  let db: admin.firestore.Firestore;
  let monthlyPayrollTrigger: () => Promise<unknown>;
  let emulatorAvailable = true;

  beforeAll(async () => {
    process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || 'localhost:8081';
    testEnv = await initializeTestEnvironment({ projectId: PROJECT_ID });
    if (admin.apps.length > 0) {
      await Promise.all(admin.apps.map((a) => a?.delete()).filter(Boolean));
    }
    admin.initializeApp({ projectId: PROJECT_ID });
    db = getFirestore();

    const mod = await import('../../../src/domains/attendance/scheduler/monthlyPayrollTrigger');
    monthlyPayrollTrigger = async () => mod.monthlyPayrollTrigger.run({} as any);
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

    await db.collection('storeMeta').doc('config').set({
      payroll: { startDay: 26, endDay: 25 },
    });
    await db.collection('storeMeta').doc('schedulerConfig').set({
      monthlyPayrollTriggerEnabled: true,
    });
  });

  /** 給与期間（config: startDay 26, endDay 25）に含まれる日付を返す */
  function getDateInPayrollPeriod(): { dateStr: string; clockOut: Date } {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    const day = Math.min(15, 25);
    const dateStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const clockOut = new Date(y, m, day, 18, 0, 0);
    return { dateStr, clockOut };
  }

  describe('actualWorkMinutes / totalMinutes の切り替え', () => {
    it('新規 attendance（actualWorkMinutes あり）で actualWorkMinutes を使用する', async () => {
      if (!emulatorAvailable) return;

      const { dateStr, clockOut } = getDateInPayrollPeriod();

      await db.collection('staffs').doc('staff-1').set({
        fullName: '山田太郎',
        hourlyWage: 1500,
      });

      const attRef = await db.collection('attendances').add({
        staffId: 'staff-1',
        date: dateStr,
        clockIn: Timestamp.fromDate(new Date(clockOut.getFullYear(), clockOut.getMonth(), clockOut.getDate(), 9, 0, 0)),
        clockOut: Timestamp.fromDate(clockOut),
        totalMinutes: 600,
        nightMinutes: 0,
        actualWorkMinutes: 480,
        nightWorkMinutes: 0,
        breakMinutes: 120,
      });

      await monthlyPayrollTrigger();

      const payrollSnap = await db
        .collection('monthlyPayroll')
        .where('staffId', '==', 'staff-1')
        .get();
      expect(payrollSnap.size).toBeGreaterThanOrEqual(1);
      const payroll = payrollSnap.docs[0].data();
      expect(payroll.totalWorkHours).toBe(8); // 480/60
      expect(payroll.nightTimeHours).toBe(0);

      const attSnap = await attRef.get();
      expect(attSnap.data()?.payrollReflectedAt).toMatch(/^\d{4}-\d{2}-\d{2}-\d{4}-\d{2}-\d{2}$/);
    });

    it('既存 attendance（totalMinutes のみ）で totalMinutes を使用する', async () => {
      if (!emulatorAvailable) return;

      const { dateStr, clockOut } = getDateInPayrollPeriod();

      await db.collection('staffs').doc('staff-2').set({
        fullName: '鈴木花子',
        hourlyWage: 1200,
      });

      await db.collection('attendances').add({
        staffId: 'staff-2',
        date: dateStr,
        clockIn: Timestamp.fromDate(new Date(clockOut.getFullYear(), clockOut.getMonth(), clockOut.getDate(), 9, 0, 0)),
        clockOut: Timestamp.fromDate(clockOut),
        totalMinutes: 540,
        nightMinutes: 60,
      });

      await monthlyPayrollTrigger();

      const payrollSnap = await db
        .collection('monthlyPayroll')
        .where('staffId', '==', 'staff-2')
        .get();
      expect(payrollSnap.size).toBeGreaterThanOrEqual(1);
      const payroll = payrollSnap.docs[0].data();
      expect(payroll.totalWorkHours).toBe(9); // 540/60
      expect(payroll.nightTimeHours).toBe(1); // 60/60
    });
  });

  describe('論理削除除外', () => {
    it('isDeleted: true の attendance は給与計算対象外', async () => {
      if (!emulatorAvailable) return;

      const { dateStr, clockOut } = getDateInPayrollPeriod();

      await db.collection('staffs').doc('staff-3').set({
        fullName: '高橋一郎',
        hourlyWage: 1000,
      });

      await db.collection('attendances').add({
        staffId: 'staff-3',
        date: dateStr,
        clockIn: Timestamp.fromDate(new Date(clockOut.getFullYear(), clockOut.getMonth(), clockOut.getDate(), 9, 0, 0)),
        clockOut: Timestamp.fromDate(clockOut),
        totalMinutes: 540,
        nightMinutes: 0,
        isDeleted: true,
        deletedAt: Timestamp.now(),
        deletedBy: 'admin',
      });

      await monthlyPayrollTrigger();

      const payrollSnap = await db
        .collection('monthlyPayroll')
        .where('staffId', '==', 'staff-3')
        .get();
      expect(payrollSnap.size).toBeGreaterThanOrEqual(1);
      const payroll = payrollSnap.docs[0].data();
      expect(payroll.totalWorkHours).toBe(0);
      expect(payroll.totalPay).toBe(0);
    });
  });

  describe('attendanceLogs', () => {
    it('payrollReflectedAt 付与時に attendanceLogs に monthly_payroll_reflect を書き込む', async () => {
      if (!emulatorAvailable) return;

      const { dateStr, clockOut } = getDateInPayrollPeriod();
      const clockOutAdj = new Date(clockOut.getFullYear(), clockOut.getMonth(), clockOut.getDate(), 17, 0, 0);

      await db.collection('staffs').doc('staff-4').set({
        fullName: '佐藤次郎',
        hourlyWage: 1100,
      });

      const attRef = await db.collection('attendances').add({
        staffId: 'staff-4',
        date: dateStr,
        clockIn: Timestamp.fromDate(new Date(clockOutAdj.getFullYear(), clockOutAdj.getMonth(), clockOutAdj.getDate(), 9, 0, 0)),
        clockOut: Timestamp.fromDate(clockOutAdj),
        totalMinutes: 480,
        nightMinutes: 0,
      });

      await monthlyPayrollTrigger();

      const logsSnap = await db
        .collection('attendanceLogs')
        .where('attendanceId', '==', attRef.id)
        .where('actionType', '==', 'monthly_payroll_reflect')
        .get();
      expect(logsSnap.size).toBeGreaterThanOrEqual(1);
    });
  });
});
