jest.mock('../../src/domains/bills/repos/createBillWithActiveStay', () => ({
  createBillWithActiveStay: jest.fn(),
}));

jest.mock('../../src/domains/user/services/qrCodeUtils', () => ({
  verifyQRData: jest.fn(),
  parseQRData: jest.fn(),
}));

jest.mock('../../src/domains/user/services/okibakeLoginPrompt', () => ({
  collectOkibakeLoginPromptTargets: jest.fn(),
  resolveOkibakeLoginPromptMode: jest.fn(),
  buildOkibakeLoginPromptPayload: jest.fn(),
  buildOkibakeLoginPromptFallback: jest.fn(),
}));

import { initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';

describe('processVisitByQR okibakeLoginPrompt', () => {
  let testEnv: RulesTestEnvironment;
  let db: admin.firestore.Firestore;
  let processVisitByQR: typeof import('../../src/domains/user/callables/processVisitByQR').processVisitByQR;
  let createBillMock: jest.Mock;
  let verifyQRDataMock: jest.Mock;
  let parseQRDataMock: jest.Mock;
  let collectPromptMock: jest.Mock;
  let resolvePromptModeMock: jest.Mock;
  let buildPromptPayloadMock: jest.Mock;
  let buildPromptFallbackMock: jest.Mock;

  const projectId = 'amuse-app-template';

  beforeAll(async () => {
    process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8081';
    testEnv = await initializeTestEnvironment({ projectId });

    if (admin.apps.length > 0) {
      await Promise.all(admin.apps.map((a) => a?.delete()).filter(Boolean));
    }
    admin.initializeApp({ projectId });
    db = getFirestore();

    ({ processVisitByQR } = await import('../../src/domains/user/callables/processVisitByQR'));
    const billsMod =
      jest.requireMock<typeof import('../../src/domains/bills/repos/createBillWithActiveStay')>(
        '../../src/domains/bills/repos/createBillWithActiveStay'
      );
    createBillMock = billsMod.createBillWithActiveStay as jest.Mock;
    const qrMod =
      jest.requireMock<typeof import('../../src/domains/user/services/qrCodeUtils')>(
        '../../src/domains/user/services/qrCodeUtils'
      );
    verifyQRDataMock = qrMod.verifyQRData as jest.Mock;
    parseQRDataMock = qrMod.parseQRData as jest.Mock;
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
      billId: 'bill-qr-001',
      status: 'open',
      businessDate: '2026-01-01',
      activeStayCreated: true,
    });
    verifyQRDataMock.mockResolvedValue(true);
    parseQRDataMock.mockReturnValue({
      type: 'user',
      uid: 'guest-qr-1',
      loginId: 'qr-user',
    });
    buildPromptFallbackMock.mockReturnValue({
      mode: 'notice_only',
      count: 0,
      entries: [],
    });
    resolvePromptModeMock.mockReturnValue('notice_only');
    collectPromptMock.mockResolvedValue([
      {
        tournamentId: 'tour-qr-1',
        okibakeEntryId: 'entry-qr-1',
        entryStatus: 'registered',
        billLinkStatus: 'pending_review',
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
      name: 'Terminal processVisitByQR test',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }

  it('loginPromptMode=notice_only のとき okibakeLoginPrompt を返す', async () => {
    const callerUid = 'device-qr-1';
    await seedDevice(callerUid);
    await db.collection('users').doc('guest-qr-1').set({
      uid: 'guest-qr-1',
      loginId: 'qr-user',
      pokerName: 'QR User',
      role: 'user',
      userType: 'line',
    });
    await db.collection('storeMeta').doc('config').set({
      okibake: { loginPromptMode: 'notice_only' },
    });
    await db
      .collection('scheduledTournaments')
      .doc('tour-qr-1')
      .collection('okibakeTemporaryEntries')
      .doc('entry-qr-1')
      .set({
        linkedUserId: 'guest-qr-1',
        entryStatus: 'registered',
        billLinkStatus: 'pending_review',
      });

    const res = await (processVisitByQR as any).run({
      auth: { uid: callerUid },
      data: { qrData: '{"dummy":true}' },
    });

    expect(res.success).toBe(true);
    expect(res.okibakeLoginPrompt?.mode).toBe('notice_only');
    expect(res.okibakeLoginPrompt?.count).toBe(1);
    expect(collectPromptMock).toHaveBeenCalledWith({
      db: expect.anything(),
      linkedUserId: 'guest-qr-1',
      currentBusinessDate: '2026-01-01',
    });
  });

  it('okibakeLoginPrompt 取得失敗でも success=true を返す', async () => {
    const callerUid = 'device-qr-fallback';
    await seedDevice(callerUid);
    await db.collection('users').doc('guest-qr-1').set({
      uid: 'guest-qr-1',
      loginId: 'qr-user',
      pokerName: 'QR User',
      role: 'user',
      userType: 'line',
    });
    collectPromptMock.mockRejectedValueOnce(new Error('prompt fetch failed'));

    const res = await (processVisitByQR as any).run({
      auth: { uid: callerUid },
      data: { qrData: '{"dummy":true}' },
    });
    expect(res.success).toBe(true);
    expect(res.okibakeLoginPrompt).toEqual({
      mode: 'notice_only',
      count: 0,
      entries: [],
    });
  });

  it('isMigrated: true の店舗管理ユーザーは USER_MIGRATED で拒否される', async () => {
    const callerUid = 'device-qr-migrated';
    await seedDevice(callerUid);
    await db.collection('users').doc('guest-qr-migrated').set({
      uid: 'guest-qr-migrated',
      loginId: 'qr-migrated',
      pokerName: 'Migrated QR',
      role: 'user',
      userType: 'store_managed',
      isMigrated: true,
      migratedToUserId: 'line-1',
    });
    parseQRDataMock.mockReturnValue({
      type: 'user',
      uid: 'guest-qr-migrated',
      loginId: 'qr-migrated',
    });

    await expect(
      (processVisitByQR as any).run({
        auth: {uid: callerUid},
        data: {qrData: '{"dummy":true}'},
      })
    ).rejects.toMatchObject({
      details: expect.objectContaining({errorKey: 'USER_MIGRATED'}),
    });
    expect(createBillMock).not.toHaveBeenCalled();
  });
});
