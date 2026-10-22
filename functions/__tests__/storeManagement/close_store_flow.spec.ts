/**
 * P1 Scenario C: 営業データありの close → 翌営業日 open、および
 * 保存済み途中状態からの同一 runId resume。
 *
 * resume は「実際の例外注入」ではなく、正しく保存された途中状態からの再開確認。
 *
 * 前提: Firestore Emulator
 *   firebase emulators:exec --only firestore \
 *     'cd functions && npm test -- --runInBand storeManagement/close_store_flow.spec.ts'
 */

import { initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import * as admin from 'firebase-admin';
import { getFirestore, Timestamp, FieldValue } from 'firebase-admin/firestore';

import { closeStoreTerminal } from '../../src/domains/storeMeta/callables/closeStoreTerminal';
import { openStoreTerminal } from '../../src/domains/storeMeta/callables/openStoreTerminal';
import { buildInitialCloseSummary } from '../../src/domains/bills/services/parentSummary';
import { a7E2EFlowStoreConfigDocument } from '../helpers/a7StoreConfig';
import { __setMockConfig, __resetMockConfig } from '../helpers/mockStoreConfig';

const PROJECT_ID = 'test-default';
const BUSINESS_DATE = '2026-07-25';
const NEXT_BUSINESS_DATE = '2026-07-26';

describe('close_store_flow (normal close→open / resume from saved mid-state)', () => {
  let testEnv: RulesTestEnvironment;
  let db: admin.firestore.Firestore;

  const adminUid = 'admin_close_flow';

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

    await db.collection('devices').doc('dev_admin_close_flow').set({
      uid: adminUid,
      role: 'admin',
      status: 'active',
      name: 'CloseFlow Admin',
      createdAt: FieldValue.serverTimestamp(),
    });
  });

  afterEach(() => {
    __resetMockConfig();
  });

  async function seedRunningBusinessDay() {
    await db.collection('storeMeta').doc('currentBusinessDay').set({
      status: 'running',
      currentBusinessDateKey: BUSINESS_DATE,
      lastClosedBusinessDateKey: null,
      updatedAt: Timestamp.now(),
      source: 'test',
      lastError: null,
    });
  }

  async function seedOperatingData(opts: { withTournament?: boolean } = {}) {
    const userId = 'user_close_flow_unsettled';
    const unsettledBillId = 'bill_close_unsettled';
    const settledBillId = 'bill_close_settled';
    const staffId = 'staff_close_flow';
    const attendanceId = 'att_close_unclocked';
    const tableId = 'table_close_1';

    await db.collection('users').doc(userId).set({
      uid: userId,
      pokerName: 'CloseFlowGuest',
      userType: 'line',
      unsettledBillsCount: 0,
    });

    // production createBillWithActiveStay と同型の初期 closeSummary を付ける
    // （field 無し fixture だと UNSETTLED_MARK skip bug を検出できない）
    await db.collection('bills').doc(unsettledBillId).set({
      status: 'open',
      businessDate: BUSINESS_DATE,
      party: { userId, pokerName: 'CloseFlowGuest' },
      closeSummary: buildInitialCloseSummary(),
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    await db.collection('activeStays').doc(userId).set({
      uid: userId,
      billId: unsettledBillId,
      isActive: true,
      pokerName: 'CloseFlowGuest',
      startedAt: FieldValue.serverTimestamp(),
    });

    // migration 対象（settled）。marker 無し → migrate で処理される想定
    await db.collection('bills').doc(settledBillId).set({
      status: 'settled',
      businessDate: BUSINESS_DATE,
      party: { userId, pokerName: 'CloseFlowGuest' },
      amounts: {
        subTotalIncl: 1000,
        grandTotalIncl: 1000,
        grandTotalRounded: 1000,
      },
      paymentTotals: { cash: 1000 },
      meta: {
        paymentMethodsByCategory: { items: 'cash' },
        paymentMethodsByAmount: { cash: 1000 },
        contentHash: 'close_flow_settled_hash',
      },
      categoryBreakdown: { items: 1000, tournaments: 0, extraCost: 0, sideGameChip: 0 },
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    await db.collection('tables').doc(tableId).set({
      status: 'in_use',
      updatedAt: FieldValue.serverTimestamp(),
    });

    await db.collection('sideGame').doc(tableId).set({
      active: true,
      gameName: 'NLH',
      seats: {
        seat01UserId: userId,
        seat01PokerName: 'CloseFlowGuest',
      },
      updatedAt: new Date(),
    });

    await db.collection('staffs').doc(staffId).set({
      name: 'CloseFlow Staff',
      status: 'active',
    });

    await db.collection('attendances').doc(attendanceId).set({
      staffId,
      staffName: 'CloseFlow Staff',
      businessDate: BUSINESS_DATE,
      clockIn: Timestamp.now(),
      clockOut: null,
      isOnBreak: false,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    if (opts.withTournament) {
      await db.collection('scheduledTournaments').doc('tn_close_force').set({
        templateId: 'tpl_close',
        status: 'registered',
        businessDate: BUSINESS_DATE,
        startAt: Timestamp.now(),
        snapshot: { name: 'CloseForce TN' },
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }

    return { userId, unsettledBillId, settledBillId, attendanceId, tableId };
  }

  it('C-1: 営業データありの closeStoreTerminal → openStoreTerminal(翌営業日)', async () => {
    await seedRunningBusinessDay();
    const data = await seedOperatingData({ withTournament: true });

    const closeResult = await (closeStoreTerminal as any).run({
      auth: { uid: adminUid },
      data: { forceClose: true },
    });
    expect(closeResult.success).toBe(true);
    expect(closeResult.runId).toBeDefined();
    const runId = closeResult.runId as string;

    const runSnap = await db
      .collection('storeMeta')
      .doc('closeRuns')
      .collection('runs')
      .doc(runId)
      .get();
    expect(runSnap.exists).toBe(true);
    expect(runSnap.data()?.status).toBe('completed');
    expect(runSnap.data()?.lastCompletedStep).toBe('finalizeCloseStateDoc');
    expect(runSnap.data()?.closedBusinessDate).toBe(BUSINESS_DATE);

    const unsettledBill = (await db.collection('bills').doc(data.unsettledBillId).get()).data()!;
    expect(unsettledBill.closeSummary?.unresolved).toBe(true);
    expect(unsettledBill.closeSnapshot?.unresolved).toBe(true);
    expect(unsettledBill.closeSummary?.lastCloseRunId).toBe(runId);

    const unsettledUser = (await db.collection('users').doc(data.userId).get()).data()!;
    expect(unsettledUser.unsettledBillsCount).toBe(1);

    const unsettledOnRun = await db
      .collection('storeMeta')
      .doc('closeRuns')
      .collection('runs')
      .doc(runId)
      .collection('unsettledBills')
      .doc(data.unsettledBillId)
      .get();
    expect(unsettledOnRun.exists).toBe(true);

    const attendance = (await db.collection('attendances').doc(data.attendanceId).get()).data()!;
    expect(attendance.closedStoreWithoutClockOut).toBe(true);

    const tn = (await db.collection('scheduledTournaments').doc('tn_close_force').get()).data()!;
    expect(tn.status).toBe('force_ended');

    const sideGame = (await db.collection('sideGame').doc(data.tableId).get()).data()!;
    expect(sideGame.active).toBe(false);
    expect(sideGame.seats?.seat01UserId ?? null).toBeNull();

    const table = (await db.collection('tables').doc(data.tableId).get()).data()!;
    expect(table.status).toBe('open');

    const stay = await db.collection('activeStays').doc(data.userId).get();
    expect(stay.exists).toBe(false);

    const marker = await db
      .collection('analyticsMonthly')
      .doc(BUSINESS_DATE.slice(0, 7))
      .collection('aggregationMarkers')
      .doc(data.settledBillId)
      .get();
    // migrate 経路は cycleNo 未指定のため markerId = billId
    expect(marker.exists).toBe(true);

    const stateAfterClose = (await db.collection('storeMeta').doc('currentBusinessDay').get()).data()!;
    expect(stateAfterClose.status).toBe('closed');
    expect(stateAfterClose.currentBusinessDateKey).toBeNull();
    expect(stateAfterClose.lastClosedBusinessDateKey).toBe(BUSINESS_DATE);
    expect(stateAfterClose.processing).toBeUndefined();

    const openResult = await (openStoreTerminal as any).run({
      auth: { uid: adminUid },
      data: { businessDateKey: NEXT_BUSINESS_DATE },
    });
    expect(openResult.success).toBe(true);

    const stateAfterOpen = (await db.collection('storeMeta').doc('currentBusinessDay').get()).data()!;
    expect(stateAfterOpen.status).toBe('running');
    expect(stateAfterOpen.currentBusinessDateKey).toBe(NEXT_BUSINESS_DATE);
    expect(stateAfterOpen.lastClosedBusinessDateKey).toBe(BUSINESS_DATE);

    // 前営業日の稼働残: stay 無し・SG inactive・table open
    expect((await db.collection('activeStays').get()).empty).toBe(true);
    expect((await db.collection('sideGame').doc(data.tableId).get()).data()?.active).toBe(false);
    expect((await db.collection('tables').doc(data.tableId).get()).data()?.status).toBe('open');
  });

  it('C-2: 保存済み途中状態（lastCompletedStep=resetSideGames）から同一 runId で resume', async () => {
    /**
     * 本物の例外注入ではない。
     * 正しく保存された途中状態を seed し、同一 runId で残り step を再開できることを確認する。
     */
    await seedRunningBusinessDay();
    const data = await seedOperatingData({ withTournament: false });

    const runId = `close_${BUSINESS_DATE}_resume_seed`;
    const now = Timestamp.now();
    const leaseExpiresAt = Timestamp.fromMillis(now.toMillis() + 120 * 1000);

    // 完了済み step の副作用を seed（UNSETTLED_MARK / unclocked / resetSideGames）
    await db.collection('bills').doc(data.unsettledBillId).set(
      {
        closeSnapshot: {
          unresolved: true,
          lastCloseRunId: runId,
          closedBusinessDate: BUSINESS_DATE,
          displayAmountAtMark: 0,
        },
        closeSummary: {
          unresolved: true,
          lastCloseRunId: runId,
        },
      },
      { merge: true },
    );

    await db.collection('attendances').doc(data.attendanceId).set(
      {
        closedStoreWithoutClockOut: true,
        closedAt: Timestamp.now(),
      },
      { merge: true },
    );

    await db.collection('sideGame').doc(data.tableId).set(
      {
        active: false,
        gameName: null,
        seats: {
          seat01UserId: null,
          seat01PokerName: null,
        },
        updatedAt: new Date(),
      },
      { merge: true },
    );

    // 未完了: table まだ in_use、activeStay 残存、settled 未 migrate
    await db.collection('tables').doc(data.tableId).set(
      { status: 'in_use', updatedAt: FieldValue.serverTimestamp() },
      { merge: true },
    );
    expect((await db.collection('activeStays').doc(data.userId).get()).exists).toBe(true);

    await db.collection('storeMeta').doc('closeRuns').collection('runs').doc(runId).set({
      status: 'running',
      closedBusinessDate: BUSINESS_DATE,
      forceClose: false,
      startedAt: now,
      lastCompletedStep: 'resetSideGames',
      failedStep: null,
      lastErrorSummary: null,
      unsettledCount: 1,
      updatedAt: FieldValue.serverTimestamp(),
    });

    await db
      .collection('storeMeta')
      .doc('closeRuns')
      .collection('runs')
      .doc(runId)
      .collection('unsettledBills')
      .doc(data.unsettledBillId)
      .set({ billId: data.unsettledBillId, updatedAt: FieldValue.serverTimestamp() });

    await db.collection('storeMeta').doc('currentBusinessDay').set(
      {
        processing: {
          runId,
          startedAt: now,
          leaseExpiresAt,
          kind: 'close',
        },
      },
      { merge: true },
    );

    const usersBefore = (await db.collection('users').doc(data.userId).get()).data();
    const unsettledCountBefore = usersBefore?.unsettledBillsCount ?? 0;

    const resumeResult = await (closeStoreTerminal as any).run({
      auth: { uid: adminUid },
      data: { runId },
    });
    expect(resumeResult.success).toBe(true);
    expect(resumeResult.runId).toBe(runId);

    const runSnap = await db
      .collection('storeMeta')
      .doc('closeRuns')
      .collection('runs')
      .doc(runId)
      .get();
    expect(runSnap.data()?.status).toBe('completed');
    expect(runSnap.data()?.lastCompletedStep).toBe('finalizeCloseStateDoc');

    // 残 step 結果
    expect((await db.collection('tables').doc(data.tableId).get()).data()?.status).toBe('open');
    expect((await db.collection('activeStays').doc(data.userId).get()).exists).toBe(false);

    const marker = await db
      .collection('analyticsMonthly')
      .doc(BUSINESS_DATE.slice(0, 7))
      .collection('aggregationMarkers')
      .doc(data.settledBillId)
      .get();
    expect(marker.exists).toBe(true);

    // 完了済み UNSETTLED_MARK の二重加算がない（count が増えていない）
    const usersAfter = (await db.collection('users').doc(data.userId).get()).data();
    expect(usersAfter?.unsettledBillsCount ?? 0).toBe(unsettledCountBefore);

    const state = (await db.collection('storeMeta').doc('currentBusinessDay').get()).data()!;
    expect(state.status).toBe('closed');
    expect(state.lastClosedBusinessDateKey).toBe(BUSINESS_DATE);
    expect(state.processing).toBeUndefined();

    // sideGame は既に reset 済みのまま（二重で壊さない）
    expect((await db.collection('sideGame').doc(data.tableId).get()).data()?.active).toBe(false);
  });
});
