/**
 * C1-B Option 1: 来店なし現金精算は claim === payment 必須。
 * under/over は startAccounting の既存整合で拒否されること。
 */

import { initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import * as admin from 'firebase-admin';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

import {
  startAccounting,
  completeAccountingV2,
} from '../../src/domains/bills/callables/accounting';
import { createBillWithActiveStay } from '../../src/domains/bills/repos/createBillWithActiveStay';
import { finalizeUnsettledBillAfterAccounting } from '../../src/domains/storeMeta/services/finalizeUnsettledBillAfterAccounting';
import { a7StoreConfigDocument, seedA7StoreConfig } from '../helpers/a7StoreConfig';
import { __setMockConfig, __resetMockConfig } from '../helpers/mockStoreConfig';

const PROJECT_ID = 'test-default';
const CURRENT_DATE = '2026-08-24';
const CARRYOVER_DATE = '2026-08-23';

async function seedCarryoverBill(params: {
  db: admin.firestore.Firestore;
  adminId: string;
  userId: string;
  billId: string;
  amount: number;
}): Promise<void> {
  const { db, adminId, userId, billId, amount } = params;
  await db.collection('devices').doc(`dev_${adminId}`).set({
    uid: adminId,
    role: 'admin',
    status: 'active',
    name: 'C1B Cash Admin',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  await db.collection('users').doc(userId).set({
    uid: userId,
    pokerName: 'C1BCashUser',
    userType: 'line',
    unsettledBillsCount: 1,
    pointA: 0,
    pointB: 0,
    pointC: 0,
    pointD: 0,
    pointE: 0,
    sideGameChip: 0,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  await createBillWithActiveStay({
    billId,
    userId,
    pokerName: 'C1BCashUser',
    idempotencyKey: `idem_${billId}`,
    entranceFee: amount,
    entranceFeeDescription: '持ち越し入店料',
  });
  await db.collection('bills').doc(billId).set(
    {
      businessDate: CARRYOVER_DATE,
      status: 'open',
      closeSummary: {
        unresolved: true,
        markedAt: Timestamp.now(),
        closedBusinessDate: CARRYOVER_DATE,
        displayAmountAtMark: amount,
        lastCloseRunId: 'close-c1b-cash-1',
      },
      closeSnapshot: {
        unresolved: true,
        markedAt: Timestamp.now(),
        closedBusinessDate: CARRYOVER_DATE,
        displayAmountAtMark: amount,
        lastCloseRunId: 'close-c1b-cash-1',
      },
    },
    { merge: true },
  );
  await db.collection('activeStays').doc(userId).delete();
}

describe('C1-B carryover remote cash Option 1 (exact amount)', () => {
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
    await seedA7StoreConfig(db);
    __setMockConfig(a7StoreConfigDocument());
    await db.collection('storeMeta').doc('currentBusinessDay').set({
      status: 'running',
      currentBusinessDateKey: CURRENT_DATE,
      lastClosedBusinessDateKey: CARRYOVER_DATE,
      updatedAt: Timestamp.now(),
      source: 'test',
      lastError: null,
    });
  });

  afterEach(() => {
    __resetMockConfig();
  });

  it('exact cash settle → settled + unresolved false + count -1', async () => {
    const adminId = 'admin_c1b_cash_exact';
    const userId = 'user_c1b_cash_exact';
    const billId = 'bill_c1b_cash_exact';
    await seedCarryoverBill({ db, adminId, userId, billId, amount: 5000 });

    const start = await (startAccounting as any).run({
      auth: { uid: adminId },
      data: {
        billId,
        clientNonce: 'nonce_c1b_cash_exact',
        accountingMode: 'custom',
        paymentMethodsByCategory: { extraCost: 'cash' },
        paymentMethodsByAmount: { cash: 5000 },
      },
    });
    expect(start.success).toBe(true);

    const settle = await (completeAccountingV2 as any).run({
      auth: { uid: adminId },
      data: { billId },
    });
    expect(settle.success).toBe(true);

    const finalize = await (finalizeUnsettledBillAfterAccounting as any).run({
      auth: { uid: adminId },
      data: { billId },
    });
    expect(finalize.success).toBe(true);

    const bill = (await db.collection('bills').doc(billId).get()).data()!;
    expect(bill.status).toBe('settled');
    expect(bill.businessDate).toBe(CARRYOVER_DATE);
    expect(bill.closeSummary?.unresolved).toBe(false);
    expect(bill.closeSnapshot?.unresolved).toBe(false);

    const user = (await db.collection('users').doc(userId).get()).data()!;
    expect(user.unsettledBillsCount).toBe(0);
  });

  it('underpayment startAccounting は拒否され unresolved のまま', async () => {
    const adminId = 'admin_c1b_cash_under';
    const userId = 'user_c1b_cash_under';
    const billId = 'bill_c1b_cash_under';
    await seedCarryoverBill({ db, adminId, userId, billId, amount: 5000 });

    await expect(
      (startAccounting as any).run({
        auth: { uid: adminId },
        data: {
          billId,
          clientNonce: 'nonce_c1b_cash_under',
          accountingMode: 'custom',
          paymentMethodsByCategory: { extraCost: 'cash' },
          paymentMethodsByAmount: { cash: 4000 },
        },
      }),
    ).rejects.toBeTruthy();

    const bill = (await db.collection('bills').doc(billId).get()).data()!;
    expect(bill.status).toBe('open');
    expect(bill.closeSummary?.unresolved).toBe(true);
    const user = (await db.collection('users').doc(userId).get()).data()!;
    expect(user.unsettledBillsCount).toBe(1);
  });

  it('overpayment startAccounting は拒否', async () => {
    const adminId = 'admin_c1b_cash_over';
    const userId = 'user_c1b_cash_over';
    const billId = 'bill_c1b_cash_over';
    await seedCarryoverBill({ db, adminId, userId, billId, amount: 5000 });

    await expect(
      (startAccounting as any).run({
        auth: { uid: adminId },
        data: {
          billId,
          clientNonce: 'nonce_c1b_cash_over',
          accountingMode: 'custom',
          paymentMethodsByCategory: { extraCost: 'cash' },
          paymentMethodsByAmount: { cash: 6000 },
        },
      }),
    ).rejects.toBeTruthy();

    const bill = (await db.collection('bills').doc(billId).get()).data()!;
    expect(bill.status).toBe('open');
    expect(bill.closeSummary?.unresolved).toBe(true);
  });

  it('二重 complete は拒否（二重 settle なし）', async () => {
    const adminId = 'admin_c1b_cash_dup';
    const userId = 'user_c1b_cash_dup';
    const billId = 'bill_c1b_cash_dup';
    await seedCarryoverBill({ db, adminId, userId, billId, amount: 5000 });

    await (startAccounting as any).run({
      auth: { uid: adminId },
      data: {
        billId,
        clientNonce: 'nonce_c1b_cash_dup',
        accountingMode: 'custom',
        paymentMethodsByCategory: { extraCost: 'cash' },
        paymentMethodsByAmount: { cash: 5000 },
      },
    });
    await (completeAccountingV2 as any).run({
      auth: { uid: adminId },
      data: { billId },
    });

    await expect(
      (completeAccountingV2 as any).run({
        auth: { uid: adminId },
        data: { billId },
      }),
    ).rejects.toBeTruthy();
  });
});
