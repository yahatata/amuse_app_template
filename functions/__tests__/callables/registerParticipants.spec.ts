import { initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { registerParticipants } from '../../src/domains/tournament_activeTournament/callables/registerParticipants';
import { createBillWithActiveStay } from '../../src/domains/bills/repos/createBillWithActiveStay';

jest.mock('../../src/shared/devices', () => ({
  getCallerDeviceByUid: jest.fn(async () => ({
    id: 'device-test-operator',
    role: 'admin',
    name: 'test-operator',
    status: 'active',
    options: { tournament: true },
  })),
  hasRequiredOption: jest.fn(() => true),
  isActive: jest.fn(() => true),
}));

describe('registerParticipants (Phase6 conflict guard)', () => {
  let testEnv: RulesTestEnvironment;
  let db: admin.firestore.Firestore;
  const projectId = 'test-project-register-participants-phase6';

  beforeAll(async () => {
    process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8081';
    testEnv = await initializeTestEnvironment({ projectId });

    if (admin.apps.length > 0) {
      await Promise.all(admin.apps.map((a) => a?.delete()).filter(Boolean));
    }
    admin.initializeApp({ projectId });
    db = getFirestore();
  });

  afterAll(async () => {
    await testEnv.cleanup();
    await Promise.all(admin.apps.map((a) => a?.delete()).filter(Boolean));
    delete process.env.FIRESTORE_EMULATOR_HOST;
  });

  beforeEach(async () => {
    await testEnv.clearFirestore();
  });

  async function setupTournament(tournamentId: string, templateId: string) {
    await db.collection('scheduledTournaments').doc(tournamentId).set({
      templateId,
      status: 'scheduled',
      startAt: admin.firestore.Timestamp.fromDate(new Date('2025-11-20T10:00:00Z')),
      snapshot: {
        name: '一括登録テスト',
        entryFee: 1000,
        reentryFee: 500,
        addonFee: 300,
      },
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    await db
      .collection('scheduledTournaments')
      .doc(tournamentId)
      .collection('views')
      .doc('main')
      .set({
        playersIn: 0,
        entries: 0,
        reentries: 0,
        waitingCount: 0,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

    await db
      .collection('scheduledTournaments')
      .doc(tournamentId)
      .collection('views')
      .doc('usersList')
      .set({
        users: {},
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

    await db
      .collection('scheduledTournaments')
      .doc(tournamentId)
      .collection('tablesSeat')
      .doc('waiting')
      .set({
        waiting: {},
        count: 0,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

    await db
      .collection('scheduledTournaments')
      .doc(tournamentId)
      .collection('tablesSeat')
      .doc('busted')
      .set({
        bustedUser: {},
      });
  }


  it('okibake linkedUserId 衝突ユーザーのみ failure、他ユーザーは成功する', async () => {
    const tournamentId = 'phase6-participants-001';
    const templateId = 'template-phase6-participants-001';
    const conflictUserId = 'user-phase6-conflict-001';
    const okUserId = 'user-phase6-ok-001';

    await setupTournament(tournamentId, templateId);

    await createBillWithActiveStay({
      billId: 'bill-phase6-conflict-001',
      userId: conflictUserId,
      pokerName: '衝突ユーザー',
      idempotencyKey: 'idem-phase6-conflict-001',
    });
    await createBillWithActiveStay({
      billId: 'bill-phase6-ok-001',
      userId: okUserId,
      pokerName: '通常ユーザー',
      idempotencyKey: 'idem-phase6-ok-001',
    });

    await db
      .collection('scheduledTournaments')
      .doc(tournamentId)
      .collection('okibakeTemporaryEntries')
      .doc('okibake-conflict-1')
      .set({
        linkedUserId: conflictUserId,
        linkedUserPokerName: '衝突ユーザー',
        entryStatus: 'registered',
        billLinkStatus: 'pending_review',
      });

    const request = {
      data: {
        tournamentId,
        userIds: [conflictUserId, okUserId],
      },
      auth: { uid: 'device-operator' },
    } as any;

    const result = await (registerParticipants as any).run(request);
    expect(result.success).toBe(true);
    expect(result.summary.success).toBe(1);
    expect(result.summary.failure).toBe(1);

    const failed = (result.results as Array<any>).find((r) => r.userId === conflictUserId);
    expect(failed.success).toBe(false);

    const waitingDoc = await db
      .collection('scheduledTournaments')
      .doc(tournamentId)
      .collection('tablesSeat')
      .doc('waiting')
      .get();
    const waitingData = waitingDoc.data()!;
    expect(waitingData.waiting[conflictUserId]).toBeUndefined();
    expect(waitingData.waiting[okUserId]).toBeDefined();
  });

  it('usersList既存のユーザーは reentry 扱いを維持する', async () => {
    const tournamentId = 'phase6-participants-002';
    const templateId = 'template-phase6-participants-002';
    const userId = 'user-phase6-reentry-001';

    await setupTournament(tournamentId, templateId);

    await createBillWithActiveStay({
      billId: 'bill-phase6-reentry-001',
      userId,
      pokerName: 'リエントリー対象',
      idempotencyKey: 'idem-phase6-reentry-001',
    });

    await db
      .collection('scheduledTournaments')
      .doc(tournamentId)
      .collection('views')
      .doc('usersList')
      .set({
        users: {
          [userId]: {
            pokerName: 'リエントリー対象',
            registeredAt: admin.firestore.FieldValue.serverTimestamp(),
          },
        },
      }, { merge: true });

    const request = {
      data: {
        tournamentId,
        userIds: [userId],
      },
      auth: { uid: 'device-operator' },
    } as any;

    const result = await (registerParticipants as any).run(request);
    expect(result.success).toBe(true);
    expect(result.summary.success).toBe(1);

    const viewsMainDoc = await db
      .collection('scheduledTournaments')
      .doc(tournamentId)
      .collection('views')
      .doc('main')
      .get();
    const viewsMainData = viewsMainDoc.data()!;
    expect(viewsMainData.entries).toBe(0);
    expect(viewsMainData.reentries).toBe(1);
  });

  it('entryStatus == voided の置きバケは衝突判定から除外される', async () => {
    const tournamentId = 'phase6-participants-003';
    const templateId = 'template-phase6-participants-003';
    const userId = 'user-phase6-voided-001';

    await setupTournament(tournamentId, templateId);

    await createBillWithActiveStay({
      billId: 'bill-phase6-voided-001',
      userId,
      pokerName: 'Voided許可',
      idempotencyKey: 'idem-phase6-voided-001',
    });

    await db
      .collection('scheduledTournaments')
      .doc(tournamentId)
      .collection('okibakeTemporaryEntries')
      .doc('okibake-voided-1')
      .set({
        linkedUserId: userId,
        linkedUserPokerName: 'Voided許可',
        entryStatus: 'voided',
        billLinkStatus: 'linked',
      });

    const request = {
      data: {
        tournamentId,
        userIds: [userId],
      },
      auth: { uid: 'device-operator' },
    } as any;

    const result = await (registerParticipants as any).run(request);
    expect(result.success).toBe(true);
    expect(result.summary.success).toBe(1);
    expect(result.summary.failure).toBe(0);
  });
});
