import { initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';

describe('resolveOkibakePendingReviewWithRemotePayment', () => {
  let testEnv: RulesTestEnvironment;
  let db: admin.firestore.Firestore;
  let callable: { run: (req: unknown) => Promise<Record<string, unknown>> };
  const projectId = 'test-okibake-phase5-remote-payment';

  beforeAll(async () => {
    process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8081';
    testEnv = await initializeTestEnvironment({ projectId });
    if (admin.apps.length > 0) {
      await Promise.all(admin.apps.map((a) => a?.delete()).filter(Boolean));
    }
    admin.initializeApp({ projectId });
    db = getFirestore();
    const mod = await import(
      '../../src/domains/tournament_activeTournament/callables/resolveOkibakePendingReviewWithRemotePayment'
    );
    callable = mod.resolveOkibakePendingReviewWithRemotePayment as {
      run: (req: unknown) => Promise<Record<string, unknown>>;
    };
  });

  afterAll(async () => {
    await testEnv.cleanup();
    await Promise.all(admin.apps.map((a) => a?.delete()).filter(Boolean));
    delete process.env.FIRESTORE_EMULATOR_HOST;
  });

  beforeEach(async () => {
    await testEnv.clearFirestore();
  });

  async function seedBase({
    uid,
    tournamentId,
    entryId,
    linkedUserId,
    linkedUserPokerName,
    businessDate = '2026-05-29',
    entryStatus = 'registered',
    billLinkStatus = 'pending_review',
    addonCount = 2,
  }: {
    uid: string;
    tournamentId: string;
    entryId: string;
    linkedUserId: string;
    linkedUserPokerName: string;
    businessDate?: string;
    entryStatus?: string;
    billLinkStatus?: string;
    addonCount?: number;
  }) {
    await db.collection('devices').doc('device-1').set({
      uid,
      role: 'admin',
      status: 'active',
      name: 'Terminal Test',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    await db.collection('storeMeta').doc('currentBusinessDay').set({
      status: 'running',
      currentBusinessDateKey: businessDate,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    await db.collection('scheduledTournaments').doc(tournamentId).set({
      templateId: 'template-a',
      snapshot: {
        name: 'トーナメントA',
        entryFee: 2000,
        addonFee: 1000,
      },
      status: 'ended',
      businessDate,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    await db
      .collection('scheduledTournaments')
      .doc(tournamentId)
      .collection('okibakeTemporaryEntries')
      .doc(entryId)
      .set({
        tournamentId,
        entryStatus,
        billLinkStatus,
        linkedUserId,
        linkedUserPokerName,
        temporaryDisplayName: 'オキバケA',
        okibakeAddonCount: addonCount,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
  }

  it('pending_review を来店なし入金で解決し、open→settled・linked化・メタ保存を満たす', async () => {
    const uid = 'admin-uid-1';
    const tournamentId = 't-remote-1';
    const entryId = 'e-remote-1';
    await seedBase({
      uid,
      tournamentId,
      entryId,
      linkedUserId: 'user-remote-1',
      linkedUserPokerName: 'ユーザー1',
      entryStatus: 'busted',
      addonCount: 3,
    });

    const opId = 'op-remote-1';
    const res = await callable.run({
      auth: { uid },
      data: {
        tournamentId,
        okibakeEntryId: entryId,
        operationId: opId,
        amountIncl: 5000,
        paymentMethod: 'cash',
        memo: '店舗外入金',
      },
    } as any);

    expect(res.success).toBe(true);
    expect(typeof res.billId).toBe('string');
    const billId = String(res.billId);

    const billSnap = await db.collection('bills').doc(billId).get();
    expect(billSnap.exists).toBe(true);
    const bill = billSnap.data()!;
    expect(bill.status).toBe('settled');
    expect(bill.billType).toBe('okibake_remote_payment');
    expect(bill.party.userId).toBe('user-remote-1');
    expect(bill.party.pokerName).toBe('ユーザー1');
    expect(bill.meta?.paymentMethodsByAmount).toEqual({ cash: 5000 });
    expect(bill.remotePayment?.amountIncl).toBe(5000);
    expect(bill.remotePayment?.method).toBe('cash');

    const tournamentBillSnap = await db
      .collection('bills')
      .doc(billId)
      .collection('tournaments')
      .doc('template-a')
      .get();
    expect(tournamentBillSnap.exists).toBe(true);
    expect(tournamentBillSnap.data()!.entryCount).toBe(1);
    expect(tournamentBillSnap.data()!.entryFeeIncl).toBe(2000);
    expect(tournamentBillSnap.data()!.addonCount).toBe(3);
    expect(tournamentBillSnap.data()!.addonFeeIncl).toBe(1000);

    const paymentSub = await db.collection('bills').doc(billId).collection('payments').get();
    expect(paymentSub.empty).toBe(true);

    const activeStaysSnap = await db.collection('activeStays').get();
    expect(activeStaysSnap.empty).toBe(true);

    const entrySnap = await db
      .collection('scheduledTournaments')
      .doc(tournamentId)
      .collection('okibakeTemporaryEntries')
      .doc(entryId)
      .get();
    expect(entrySnap.data()!.billLinkStatus).toBe('linked');
    expect(entrySnap.data()!.linkedBillId).toBe(billId);
    expect(entrySnap.data()!.entryStatus).toBe('busted');

    const cycleSnap = await db
      .collection('bills')
      .doc(billId)
      .collection('settlementCycles')
      .doc('1')
      .get();
    expect(cycleSnap.exists).toBe(true);
  });

  it('同一 operationId は replay を返し、bill を二重作成しない', async () => {
    const uid = 'admin-uid-2';
    const tournamentId = 't-remote-2';
    const entryId = 'e-remote-2';
    await seedBase({
      uid,
      tournamentId,
      entryId,
      linkedUserId: 'user-remote-2',
      linkedUserPokerName: 'ユーザー2',
    });

    const operationId = 'op-remote-replay';
    const data = {
      tournamentId,
      okibakeEntryId: entryId,
      operationId,
      amountIncl: 2000,
      paymentMethod: 'electronic_money',
    };
    const first = await callable.run({ auth: { uid }, data } as any);
    const second = await callable.run({ auth: { uid }, data } as any);

    expect(first.success).toBe(true);
    expect(second.success).toBe(true);
    expect(second.replay).toBe(true);
    expect(second.billId).toBe(first.billId);

    const bills = await db
      .collection('bills')
      .where('sourceOkibakeEntryId', '==', entryId)
      .get();
    expect(bills.size).toBe(1);
  });

  it('同一 operationId の payload mismatch は拒否する', async () => {
    const uid = 'admin-uid-3';
    const tournamentId = 't-remote-3';
    const entryId = 'e-remote-3';
    await seedBase({
      uid,
      tournamentId,
      entryId,
      linkedUserId: 'user-remote-3',
      linkedUserPokerName: 'ユーザー3',
    });

    const operationId = 'op-remote-mismatch';
    await callable.run({
      auth: { uid },
      data: {
        tournamentId,
        okibakeEntryId: entryId,
        operationId,
        amountIncl: 2000,
        paymentMethod: 'cash',
      },
    } as any);

    await expect(
      callable.run({
        auth: { uid },
        data: {
          tournamentId,
          okibakeEntryId: entryId,
          operationId,
          amountIncl: 3000,
          paymentMethod: 'cash',
        },
      } as any)
    ).rejects.toMatchObject({ code: 'failed-precondition' });
  });
});
