/**
 * applyCloseSnapshotCore: production initial closeSummary を invalid 扱いしない回帰。
 *
 * 前提: Firestore Emulator
 *   firebase emulators:exec --only firestore \
 *     'cd functions && npm test -- --runInBand __tests__/callables/applyCloseSnapshot.initialCloseSummary.spec.ts'
 */

import { initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import * as admin from 'firebase-admin';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

import { applyCloseSnapshotCore } from '../../src/domains/storeMeta/services/applyCloseSnapshot';
import { buildInitialCloseSummary } from '../../src/domains/bills/services/parentSummary';

const PROJECT_ID = 'test-default';
const BUSINESS_DATE = '2026-08-24';

describe('applyCloseSnapshotCore production initial closeSummary', () => {
  let testEnv: RulesTestEnvironment;
  let db: admin.firestore.Firestore;

  beforeAll(async () => {
    process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8081';
    process.env.GCLOUD_PROJECT = PROJECT_ID;
    testEnv = await initializeTestEnvironment({ projectId: PROJECT_ID });
    if (admin.apps.length > 0) {
      await Promise.all(admin.apps.map((a) => a?.delete()).filter(Boolean));
    }
    admin.initializeApp({ projectId: PROJECT_ID });
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

  async function seedUser(userId: string) {
    await db.collection('users').doc(userId).set({
      uid: userId,
      pokerName: 'MarkGuest',
      userType: 'line',
      unsettledBillsCount: 0,
    });
  }

  async function seedOpenBill(
    billId: string,
    userId: string,
    closeSummary: Record<string, unknown> | null,
  ) {
    const data: Record<string, unknown> = {
      status: 'open',
      businessDate: BUSINESS_DATE,
      party: { userId, pokerName: 'MarkGuest' },
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };
    if (closeSummary !== null) {
      data.closeSummary = closeSummary;
    }
    await db.collection('bills').doc(billId).set(data);
  }

  it('legacy: closeSummary なし → mark 成功', async () => {
    const billId = 'bill-legacy-no-summary';
    const userId = 'user-legacy';
    await seedUser(userId);
    await seedOpenBill(billId, userId, null);

    const result = await applyCloseSnapshotCore(db, {
      billIds: [billId],
      amountsByBillId: { [billId]: 1200 },
      closedBusinessDate: BUSINESS_DATE,
      closeRunId: 'close_legacy_1',
    });

    expect(result.updatedBillIds).toEqual([billId]);
    expect(result.skipped).toEqual([]);
    const bill = (await db.collection('bills').doc(billId).get()).data()!;
    expect(bill.status).toBe('open');
    expect(bill.closeSummary?.unresolved).toBe(true);
    expect(bill.closeSnapshot?.unresolved).toBe(true);
    expect(bill.closeSummary?.lastCloseRunId).toBe('close_legacy_1');
    expect(bill.closeSummary?.closedBusinessDate).toBe(BUSINESS_DATE);
    const user = (await db.collection('users').doc(userId).get()).data()!;
    expect(user.unsettledBillsCount).toBe(1);
  });

  it('production: buildInitialCloseSummary → mark 成功（最重要回帰）', async () => {
    const billId = 'bill-prod-initial';
    const userId = 'user-prod-initial';
    await seedUser(userId);
    await seedOpenBill(billId, userId, buildInitialCloseSummary());

    const result = await applyCloseSnapshotCore(db, {
      billIds: [billId],
      amountsByBillId: { [billId]: 2500 },
      closedBusinessDate: BUSINESS_DATE,
      closeRunId: 'close_prod_initial_1',
    });

    expect(result.skipped).toEqual([]);
    expect(result.updatedBillIds).toEqual([billId]);
    expect(result.usersIncremented).toEqual([{ userId, inc: 1 }]);

    const bill = (await db.collection('bills').doc(billId).get()).data()!;
    expect(bill.status).toBe('open');
    expect(bill.closeSummary?.unresolved).toBe(true);
    expect(bill.closeSnapshot?.unresolved).toBe(true);
    expect(bill.closeSummary?.lastCloseRunId).toBe('close_prod_initial_1');
    expect(bill.closeSummary?.closedBusinessDate).toBe(BUSINESS_DATE);
    expect(bill.closeSummary?.displayAmountAtMark).toBe(2500);
    expect(bill.closeSummary?.markedAt).toBeDefined();

    const user = (await db.collection('users').doc(userId).get()).data()!;
    expect(user.unsettledBillsCount).toBe(1);
  });

  it('already marked → 二重 count なし', async () => {
    const billId = 'bill-already-marked';
    const userId = 'user-already-marked';
    await seedUser(userId);
    await seedOpenBill(billId, userId, {
      unresolved: true,
      markedAt: admin.firestore.Timestamp.now(),
      closedBusinessDate: BUSINESS_DATE,
      displayAmountAtMark: 900,
      lastCloseRunId: 'close_prev',
    });
    await db.collection('bills').doc(billId).set(
      {
        closeSnapshot: {
          unresolved: true,
          markedAt: admin.firestore.Timestamp.now(),
          closedBusinessDate: BUSINESS_DATE,
          displayAmountAtMark: 900,
          lastCloseRunId: 'close_prev',
        },
      },
      { merge: true },
    );
    await db.collection('users').doc(userId).set({ unsettledBillsCount: 1 }, { merge: true });

    const result = await applyCloseSnapshotCore(db, {
      billIds: [billId],
      amountsByBillId: { [billId]: 900 },
      closedBusinessDate: BUSINESS_DATE,
      closeRunId: 'close_retry_1',
    });

    expect(result.updatedBillIds).toEqual([]);
    expect(result.skipped).toEqual([{ billId, reason: 'already_marked' }]);
    const user = (await db.collection('users').doc(userId).get()).data()!;
    expect(user.unsettledBillsCount).toBe(1);
    const bill = (await db.collection('bills').doc(billId).get()).data()!;
    expect(bill.closeSummary?.lastCloseRunId).toBe('close_prev');
  });

  it('corrupt closeSummary → invalid skip（上書きしない）', async () => {
    const billId = 'bill-corrupt';
    const userId = 'user-corrupt';
    await seedUser(userId);
    await seedOpenBill(billId, userId, {
      unresolved: 'yes',
      lastCloseRunId: null,
    });

    const result = await applyCloseSnapshotCore(db, {
      billIds: [billId],
      amountsByBillId: { [billId]: 100 },
      closedBusinessDate: BUSINESS_DATE,
      closeRunId: 'close_corrupt_1',
    });

    expect(result.updatedBillIds).toEqual([]);
    expect(result.skipped).toEqual([
      { billId, reason: 'invalid_closeSummary_shape' },
    ]);
    const bill = (await db.collection('bills').doc(billId).get()).data()!;
    expect(bill.closeSummary?.unresolved).toBe('yes');
    expect(bill.closeSnapshot).toBeUndefined();
    const user = (await db.collection('users').doc(userId).get()).data()!;
    expect(user.unsettledBillsCount).toBe(0);
  });
});
