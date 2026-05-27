/**
 * manualCheckIn: createBillWithActiveStay 成功後の users.lastCheckInAt 更新（Firestore Emulator）
 *
 * createBillWithActiveStay はモックする（Firestore の storeMeta 等を準備しないため）。
 */

jest.mock('../../src/domains/bills/repos/createBillWithActiveStay', () => ({
  createBillWithActiveStay: jest.fn(),
}));

import { initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import * as bcrypt from 'bcryptjs';
import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';

describe('manualCheckIn lastCheckInAt', () => {
  let testEnv: RulesTestEnvironment;
  let db: admin.firestore.Firestore;
  let manualCheckIn: typeof import('../../src/domains/user/callables/manualCheckIn').manualCheckIn;

  let createBillMock: jest.Mock;

  /** firebase.json の emulators と揃える（rules-unit-testing の clearFirestore と競合しないようにする） */
  const projectId = 'amuse-app-template';

  beforeAll(async () => {
    process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8081';
    testEnv = await initializeTestEnvironment({ projectId });

    if (admin.apps.length > 0) {
      await Promise.all(admin.apps.map((a) => a?.delete()).filter(Boolean));
    }
    admin.initializeApp({ projectId });
    db = getFirestore();

    // setupFirebase と mockStore の requireActual が走った後でも、明示的初期化済みのアプリが使われるようにするため
    // manualCheckIn は Firebase 準備済みのあと動的にロードする
    ({ manualCheckIn } = await import('../../src/domains/user/callables/manualCheckIn'));

    const billsMod =
      jest.requireMock<typeof import('../../src/domains/bills/repos/createBillWithActiveStay')>(
        '../../src/domains/bills/repos/createBillWithActiveStay'
      );
    createBillMock = billsMod.createBillWithActiveStay as jest.Mock;
  });

  afterAll(async () => {
    await testEnv.cleanup();
    await Promise.all(admin.apps.map((a) => a?.delete()).filter(Boolean));
    delete process.env.FIRESTORE_EMULATOR_HOST;
  });

  beforeEach(async () => {
    await testEnv.clearFirestore();

    jest.clearAllMocks();
    createBillMock.mockResolvedValue({
      success: true,
      billId: 'bill-manual-001',
      status: 'open',
      businessDate: '2026-01-01',
      activeStayCreated: true,
    });
  });

  async function seedDevice(callerUid: string) {
    await db.collection('devices').add({
      uid: callerUid,
      role: 'admin',
      status: 'active',
      name: 'Terminal manualCheckIn test',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }

  async function seedUser(params: {
    uid: string;
    loginId: string;
    pin: string;
    lastCheckInAt?: admin.firestore.Timestamp;
  }) {
    const { uid, loginId, pin, lastCheckInAt } = params;
    await db.collection('users').doc(uid).set({
      uid,
      loginId,
      pokerName: 'TestPlayer',
      hashedPin: bcrypt.hashSync(pin, 10),
      role: 'user',
      ...(lastCheckInAt !== undefined ? { lastCheckInAt } : {}),
    });
  }

  it('createBillWithActiveStay 成功後に users.lastCheckInAt がセットされること', async () => {
    const callerUid = 'device-manual-ok-1';
    const guestUid = 'guest-manual-ok-1';
    const loginId = 'guestloginMMDD';
    await seedDevice(callerUid);
    await seedUser({
      uid: guestUid,
      loginId,
      pin: '1234',
    });

    const mockRequest = {
      data: {
        loginId,
        pin: '1234',
        entranceFee: 0,
        entranceFeeDescription: 'テスト',
        chargeEntranceFeeOnReentry: false,
      },
      auth: { uid: callerUid },
    };

    const result = await (manualCheckIn as any).run(mockRequest);
    expect(result.success).toBe(true);
    expect(createBillMock).toHaveBeenCalledTimes(1);

    const userSnap = await db.collection('users').doc(guestUid).get();
    const last = userSnap.data()?.lastCheckInAt as admin.firestore.Timestamp | undefined;
    expect(last).toBeDefined();
    expect(Number.isFinite(last!.toMillis())).toBe(true);

    expect((await db.collection('activeStays').doc(guestUid).get()).exists).toBe(false);
  });

  it('createBillWithActiveStay が成功しなかった場合は users.lastCheckInAt を変更しないこと', async () => {
    const callerUid = 'device-manual-fail-1';
    const guestUid = 'guest-manual-fail-1';
    const loginId = 'failguestMMDD';

    createBillMock.mockResolvedValueOnce({
      success: false,
      billId: '',
      status: 'open',
      businessDate: '',
      activeStayCreated: false,
    });

    const priorTs = admin.firestore.Timestamp.fromDate(new Date('2020-06-01T12:00:00.000Z'));
    await seedDevice(callerUid);
    await seedUser({
      uid: guestUid,
      loginId,
      pin: '9999',
      lastCheckInAt: priorTs,
    });

    const mockRequest = {
      data: {
        loginId,
        pin: '9999',
        entranceFee: 0,
      },
      auth: { uid: callerUid },
    };

    const result = await (manualCheckIn as any).run(mockRequest);
    expect(result.success).toBe(false);

    const userSnap = await db.collection('users').doc(guestUid).get();
    expect(userSnap.data()?.lastCheckInAt?.toMillis()).toBe(priorTs.toMillis());
  });
});
