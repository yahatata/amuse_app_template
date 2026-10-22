/**
 * L7-A: getStaffAttendance / checkExisting / createAttendanceCorrection 契約テスト
 * Firestore Emulator 使用（未起動時はスキップ）
 */

import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import * as admin from 'firebase-admin';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';

const PROJECT_ID = 'test-project-l7a-attendance-line';
const UID = 'staff-l7a-1';
const OTHER = 'staff-l7a-other';

describe('L7-A attendance LINE contracts', () => {
  let testEnv: any;
  let db: admin.firestore.Firestore;
  let getStaffAttendance: (req: any) => Promise<any>;
  let checkExisting: (req: any) => Promise<any>;
  let createCorrection: (req: any) => Promise<any>;
  let approveCorrection: (req: any) => Promise<any>;
  let rejectCorrection: (req: any) => Promise<any>;
  let emulatorAvailable = true;

  beforeAll(async () => {
    process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || 'localhost:8081';
    testEnv = await initializeTestEnvironment({ projectId: PROJECT_ID });
    if (admin.apps.length > 0) {
      await Promise.all(admin.apps.map((a) => a?.delete()).filter(Boolean));
    }
    admin.initializeApp({ projectId: PROJECT_ID });
    db = getFirestore();

    const getMod = await import('../../src/domains/attendance/callables/getStaffAttendance');
    getStaffAttendance = (req) => getMod.getStaffAttendance.run(req);
    const checkMod = await import('../../src/domains/attendance/callables/checkExistingCorrectionRequest');
    checkExisting = (req) => checkMod.checkExistingCorrectionRequest.run(req);
    const createMod = await import('../../src/domains/attendance/callables/createAttendanceCorrectionRequest');
    createCorrection = (req) => createMod.createAttendanceCorrectionRequest.run(req);
    const approveMod = await import('../../src/domains/attendance/callables/approveAttendanceCorrectionRequest');
    approveCorrection = (req) => approveMod.approveAttendanceCorrectionRequest.run(req);
    const rejectMod = await import('../../src/domains/attendance/callables/rejectAttendanceCorrectionRequest');
    rejectCorrection = (req) => rejectMod.rejectAttendanceCorrectionRequest.run(req);
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
        console.warn('Firestore Emulator 未起動のため L7-A LINE 契約テストをスキップします。');
        return;
      }
      throw e;
    }

    await db.collection('staffs').doc(UID).set({
      fullName: 'テスト太郎',
      fullNameKana: 'テストタロウ',
      status: 'active',
    });
    await db.collection('staffs').doc(OTHER).set({
      fullName: '他スタッフ',
      status: 'active',
    });
  });

  const authReq = (data: Record<string, unknown> = {}, uid = UID) => ({
    auth: { uid },
    data,
  });

  function expectErrorKey(err: unknown, key: string) {
    expect(err).toBeInstanceOf(HttpsError);
    expect((err as HttpsError).details).toEqual(expect.objectContaining({ errorKey: key }));
  }

  describe('getStaffAttendance', () => {
    it('unauthenticated', async () => {
      if (!emulatorAvailable) return;
      try {
        await getStaffAttendance({ auth: null, data: { year: 2026, month: 3 } });
        fail('expected throw');
      } catch (e) {
        expectErrorKey(e, 'ATTENDANCE_UNAUTHENTICATED');
      }
    });

    it('rejects client staffId', async () => {
      if (!emulatorAvailable) return;
      try {
        await getStaffAttendance(authReq({ year: 2026, month: 3, staffId: OTHER }));
        fail('expected throw');
      } catch (e) {
        expectErrorKey(e, 'ATTENDANCE_INVALID_ARGUMENT');
      }
    });

    it('rejects uid/userId', async () => {
      if (!emulatorAvailable) return;
      for (const extra of [{ uid: OTHER }, { userId: OTHER }]) {
        try {
          await getStaffAttendance(authReq({ year: 2026, month: 3, ...extra }));
          fail('expected throw');
        } catch (e) {
          expectErrorKey(e, 'ATTENDANCE_INVALID_ARGUMENT');
        }
      }
    });

    it('invalid month', async () => {
      if (!emulatorAvailable) return;
      try {
        await getStaffAttendance(authReq({ year: 2026, month: 13 }));
        fail('expected throw');
      } catch (e) {
        expectErrorKey(e, 'ATTENDANCE_INVALID_ARGUMENT');
      }
    });

    it('retired staff', async () => {
      if (!emulatorAvailable) return;
      await db.collection('staffs').doc(UID).set({ fullName: '退職', status: 'retired' });
      try {
        await getStaffAttendance(authReq({ year: 2026, month: 3 }));
        fail('expected throw');
      } catch (e) {
        expectErrorKey(e, 'STAFF_RETIRED');
      }
    });

    it('normal empty', async () => {
      if (!emulatorAvailable) return;
      const res = await getStaffAttendance(authReq({ year: 2026, month: 3 }));
      expect(res).toEqual({
        success: true,
        data: { year: 2026, month: 3, attendances: [], count: 0 },
      });
    });

    it('returns own businessDate attendances only', async () => {
      if (!emulatorAvailable) return;
      await db.collection('attendances').doc('a1').set({
        staffId: UID,
        date: '2026-03-15',
        clockIn: Timestamp.fromDate(new Date('2026-03-15T10:00:00+09:00')),
        clockOut: Timestamp.fromDate(new Date('2026-03-15T18:00:00+09:00')),
        breakMinutes: 60,
        actualWorkMinutes: 420,
        isOnBreak: false,
        isManual: false,
        closedStoreWithoutClockOut: false,
      });
      await db.collection('attendances').doc('a-other').set({
        staffId: OTHER,
        date: '2026-03-15',
        clockIn: Timestamp.now(),
        clockOut: null,
      });
      await db.collection('attendances').doc('a-deleted').set({
        staffId: UID,
        date: '2026-03-16',
        clockIn: Timestamp.now(),
        isDeleted: true,
      });

      const res = await getStaffAttendance(authReq({ year: 2026, month: 3 }));
      expect(res.success).toBe(true);
      expect(res.data.count).toBe(1);
      expect(res.data.attendances[0].attendanceId).toBe('a1');
      expect(res.data.attendances[0].date).toBe('2026-03-15');
      expect(res.data.attendances[0].staffId).toBeUndefined();
    });

    it('month boundary uses YYYY-MM-DD string range', async () => {
      if (!emulatorAvailable) return;
      await db.collection('attendances').doc('feb').set({
        staffId: UID,
        date: '2026-02-28',
        clockIn: Timestamp.now(),
      });
      await db.collection('attendances').doc('mar').set({
        staffId: UID,
        date: '2026-03-01',
        clockIn: Timestamp.now(),
      });
      const res = await getStaffAttendance(authReq({ year: 2026, month: 3 }));
      expect(res.data.count).toBe(1);
      expect(res.data.attendances[0].date).toBe('2026-03-01');
    });
  });

  describe('checkExistingCorrectionRequest', () => {
    it('rejects staffId', async () => {
      if (!emulatorAvailable) return;
      try {
        await checkExisting(authReq({ date: '2026-03-10', staffId: OTHER }));
        fail('expected throw');
      } catch (e) {
        expectErrorKey(e, 'ATTENDANCE_INVALID_ARGUMENT');
      }
    });

    it('no request', async () => {
      if (!emulatorAvailable) return;
      const res = await checkExisting(authReq({ date: '2026-03-10' }));
      expect(res).toEqual({
        success: true,
        data: { exists: false, date: '2026-03-10', status: null, requestId: null },
      });
    });

    it('pending/approved/rejected', async () => {
      if (!emulatorAvailable) return;
      for (const status of ['pending', 'approved', 'rejected'] as const) {
        await testEnv.clearFirestore();
        await db.collection('staffs').doc(UID).set({ fullName: 'テスト太郎', status: 'active' });
        await db.collection('attendanceCorrectionRequests').doc(`r-${status}`).set({
          staffId: UID,
          date: '2026-03-11',
          status,
        });
        const res = await checkExisting(authReq({ date: '2026-03-11' }));
        expect(res.data.exists).toBe(true);
        expect(res.data.status).toBe(status);
        expect(res.data.canReapply).toBeUndefined();
      }
    });
  });

  describe('createAttendanceCorrectionRequest', () => {
    const basePayload = {
      clientNonce: 'nonce-l7a-001',
      date: '2026-03-20',
      type: 'clockIn',
      newClockIn: '18:00',
      reason: '打刻忘れ',
    };

    it('rejects client staffId/staffName/status', async () => {
      if (!emulatorAvailable) return;
      for (const extra of [
        { staffId: OTHER },
        { staffName: '偽' },
        { status: 'approved' },
        { createdAt: new Date().toISOString() },
      ]) {
        try {
          await createCorrection(authReq({ ...basePayload, clientNonce: `n-${JSON.stringify(extra)}`, ...extra }));
          fail('expected throw');
        } catch (e) {
          expectErrorKey(e, 'ATTENDANCE_INVALID_ARGUMENT');
        }
      }
    });

    it('nonce required', async () => {
      if (!emulatorAvailable) return;
      try {
        await createCorrection(authReq({ ...basePayload, clientNonce: undefined }));
        fail('expected throw');
      } catch (e) {
        expectErrorKey(e, 'ATTENDANCE_CORRECTION_NONCE_REQUIRED');
      }
    });

    it('first success without attendance', async () => {
      if (!emulatorAvailable) return;
      const res = await createCorrection(authReq(basePayload));
      expect(res.success).toBe(true);
      expect(res.data.reused).toBe(false);
      expect(res.data.status).toBe('pending');
      expect(res.data.requestId).toBe(`${UID}_2026-03-20`);

      const doc = await db.collection('attendanceCorrectionRequests').doc(res.data.requestId).get();
      expect(doc.exists).toBe(true);
      expect(doc.data()?.staffId).toBe(UID);
      expect(doc.data()?.staffName).toBe('テスト太郎');
      expect(doc.data()?.status).toBe('pending');
    });

    it('same nonce same payload → reused, write 0', async () => {
      if (!emulatorAvailable) return;
      const first = await createCorrection(authReq(basePayload));
      const second = await createCorrection(authReq(basePayload));
      expect(second.data.reused).toBe(true);
      expect(second.data.requestId).toBe(first.data.requestId);
      const snap = await db
        .collection('attendanceCorrectionRequests')
        .where('staffId', '==', UID)
        .where('date', '==', '2026-03-20')
        .get();
      expect(snap.size).toBe(1);
    });

    it('same nonce different reason → conflict', async () => {
      if (!emulatorAvailable) return;
      await createCorrection(authReq(basePayload));
      try {
        await createCorrection(authReq({ ...basePayload, reason: '別理由' }));
        fail('expected throw');
      } catch (e) {
        expectErrorKey(e, 'ATTENDANCE_CORRECTION_NONCE_CONFLICT');
      }
    });

    it('pending/approved/rejected all block second request', async () => {
      if (!emulatorAvailable) return;
      for (const status of ['pending', 'approved', 'rejected'] as const) {
        await testEnv.clearFirestore();
        await db.collection('staffs').doc(UID).set({ fullName: 'テスト太郎', status: 'active' });
        await db.collection('attendanceCorrectionRequests').doc(`legacy-${status}`).set({
          staffId: UID,
          date: '2026-04-01',
          status,
          type: 'other',
          reason: '旧',
        });
        try {
          await createCorrection(
            authReq({
              clientNonce: `nonce-${status}`,
              date: '2026-04-01',
              type: 'other',
              reason: '再申請',
            }),
          );
          fail(`expected reject for ${status}`);
        } catch (e) {
          expectErrorKey(e, 'ATTENDANCE_CORRECTION_ALREADY_EXISTS');
        }
      }
    });

    it('different date allowed', async () => {
      if (!emulatorAvailable) return;
      await createCorrection(authReq(basePayload));
      const res = await createCorrection(
        authReq({
          ...basePayload,
          clientNonce: 'nonce-other-day',
          date: '2026-03-21',
        }),
      );
      expect(res.data.reused).toBe(false);
      expect(res.data.date).toBe('2026-03-21');
    });

    it('approve pending new shape', async () => {
      if (!emulatorAvailable) return;
      await db.collection('attendances').doc('att-corr').set({
        staffId: UID,
        date: '2026-03-22',
        clockIn: Timestamp.fromDate(new Date('2026-03-22T10:00:00+09:00')),
        clockOut: null,
      });
      const created = await createCorrection(
        authReq({
          clientNonce: 'nonce-approve',
          date: '2026-03-22',
          type: 'clockIn',
          newClockIn: '09:30',
          reason: '早出',
        }),
      );
      const approved = await approveCorrection({
        auth: { uid: 'admin-1' },
        data: { requestId: created.data.requestId, adminUserId: 'admin-1' },
      });
      expect(approved.success).toBe(true);
      const reqDoc = await db.collection('attendanceCorrectionRequests').doc(created.data.requestId).get();
      expect(reqDoc.data()?.status).toBe('approved');
    });

    it('reject pending new shape', async () => {
      if (!emulatorAvailable) return;
      const created = await createCorrection(
        authReq({
          clientNonce: 'nonce-reject',
          date: '2026-03-23',
          type: 'other',
          reason: '確認依頼',
        }),
      );
      const rejected = await rejectCorrection({
        auth: { uid: 'admin-1' },
        data: {
          requestId: created.data.requestId,
          adminUserId: 'admin-1',
          rejectionReason: '証拠不足',
        },
      });
      expect(rejected.success).toBe(true);
      const reqDoc = await db.collection('attendanceCorrectionRequests').doc(created.data.requestId).get();
      expect(reqDoc.data()?.status).toBe('rejected');
    });

    it('does not return raw error soft-fail', async () => {
      if (!emulatorAvailable) return;
      try {
        await createCorrection(authReq({ ...basePayload, type: 'invalid' }));
        fail('expected throw');
      } catch (e) {
        expect(e).toBeInstanceOf(HttpsError);
        expect((e as HttpsError).message).not.toMatch(/stack|firestore/i);
        expectErrorKey(e, 'ATTENDANCE_INVALID_ARGUMENT');
      }
    });
  });
});
