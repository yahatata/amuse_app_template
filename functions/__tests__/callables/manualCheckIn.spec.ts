/**
 * manualCheckIn: createBillWithActiveStay 成功後の users.lastCheckInAt 更新（Firestore Emulator）
 *
 * createBillWithActiveStay はモックする（Firestore の storeMeta 等を準備しないため）。
 */

jest.mock('../../src/domains/bills/repos/createBillWithActiveStay', () => ({
  createBillWithActiveStay: jest.fn(),
}));

jest.mock('../../src/domains/user/services/okibakeLoginPrompt', () => ({
  collectOkibakeLoginPromptTargets: jest.fn(),
  resolveOkibakeLoginPromptMode: jest.fn(),
  buildOkibakeLoginPromptPayload: jest.fn(),
  buildOkibakeLoginPromptFallback: jest.fn(),
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
  let collectPromptMock: jest.Mock;
  let resolvePromptModeMock: jest.Mock;
  let buildPromptPayloadMock: jest.Mock;
  let buildPromptFallbackMock: jest.Mock;

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
    const promptMod =
      jest.requireMock<typeof import('../../src/domains/user/services/okibakeLoginPrompt')>(
        '../../src/domains/user/services/okibakeLoginPrompt'
      );
    collectPromptMock = promptMod.collectOkibakeLoginPromptTargets as jest.Mock;
    resolvePromptModeMock = promptMod.resolveOkibakeLoginPromptMode as jest.Mock;
    buildPromptPayloadMock = promptMod.buildOkibakeLoginPromptPayload as jest.Mock;
    buildPromptFallbackMock = promptMod.buildOkibakeLoginPromptFallback as jest.Mock;
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
    buildPromptFallbackMock.mockReturnValue({
      mode: 'notice_only',
      count: 0,
      entries: [],
    });
    resolvePromptModeMock.mockReturnValue('link_prompt');
    collectPromptMock.mockResolvedValue([
      {
        tournamentId: 'tour-1',
        okibakeEntryId: 'entry-1',
        entryStatus: 'registered',
        billLinkStatus: 'unlinked',
      },
    ]);
    buildPromptPayloadMock.mockImplementation(({ mode, entries }) => ({
      mode,
      count: entries.length,
      entries,
    }));
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
      userType: 'line',
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
    expect(collectPromptMock).toHaveBeenCalledWith({
      db: expect.anything(),
      linkedUserId: guestUid,
      currentBusinessDate: '2026-01-01',
    });

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
    expect(collectPromptMock).not.toHaveBeenCalled();

    const userSnap = await db.collection('users').doc(guestUid).get();
    expect(userSnap.data()?.lastCheckInAt?.toMillis()).toBe(priorTs.toMillis());
  });

  it('okibakeLoginPrompt を返し、linkedUserId 一致かつ未接続のみ対象になること', async () => {
    const callerUid = 'device-manual-prompt-1';
    const guestUid = 'guest-manual-prompt-1';
    const loginId = 'promptguestMMDD';
    await seedDevice(callerUid);
    await seedUser({
      uid: guestUid,
      loginId,
      pin: '4321',
    });

    await db.collection('storeMeta').doc('config').set({
      okibake: { loginPromptMode: 'link_prompt' },
    });
    await db
      .collection('scheduledTournaments')
      .doc('tour-1')
      .collection('okibakeTemporaryEntries')
      .doc('entry-1')
      .set({
        linkedUserId: guestUid,
        linkedUserPokerName: 'PromptTarget',
        temporaryDisplayName: '置きバケA',
        entryStatus: 'registered',
        billLinkStatus: 'unlinked',
      });
    await db
      .collection('scheduledTournaments')
      .doc('tour-2')
      .collection('okibakeTemporaryEntries')
      .doc('entry-2')
      .set({
        linkedUserId: guestUid,
        linkedUserPokerName: 'ShouldSkip',
        entryStatus: 'voided',
        billLinkStatus: 'unlinked',
      });
    await db
      .collection('scheduledTournaments')
      .doc('tour-3')
      .collection('okibakeTemporaryEntries')
      .doc('entry-3')
      .set({
        linkedUserId: guestUid,
        linkedUserPokerName: 'AlreadyLinked',
        entryStatus: 'registered',
        billLinkStatus: 'linked',
      });

    const mockRequest = {
      data: {
        loginId,
        pin: '4321',
        entranceFee: 0,
      },
      auth: { uid: callerUid },
    };

    const result = await (manualCheckIn as any).run(mockRequest);
    expect(result.success).toBe(true);
    expect(['link_prompt', 'notice_only']).toContain(result.okibakeLoginPrompt?.mode);
    expect(result.okibakeLoginPrompt?.count).toBe(1);
    if (result.okibakeLoginPrompt?.mode === 'link_prompt') {
      expect(result.okibakeLoginPrompt?.entries?.[0]?.okibakeEntryId).toBe('entry-1');
    } else {
      expect(result.okibakeLoginPrompt?.entries ?? []).toHaveLength(0);
    }
  });

  it('okibakeLoginPrompt 取得失敗でも success=true を返すこと', async () => {
    const callerUid = 'device-manual-prompt-fail';
    const guestUid = 'guest-manual-prompt-fail';
    const loginId = 'promptFailMMDD';
    await seedDevice(callerUid);
    await seedUser({
      uid: guestUid,
      loginId,
      pin: '1111',
    });
    collectPromptMock.mockRejectedValueOnce(new Error('prompt fetch failed'));

    const mockRequest = {
      data: {
        loginId,
        pin: '1111',
        entranceFee: 0,
      },
      auth: { uid: callerUid },
    };

    const result = await (manualCheckIn as any).run(mockRequest);
    expect(result.success).toBe(true);
    expect(result.okibakeLoginPrompt).toEqual({
      mode: 'notice_only',
      count: 0,
      entries: [],
    });
  });

  it('isMigrated: true の店舗管理ユーザーは USER_MIGRATED で拒否される', async () => {
    const callerUid = 'device-manual-migrated';
    const guestUid = 'guest-manual-migrated';
    const loginId = 'migratedUserMMDD';
    await seedDevice(callerUid);
    await db.collection('users').doc(guestUid).set({
      uid: guestUid,
      loginId,
      pokerName: 'MigratedPlayer',
      hashedPin: bcrypt.hashSync('1234', 10),
      role: 'user',
      userType: 'store_managed',
      isMigrated: true,
      migratedToUserId: 'line-target-1',
    });

    await expect(
      (manualCheckIn as any).run({
        data: {loginId, pin: '1234', entranceFee: 0},
        auth: {uid: callerUid},
      })
    ).rejects.toMatchObject({
      details: expect.objectContaining({errorKey: 'USER_MIGRATED'}),
    });
    expect(createBillMock).not.toHaveBeenCalled();
  });
});
