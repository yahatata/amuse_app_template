import { initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { billsOnSettle } from '../../src/domains/bills/triggers/billsOnSettle';

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
    entryFee = 2000,
    addonFee = 1000,
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
    entryFee?: number;
    addonFee?: number;
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
        entryFee,
        addonFee,
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

  /** Emulator では trigger が自動発火しないため、callable 後に billsOnSettle を手動実行する */
  async function runBillsOnSettleForSettledBill(billId: string) {
    const billRef = db.collection('bills').doc(billId);
    const afterDoc = await billRef.get();
    const afterData = afterDoc.data()!;
    const mockEvent = {
      data: {
        before: {
          data: () => ({ ...afterData, status: 'open' }),
          ref: billRef,
          exists: true,
        },
        after: {
          data: () => afterData,
          ref: billRef,
          exists: true,
        },
      },
      params: { billId },
    };
    await (billsOnSettle as { run: (e: unknown) => Promise<void> }).run(mockEvent);
  }

  it('claim=received=5000: settle 後に amounts/snapshot/paymentTotals/cycle が揃う', async () => {
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
      addonCount: 3, // claim = 2000 + 1000*3 = 5000
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
    const billId = String(res.billId);

    const billBeforeSettle = (await db.collection('bills').doc(billId).get()).data()!;
    expect(billBeforeSettle.meta?.paymentMethodsByCategory).toEqual({
      tournaments: 'cash',
    });
    expect(billBeforeSettle.draftAccountingInput?.paymentMethodsByCategory).toEqual({
      tournaments: 'cash',
    });
    expect(billBeforeSettle.meta?.paymentMethodsByAmount).toEqual({ cash: 5000 });
    expect(billBeforeSettle.remotePayment?.amountIncl).toBe(5000);

    await runBillsOnSettleForSettledBill(billId);

    const bill = (await db.collection('bills').doc(billId).get()).data()!;
    expect(bill.status).toBe('settled');
    expect(bill.amounts?.grandTotalIncl).toBe(5000);
    expect(bill.amounts?.grandTotalRounded).toBe(5000);
    expect(bill.settlementSnapshot?.amounts?.grandTotalIncl).toBe(5000);
    expect(bill.paymentTotals?.cash).toBe(5000);
    expect(bill.currentSummary?.claimTotalIncl).toBe(5000);
    expect(bill.currentSummary?.receivedTotalIncl).toBe(5000);
    expect(bill.currentSummary?.netSalesIncl).toBe(5000);
    expect(bill.meta?.contentHash).toEqual(expect.any(String));
    expect(bill.postSettlementState?.requiredActionType).toBe('none');

    const cycleSnap = await db
      .collection('bills')
      .doc(billId)
      .collection('settlementCycles')
      .doc('1')
      .get();
    expect(cycleSnap.data()?.cycleState).toBe('settled');

    const entrySnap = await db
      .collection('scheduledTournaments')
      .doc(tournamentId)
      .collection('okibakeTemporaryEntries')
      .doc(entryId)
      .get();
    expect(entrySnap.data()!.billLinkStatus).toBe('linked');
  });

  it('underpayment amount=4000 (claim=5000): 拒否・pending_review 維持・bill 未作成', async () => {
    const uid = 'admin-uid-underpay';
    const tournamentId = 't-remote-under';
    const entryId = 'e-remote-under';
    await seedBase({
      uid,
      tournamentId,
      entryId,
      linkedUserId: 'user-under',
      linkedUserPokerName: 'ユーザー不足',
      entryStatus: 'busted',
      addonCount: 3,
    });

    await expect(
      callable.run({
        auth: { uid },
        data: {
          tournamentId,
          okibakeEntryId: entryId,
          operationId: 'op-remote-under',
          amountIncl: 4000,
          paymentMethod: 'cash',
        },
      } as any),
    ).rejects.toMatchObject({
      code: 'failed-precondition',
      details: expect.objectContaining({
        errorKey: 'OKIBAKE_REMOTE_PAYMENT_AMOUNT_MISMATCH',
      }),
    });

    const entrySnap = await db
      .collection('scheduledTournaments')
      .doc(tournamentId)
      .collection('okibakeTemporaryEntries')
      .doc(entryId)
      .get();
    expect(entrySnap.data()!.billLinkStatus).toBe('pending_review');

    const bills = await db
      .collection('bills')
      .where('sourceOkibakeEntryId', '==', entryId)
      .get();
    expect(bills.empty).toBe(true);
  });

  it('overpayment amount=6000 (claim=5000): 拒否', async () => {
    const uid = 'admin-uid-overpay';
    const tournamentId = 't-remote-over';
    const entryId = 'e-remote-over';
    await seedBase({
      uid,
      tournamentId,
      entryId,
      linkedUserId: 'user-over',
      linkedUserPokerName: 'ユーザー過入',
      entryStatus: 'busted',
      addonCount: 3,
    });

    await expect(
      callable.run({
        auth: { uid },
        data: {
          tournamentId,
          okibakeEntryId: entryId,
          operationId: 'op-remote-over',
          amountIncl: 6000,
          paymentMethod: 'cash',
        },
      } as any),
    ).rejects.toMatchObject({
      code: 'failed-precondition',
      details: expect.objectContaining({
        errorKey: 'OKIBAKE_REMOTE_PAYMENT_AMOUNT_MISMATCH',
      }),
    });
  });

  it('ByCategory ありのため PAYMENT_CATEGORY_REQUIRED にならず contentHash が入る', async () => {
    const uid = 'admin-uid-bycat';
    const tournamentId = 't-remote-bycat';
    const entryId = 'e-remote-bycat';
    await seedBase({
      uid,
      tournamentId,
      entryId,
      linkedUserId: 'user-bycat',
      linkedUserPokerName: 'ユーザーByCat',
      entryStatus: 'busted',
      addonCount: 1, // claim 3000
    });

    const res = await callable.run({
      auth: { uid },
      data: {
        tournamentId,
        okibakeEntryId: entryId,
        operationId: 'op-remote-bycat',
        amountIncl: 3000,
        paymentMethod: 'electronic_money',
      },
    } as any);
    const billId = String(res.billId);
    await runBillsOnSettleForSettledBill(billId);

    const bill = (await db.collection('bills').doc(billId).get()).data()!;
    expect(bill.meta?.paymentMethodsByCategory).toEqual({
      tournaments: 'electronic_money',
    });
    expect(bill.meta?.contentHash).toEqual(expect.any(String));
    expect(bill.amounts?.grandTotalIncl).toBe(3000);
    expect(bill.paymentTotals?.electronic_money).toBe(3000);
  });

  it('同一 operationId は replay を返し、bill 二重作成・remotePayment 二重なし', async () => {
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
    const claimTotalIncl = 2000 + 1000 * 2; // entryFee + addonFee * addonCount
    const data = {
      tournamentId,
      okibakeEntryId: entryId,
      operationId,
      amountIncl: claimTotalIncl,
      paymentMethod: 'electronic_money' as const,
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
    expect(bills.docs[0].data().remotePayment?.amountIncl).toBe(claimTotalIncl);
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
    const claimTotalIncl = 2000 + 1000 * 2;
    await callable.run({
      auth: { uid },
      data: {
        tournamentId,
        okibakeEntryId: entryId,
        operationId,
        amountIncl: claimTotalIncl,
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

  it('0円ケース（claim=0 / received=0）でも settle 完走する', async () => {
    const uid = 'admin-uid-zero';
    const tournamentId = 't-remote-zero';
    const entryId = 'e-remote-zero';
    await seedBase({
      uid,
      tournamentId,
      entryId,
      linkedUserId: 'user-zero',
      linkedUserPokerName: 'ユーザー0',
      entryStatus: 'busted',
      addonCount: 0,
      entryFee: 0,
      addonFee: 0,
    });

    const res = await callable.run({
      auth: { uid },
      data: {
        tournamentId,
        okibakeEntryId: entryId,
        operationId: 'op-remote-zero',
        amountIncl: 0,
        paymentMethod: 'cash',
      },
    } as any);
    const billId = String(res.billId);
    await runBillsOnSettleForSettledBill(billId);

    const bill = (await db.collection('bills').doc(billId).get()).data()!;
    expect(bill.amounts?.grandTotalIncl).toBe(0);
    expect(bill.currentSummary?.claimTotalIncl).toBe(0);
    expect(bill.currentSummary?.receivedTotalIncl).toBe(0);
    expect(bill.currentSummary?.netSalesIncl).toBe(0);
    expect(bill.meta?.contentHash).toEqual(expect.any(String));
  });

  it('有効な okibake_remote_payment bill がある場合は新 resolve を拒否する', async () => {
    const uid = 'admin-uid-dup';
    const tournamentId = 't-remote-dup';
    const entryId = 'e-remote-dup';
    await seedBase({
      uid,
      tournamentId,
      entryId,
      linkedUserId: 'user-dup',
      linkedUserPokerName: 'ユーザー重複',
      entryStatus: 'busted',
      addonCount: 0,
    });

    await callable.run({
      auth: { uid },
      data: {
        tournamentId,
        okibakeEntryId: entryId,
        operationId: 'op-remote-dup-1',
        amountIncl: 2000,
        paymentMethod: 'cash',
      },
    } as any);

    // entry を pending_review に戻しても、settled bill が有効なら拒否
    await db
      .collection('scheduledTournaments')
      .doc(tournamentId)
      .collection('okibakeTemporaryEntries')
      .doc(entryId)
      .set(
        {
          billLinkStatus: 'pending_review',
          linkedBillId: null,
          linkedAt: null,
        },
        { merge: true }
      );

    await expect(
      callable.run({
        auth: { uid },
        data: {
          tournamentId,
          okibakeEntryId: entryId,
          operationId: 'op-remote-dup-2',
          amountIncl: 2000,
          paymentMethod: 'cash',
        },
      } as any)
    ).rejects.toMatchObject({ code: 'failed-precondition' });
  });

  it('旧 bill が voided のみなら再 resolve で新 bill を作成できる', async () => {
    const uid = 'admin-uid-voided-ok';
    const tournamentId = 't-remote-voided-ok';
    const entryId = 'e-remote-voided-ok';
    await seedBase({
      uid,
      tournamentId,
      entryId,
      linkedUserId: 'user-voided-ok',
      linkedUserPokerName: 'ユーザーvoided',
      entryStatus: 'busted',
      addonCount: 0,
    });

    const first = await callable.run({
      auth: { uid },
      data: {
        tournamentId,
        okibakeEntryId: entryId,
        operationId: 'op-remote-voided-1',
        amountIncl: 2000,
        paymentMethod: 'cash',
      },
    } as any);
    const oldBillId = String(first.billId);

    await db.collection('bills').doc(oldBillId).set({ status: 'voided' }, { merge: true });
    await db
      .collection('scheduledTournaments')
      .doc(tournamentId)
      .collection('okibakeTemporaryEntries')
      .doc(entryId)
      .set(
        {
          billLinkStatus: 'pending_review',
          linkedBillId: null,
          linkedAt: null,
        },
        { merge: true }
      );

    const second = await callable.run({
      auth: { uid },
      data: {
        tournamentId,
        okibakeEntryId: entryId,
        operationId: 'op-remote-voided-2',
        amountIncl: 2000,
        paymentMethod: 'cash',
      },
    } as any);
    expect(second.success).toBe(true);
    expect(String(second.billId)).not.toBe(oldBillId);

    const oldBill = (await db.collection('bills').doc(oldBillId).get()).data()!;
    expect(oldBill.status).toBe('voided');

    const entry = (
      await db
        .collection('scheduledTournaments')
        .doc(tournamentId)
        .collection('okibakeTemporaryEntries')
        .doc(entryId)
        .get()
    ).data()!;
    expect(entry.billLinkStatus).toBe('linked');
    expect(entry.linkedBillId).toBe(String(second.billId));
  });
});
