/**
 * C1-B: carryover settle 時に現在来店中の visitLog / activeStay を壊さないこと。
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

describe('completeAccountingV2 C1-B carryover settle protection', () => {
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

  it('carryover settle しても current activeStay / visitLog を閉じない', async () => {
    const adminId = 'admin_c1b_settle';
    const userId = 'user_c1b_settle';
    const carryoverBillId = 'bill_c1b_carryover';
    const currentBillId = 'bill_c1b_current';

    await db.collection('devices').doc(`dev_${adminId}`).set({
      uid: adminId,
      role: 'admin',
      status: 'active',
      name: 'C1B Admin',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    await db.collection('users').doc(userId).set({
      uid: userId,
      pokerName: 'C1BUser',
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

    // 過去 carryover bill（businessDate は過去日）を手で seed
    // createBillWithActiveStay は current 日を使うため、親を後から書き換える
    await createBillWithActiveStay({
      billId: carryoverBillId,
      userId,
      pokerName: 'C1BUser',
      idempotencyKey: 'idem_c1b_carryover_create',
      entranceFee: 1000,
      entranceFeeDescription: '持ち越し入店料',
    });
    await db.collection('bills').doc(carryoverBillId).set(
      {
        businessDate: CARRYOVER_DATE,
        status: 'open',
        closeSummary: {
          unresolved: true,
          markedAt: Timestamp.now(),
          closedBusinessDate: CARRYOVER_DATE,
          displayAmountAtMark: 1000,
          lastCloseRunId: 'close-c1b-1',
        },
        closeSnapshot: {
          unresolved: true,
          markedAt: Timestamp.now(),
          closedBusinessDate: CARRYOVER_DATE,
          displayAmountAtMark: 1000,
          lastCloseRunId: 'close-c1b-1',
        },
      },
      { merge: true },
    );
    // createBill で作られた activeStay を消して、現在来店に差し替え
    await db.collection('activeStays').doc(userId).delete();

    await createBillWithActiveStay({
      billId: currentBillId,
      userId,
      pokerName: 'C1BUser',
      idempotencyKey: 'idem_c1b_current_create',
    });

    const visitLogRef = db
      .collection('users')
      .doc(userId)
      .collection('visitLogs')
      .doc('visit_current');
    await visitLogRef.set({
      checkInAt: Timestamp.now(),
      checkOutAt: null,
      billId: currentBillId,
      createdAt: Timestamp.now(),
    });

    const start = await (startAccounting as any).run({
      auth: { uid: adminId },
      data: {
        billId: carryoverBillId,
        clientNonce: 'nonce_c1b_carryover_start',
        accountingMode: 'custom',
        paymentMethodsByCategory: { extraCost: 'cash' },
        paymentMethodsByAmount: { cash: 1000 },
      },
    });
    expect(start.success).toBe(true);

    const settle = await (completeAccountingV2 as any).run({
      auth: { uid: adminId },
      data: { billId: carryoverBillId },
    });
    expect(settle.success).toBe(true);

    // AccountingPage(forUnsettledBillId) と同じ後処理
    const finalize = await (finalizeUnsettledBillAfterAccounting as any).run({
      auth: { uid: adminId },
      data: { billId: carryoverBillId },
    });
    expect(finalize.success).toBe(true);

    const carryover = (await db.collection('bills').doc(carryoverBillId).get()).data()!;
    expect(carryover.status).toBe('settled');
    expect(carryover.businessDate).toBe(CARRYOVER_DATE);
    expect(carryover.closeSummary?.unresolved).toBe(false);
    expect(carryover.closeSnapshot?.unresolved).toBe(false);
    // 証跡は retain（後日 reopen 判定用）
    expect(carryover.closeSummary?.closedBusinessDate).toBe(CARRYOVER_DATE);
    expect(carryover.closeSummary?.lastCloseRunId).toBe('close-c1b-1');

    const user = (await db.collection('users').doc(userId).get()).data()!;
    expect(user.unsettledBillsCount).toBe(0);

    const stay = (await db.collection('activeStays').doc(userId).get()).data()!;
    expect(stay.billId).toBe(currentBillId);
    expect(stay.isActive).toBe(true);

    const visit = (await visitLogRef.get()).data()!;
    expect(visit.checkOutAt).toBeNull();

    const currentBill = (await db.collection('bills').doc(currentBillId).get()).data()!;
    expect(currentBill.status).toBe('open');
  });
});
