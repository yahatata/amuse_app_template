/**
 * 同一営業日 reopen 時の UNSETTLED_MARK bill 自動復旧。
 *
 * 前提: Firestore Emulator
 *   firebase emulators:exec --only firestore \
 *     'cd functions && npm test -- --runInBand storeManagement/same_day_reopen_restore.spec.ts'
 */

import { initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import * as admin from 'firebase-admin';
import { getFirestore, Timestamp, FieldValue } from 'firebase-admin/firestore';

import { closeStoreTerminal } from '../../src/domains/storeMeta/callables/closeStoreTerminal';
import { openStoreTerminal } from '../../src/domains/storeMeta/callables/openStoreTerminal';
import { buildInitialCloseSummary } from '../../src/domains/bills/services/parentSummary';
import { isInitialUnmarkedCloseEvidence } from '../../src/domains/storeMeta/services/applyCloseSnapshot';
import { a7E2EFlowStoreConfigDocument } from '../helpers/a7StoreConfig';
import { __setMockConfig, __resetMockConfig } from '../helpers/mockStoreConfig';

const PROJECT_ID = 'test-same-day-reopen';
const BUSINESS_DATE = '2026-08-25';
const NEXT_BUSINESS_DATE = '2026-08-26';

describe('same_day_reopen_restore', () => {
  let testEnv: RulesTestEnvironment;
  let db: admin.firestore.Firestore;
  const adminUid = 'admin_same_day_reopen';

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
    __setMockConfig(a7E2EFlowStoreConfigDocument());

    await db.collection('devices').doc('dev_admin_same_day').set({
      uid: adminUid,
      role: 'admin',
      status: 'active',
      name: 'SameDay Admin',
      createdAt: FieldValue.serverTimestamp(),
    });
  });

  afterEach(() => {
    __resetMockConfig();
  });

  async function seedRunningWithUnsettledBill() {
    const userId = 'user_same_day';
    const billId = 'bill_same_day_unsettled';

    await db.collection('storeMeta').doc('currentBusinessDay').set({
      status: 'running',
      currentBusinessDateKey: BUSINESS_DATE,
      lastClosedBusinessDateKey: null,
      updatedAt: Timestamp.now(),
      source: 'test',
      lastError: null,
    });

    await db.collection('users').doc(userId).set({
      uid: userId,
      pokerName: 'SameDayGuest',
      userType: 'line',
      unsettledBillsCount: 0,
    });

    await db.collection('bills').doc(billId).set({
      status: 'open',
      businessDate: BUSINESS_DATE,
      party: { userId, pokerName: 'SameDayGuest' },
      closeSummary: buildInitialCloseSummary(),
      ops: { accountingStartedAt: null },
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    await db.collection('activeStays').doc(userId).set({
      uid: userId,
      billId,
      pokerName: 'SameDayGuest',
      isActive: true,
      startedAt: Timestamp.now(),
    });

    return { userId, billId };
  }

  it('Case A: close → same-day open restores bill, count, activeStay', async () => {
    const { userId, billId } = await seedRunningWithUnsettledBill();

    await (closeStoreTerminal as any).run({ auth: { uid: adminUid }, data: {} });

    const afterClose = (await db.collection('bills').doc(billId).get()).data()!;
    expect(afterClose.closeSummary?.unresolved).toBe(true);
    expect((await db.collection('users').doc(userId).get()).data()?.unsettledBillsCount).toBe(1);
    expect((await db.collection('activeStays').doc(userId).get()).exists).toBe(false);

    await (openStoreTerminal as any).run({
      auth: { uid: adminUid },
      data: { businessDateKey: BUSINESS_DATE },
    });

    const afterOpen = (await db.collection('bills').doc(billId).get()).data()!;
    expect(isInitialUnmarkedCloseEvidence(afterOpen.closeSummary)).toBe(true);
    expect(isInitialUnmarkedCloseEvidence(afterOpen.closeSnapshot)).toBe(true);
    expect((await db.collection('users').doc(userId).get()).data()?.unsettledBillsCount).toBe(0);

    const stay = (await db.collection('activeStays').doc(userId).get()).data()!;
    expect(stay.isActive).toBe(true);
    expect(stay.billId).toBe(billId);
  });

  it('Case B: close → next-day open keeps carryover', async () => {
    const { userId, billId } = await seedRunningWithUnsettledBill();

    await (closeStoreTerminal as any).run({ auth: { uid: adminUid }, data: {} });

    await (openStoreTerminal as any).run({
      auth: { uid: adminUid },
      data: { businessDateKey: NEXT_BUSINESS_DATE },
    });

    const bill = (await db.collection('bills').doc(billId).get()).data()!;
    expect(bill.closeSummary?.unresolved).toBe(true);
    expect((await db.collection('users').doc(userId).get()).data()?.unsettledBillsCount).toBe(1);
    expect((await db.collection('activeStays').doc(userId).get()).exists).toBe(false);
  });

  it('Case C: close → settle carryover → same-day open leaves settled', async () => {
    const { userId, billId } = await seedRunningWithUnsettledBill();

    await (closeStoreTerminal as any).run({ auth: { uid: adminUid }, data: {} });

    await db.collection('bills').doc(billId).update({
      status: 'settled',
      'closeSummary.unresolved': false,
      'closeSnapshot.unresolved': false,
      updatedAt: FieldValue.serverTimestamp(),
    });
    await db.collection('users').doc(userId).update({
      unsettledBillsCount: 0,
    });

    await (openStoreTerminal as any).run({
      auth: { uid: adminUid },
      data: { businessDateKey: BUSINESS_DATE },
    });

    const bill = (await db.collection('bills').doc(billId).get()).data()!;
    expect(bill.status).toBe('settled');
    expect(bill.closeSummary?.lastCloseRunId).toBeTruthy();
  });

  it('Case D: partial settle — only unsettled bill restores on same-day open', async () => {
    const userA = 'user_partial_a';
    const userB = 'user_partial_b';
    const billA = 'bill_partial_a';
    const billB = 'bill_partial_b';

    await db.collection('storeMeta').doc('currentBusinessDay').set({
      status: 'running',
      currentBusinessDateKey: BUSINESS_DATE,
      lastClosedBusinessDateKey: null,
      updatedAt: Timestamp.now(),
      source: 'test',
    });

    await db.collection('users').doc(userA).set({
      uid: userA,
      pokerName: 'PartialA',
      unsettledBillsCount: 0,
    });
    await db.collection('users').doc(userB).set({
      uid: userB,
      pokerName: 'PartialB',
      unsettledBillsCount: 0,
    });

    for (const [userId, billId, name] of [
      [userA, billA, 'PartialA'],
      [userB, billB, 'PartialB'],
    ] as const) {
      await db.collection('bills').doc(billId).set({
        status: 'open',
        businessDate: BUSINESS_DATE,
        party: { userId, pokerName: name },
        closeSummary: buildInitialCloseSummary(),
        ops: { accountingStartedAt: null },
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      await db.collection('activeStays').doc(userId).set({
        uid: userId,
        billId,
        pokerName: name,
        isActive: true,
        startedAt: Timestamp.now(),
      });
    }

    await (closeStoreTerminal as any).run({ auth: { uid: adminUid }, data: {} });

    await db.collection('bills').doc(billA).update({
      status: 'settled',
      'closeSummary.unresolved': false,
      'closeSnapshot.unresolved': false,
      updatedAt: FieldValue.serverTimestamp(),
    });
    await db.collection('users').doc(userA).update({ unsettledBillsCount: 0 });
    await db.collection('users').doc(userB).update({ unsettledBillsCount: 1 });

    await (openStoreTerminal as any).run({
      auth: { uid: adminUid },
      data: { businessDateKey: BUSINESS_DATE },
    });

    const billAfterA = (await db.collection('bills').doc(billA).get()).data()!;
    const billAfterB = (await db.collection('bills').doc(billB).get()).data()!;
    expect(billAfterA.status).toBe('settled');
    expect(billAfterA.closeSummary?.lastCloseRunId).toBeTruthy();
    expect(isInitialUnmarkedCloseEvidence(billAfterB.closeSummary)).toBe(true);
    expect((await db.collection('users').doc(userA).get()).data()?.unsettledBillsCount).toBe(0);
    expect((await db.collection('users').doc(userB).get()).data()?.unsettledBillsCount).toBe(0);
    expect((await db.collection('activeStays').doc(userB).get()).data()?.billId).toBe(billB);
  });

  it('Case D2: two close runs same day — older marked bill still restores', async () => {
    const userId = 'user_two_close';
    const billId = 'bill_two_close';

    await db.collection('storeMeta').doc('currentBusinessDay').set({
      status: 'running',
      currentBusinessDateKey: BUSINESS_DATE,
      lastClosedBusinessDateKey: null,
      updatedAt: Timestamp.now(),
      source: 'test',
    });

    await db.collection('users').doc(userId).set({
      uid: userId,
      pokerName: 'TwoClose',
      unsettledBillsCount: 1,
    });

    const run1 = 'close_2026-08-25_first';
    await db.collection('bills').doc(billId).set({
      status: 'open',
      businessDate: BUSINESS_DATE,
      party: { userId, pokerName: 'TwoClose' },
      ops: { accountingStartedAt: null },
      closeSummary: {
        unresolved: true,
        markedAt: Timestamp.now(),
        closedBusinessDate: BUSINESS_DATE,
        displayAmountAtMark: 500,
        lastCloseRunId: run1,
      },
      closeSnapshot: {
        unresolved: true,
        markedAt: Timestamp.now(),
        closedBusinessDate: BUSINESS_DATE,
        displayAmountAtMark: 500,
        lastCloseRunId: run1,
      },
    });

    await db.collection('storeMeta').doc('currentBusinessDay').set({
      status: 'closed',
      currentBusinessDateKey: null,
      lastClosedBusinessDateKey: BUSINESS_DATE,
      updatedAt: Timestamp.now(),
      source: 'test',
    });

    await (openStoreTerminal as any).run({
      auth: { uid: adminUid },
      data: { businessDateKey: BUSINESS_DATE },
    });

    const bill = (await db.collection('bills').doc(billId).get()).data()!;
    expect(isInitialUnmarkedCloseEvidence(bill.closeSummary)).toBe(true);
    expect((await db.collection('users').doc(userId).get()).data()?.unsettledBillsCount).toBe(0);
  });

  it('Case E: activeStay conflict — core restore does not overwrite different bill stay', async () => {
    const { restoreUnsettledBillsOnSameDayReopenCore } = await import(
      '../../src/domains/storeMeta/services/restoreUnsettledBillsOnSameDayReopen'
    );

    const userId = 'user_conflict';
    const carryoverBillId = 'bill_carryover';
    const currentBillId = 'bill_current';

    await db.collection('users').doc(userId).set({
      uid: userId,
      pokerName: 'ConflictGuest',
      unsettledBillsCount: 1,
    });

    await db.collection('bills').doc(carryoverBillId).set({
      status: 'open',
      businessDate: BUSINESS_DATE,
      party: { userId, pokerName: 'ConflictGuest' },
      ops: { accountingStartedAt: null },
      closeSummary: {
        unresolved: true,
        markedAt: Timestamp.now(),
        closedBusinessDate: BUSINESS_DATE,
        displayAmountAtMark: 1000,
        lastCloseRunId: 'close_conflict_1',
      },
    });

    await db.collection('activeStays').doc(userId).set({
      uid: userId,
      billId: currentBillId,
      pokerName: 'ConflictGuest',
      isActive: true,
      startedAt: Timestamp.now(),
    });

    const result = await restoreUnsettledBillsOnSameDayReopenCore(db, {
      reopenBusinessDate: BUSINESS_DATE,
      openRunId: 'open_test_conflict',
    });

    expect(result.restoredBillIds).toContain(carryoverBillId);
    expect(result.activeStaySkippedUserIds).toContain(userId);

    const stay = (await db.collection('activeStays').doc(userId).get()).data()!;
    expect(stay.billId).toBe(currentBillId);
  });

  it('Case G: idempotent — restore core twice does not double-decrement count', async () => {
    const { restoreUnsettledBillsOnSameDayReopenCore } = await import(
      '../../src/domains/storeMeta/services/restoreUnsettledBillsOnSameDayReopen'
    );

    const userId = 'user_idempotent_core';
    const billId = 'bill_idempotent_core';

    await db.collection('users').doc(userId).set({
      uid: userId,
      pokerName: 'IdempotentCore',
      unsettledBillsCount: 1,
    });

    await db.collection('bills').doc(billId).set({
      status: 'open',
      businessDate: BUSINESS_DATE,
      party: { userId, pokerName: 'IdempotentCore' },
      ops: { accountingStartedAt: null },
      closeSummary: {
        unresolved: true,
        markedAt: Timestamp.now(),
        closedBusinessDate: BUSINESS_DATE,
        displayAmountAtMark: 800,
        lastCloseRunId: 'close_idem_1',
      },
    });

    const first = await restoreUnsettledBillsOnSameDayReopenCore(db, {
      reopenBusinessDate: BUSINESS_DATE,
      openRunId: 'open_idem_1',
    });
    expect(first.restoredBillIds).toContain(billId);
    expect((await db.collection('users').doc(userId).get()).data()?.unsettledBillsCount).toBe(0);

    const second = await restoreUnsettledBillsOnSameDayReopenCore(db, {
      reopenBusinessDate: BUSINESS_DATE,
      openRunId: 'open_idem_2',
    });
    expect(second.restoredBillIds).toHaveLength(0);
    expect((await db.collection('users').doc(userId).get()).data()?.unsettledBillsCount).toBe(0);
    expect((await db.collection('activeStays').doc(userId).get()).data()?.billId).toBe(billId);
  });

  it('Case G2: idempotent — open on already initial bill skips restore', async () => {
    const userId = 'user_idempotent';
    const billId = 'bill_idempotent';

    await db.collection('storeMeta').doc('currentBusinessDay').set({
      status: 'closed',
      currentBusinessDateKey: null,
      lastClosedBusinessDateKey: BUSINESS_DATE,
      updatedAt: Timestamp.now(),
      source: 'test',
    });

    await db.collection('users').doc(userId).set({
      uid: userId,
      pokerName: 'Idempotent',
      unsettledBillsCount: 0,
    });

    await db.collection('bills').doc(billId).set({
      status: 'open',
      businessDate: BUSINESS_DATE,
      party: { userId, pokerName: 'Idempotent' },
      closeSummary: buildInitialCloseSummary(),
      closeSnapshot: buildInitialCloseSummary(),
      ops: { accountingStartedAt: null },
    });

    await (openStoreTerminal as any).run({
      auth: { uid: adminUid },
      data: { businessDateKey: BUSINESS_DATE },
    });

    expect((await db.collection('users').doc(userId).get()).data()?.unsettledBillsCount).toBe(0);
  });
});
