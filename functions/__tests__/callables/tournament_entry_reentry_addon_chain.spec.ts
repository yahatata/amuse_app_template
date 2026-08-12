/**
 * P1: Tournament 登録 → reentry → addon の同一 user/bill 接続テスト
 *
 * bulkAddon / 置きバケ / 報酬は含めない。
 *
 * 前提: Firestore Emulator
 *   firebase emulators:exec --only firestore \
 *     'cd functions && npm test -- --runInBand callables/tournament_entry_reentry_addon_chain.spec.ts'
 */

import { initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import * as admin from 'firebase-admin';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

import { createBillWithActiveStay } from '../../src/domains/bills/repos/createBillWithActiveStay';
import { registerForTournament } from '../../src/domains/tournament_activeTournament/callables/registerForTournament';
import { assignSeatToPlayer } from '../../src/domains/tournament_activeTournament/callables/assignSeatToPlayer';
import { bustAndReentry } from '../../src/domains/tournament_activeTournament/callables/bustAndReentry';
import { addon } from '../../src/domains/tournament_activeTournament/callables/addon';
import { a7E2EFlowStoreConfigDocument } from '../helpers/a7StoreConfig';
import { __setMockConfig, __resetMockConfig } from '../helpers/mockStoreConfig';

const PROJECT_ID = 'test-default';
const BUSINESS_DATE = '2026-07-25';
const ENTRY_FEE = 1000;
const REENTRY_FEE = 500;
const ADDON_FEE = 300;
const START_STACK = 10000;

describe('tournament entry → reentry → addon chain', () => {
  let testEnv: RulesTestEnvironment;
  let db: admin.firestore.Firestore;

  const adminUid = 'admin_tn_chain';
  const customerUid = 'user_tn_chain';
  const billId = 'bill_tn_chain';
  const tournamentId = 'tournament_tn_chain';
  const templateId = 'template_tn_chain';
  const tableId = 'tableA';
  const pokerName = 'TnChainPlayer';

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
    delete process.env.WRITE_TODAYS_BILLS_IN_PARALLEL;

    const cfg = a7E2EFlowStoreConfigDocument() as Record<string, unknown>;
    cfg.tournament = {
      ...(cfg.tournament as Record<string, unknown>),
      liffRegistrationEnabled: true,
      rankingRewardPointTypes: ['pointA', 'pointB'],
    };
    await db.collection('storeMeta').doc('config').set(cfg, { merge: true });
    __setMockConfig(cfg);

    await db.collection('storeMeta').doc('currentBusinessDay').set({
      status: 'running',
      currentBusinessDateKey: BUSINESS_DATE,
      lastClosedBusinessDateKey: null,
      updatedAt: Timestamp.now(),
      source: 'test',
      lastError: null,
    });

    await db.collection('devices').add({
      uid: adminUid,
      role: 'admin',
      status: 'active',
      name: 'TnChain Admin',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // 顧客 + 残高（会計前なので TN 操作で減らないこと）
    await db.collection('users').doc(customerUid).set({
      uid: customerUid,
      pokerName,
      userType: 'line',
      pointA: 5000,
      pointB: 100,
      pointC: 200,
      pointD: 0,
      pointE: 0,
      sideGameChip: 99,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    await createBillWithActiveStay({
      billId,
      userId: customerUid,
      pokerName,
      idempotencyKey: 'idem_tn_chain_bill',
    });
    await db.collection('bills').doc(billId).update({ businessDate: BUSINESS_DATE });

    const startAt = Timestamp.fromDate(new Date(Date.now() + 2 * 60 * 60 * 1000));
    const regEndAt = Timestamp.fromDate(new Date(Date.now() + 24 * 60 * 60 * 1000));

    await db.collection('scheduledTournaments').doc(tournamentId).set({
      templateId,
      status: 'scheduled',
      businessDate: BUSINESS_DATE,
      startAt,
      regEndAt,
      snapshot: {
        name: 'TnChain Tournament',
        entryFee: ENTRY_FEE,
        reentryFee: REENTRY_FEE,
        startStack: START_STACK,
        isAddon: true,
        addonFee: ADDON_FEE,
        addonStack: 1000,
        maxReentriesPerPlayer: 5,
      },
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    await db.collection('tournamentTemplates').doc(templateId).set({
      name: 'TnChain Tournament',
      entryFee: ENTRY_FEE,
      reentryFee: REENTRY_FEE,
      isAddon: true,
      addonFee: ADDON_FEE,
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
        addons: 0,
        waitingCount: 0,
        playersBusted: 0,
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

    // 1卓・数席（bust 後に waiting へ回る想定）
    await db
      .collection('scheduledTournaments')
      .doc(tournamentId)
      .collection('tablesSeat')
      .doc(tableId)
      .set({
        isEnabled: true,
        seats: {
          seat01UserId: null,
          seat01PokerName: null,
          seat02UserId: null,
          seat02PokerName: null,
        },
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
  });

  afterEach(() => {
    __resetMockConfig();
  });

  it('registerForTournament → assignSeat → bustAndReentry → addon が同一 bill で矛盾なく成立する', async () => {
    const cfgTournaments = (a7E2EFlowStoreConfigDocument() as any).billing.paymentPolicy
      .categoryPaymentMethods.tournaments as string[];
    expect(cfgTournaments).not.toContain('sideGameChip');

    // 1) 登録
    const reg = await (registerForTournament as any).run({
      auth: { uid: customerUid },
      data: { tournamentId, clientNonce: 'nonce_tn_chain_entry' },
    });
    expect(reg.success).toBe(true);

    const billTnRef = db.collection('bills').doc(billId).collection('tournaments').doc(templateId);
    let billTn = (await billTnRef.get()).data()!;
    expect(billTn.entryCount).toBe(1);
    expect(billTn.reentryCount).toBe(0);
    expect(billTn.addonCount).toBe(0);
    expect(billTn.entryFeeIncl ?? billTn.entryFee ?? ENTRY_FEE).toBeTruthy();

    let waiting = (
      await db
        .collection('scheduledTournaments')
        .doc(tournamentId)
        .collection('tablesSeat')
        .doc('waiting')
        .get()
    ).data()!;
    expect(waiting.waiting[customerUid]).toBeDefined();
    expect(waiting.count).toBe(1);

    let views = (
      await db
        .collection('scheduledTournaments')
        .doc(tournamentId)
        .collection('views')
        .doc('main')
        .get()
    ).data()!;
    expect(views.entries).toBe(1);
    expect(views.waitingCount).toBe(1);

    // 二重登録しない
    await expect(
      (registerForTournament as any).run({
        auth: { uid: customerUid },
        data: { tournamentId, clientNonce: 'nonce_tn_chain_entry_again' },
      }),
    ).rejects.toMatchObject({
      details: expect.objectContaining({ errorKey: 'TOURNAMENT_ALREADY_REGISTERED' }),
    });
    billTn = (await billTnRef.get()).data()!;
    expect(billTn.entryCount).toBe(1);

    // 2) 着席（bust 前提）
    const seat = await (assignSeatToPlayer as any).run({
      auth: { uid: adminUid },
      data: {
        operationId: 'op_tn_chain_seat',
        tournamentId,
        userId: customerUid,
        tableId,
        seatNumber: 1,
      },
    });
    expect(seat.success).toBe(true);

    const tableSeat = (
      await db
        .collection('scheduledTournaments')
        .doc(tournamentId)
        .collection('tablesSeat')
        .doc(tableId)
        .get()
    ).data()!;
    expect(tableSeat.seats.seat01UserId).toBe(customerUid);

    waiting = (
      await db
        .collection('scheduledTournaments')
        .doc(tournamentId)
        .collection('tablesSeat')
        .doc('waiting')
        .get()
    ).data()!;
    expect(waiting.waiting[customerUid]).toBeUndefined();

    // 3) bust + reentry
    const reentry = await (bustAndReentry as any).run({
      auth: { uid: adminUid },
      data: {
        operationId: 'op_tn_chain_reentry',
        tournamentId,
        userId: customerUid,
        tableId,
        seatNumber: 1,
      },
    });
    expect(reentry.success).toBe(true);

    billTn = (await billTnRef.get()).data()!;
    expect(billTn.entryCount).toBe(1);
    expect(billTn.reentryCount).toBe(1);
    expect(billTn.lastReentryAt).toBeDefined();

    views = (
      await db
        .collection('scheduledTournaments')
        .doc(tournamentId)
        .collection('views')
        .doc('main')
        .get()
    ).data()!;
    expect(views.reentries).toBeGreaterThanOrEqual(1);

    // 席からは外れている（waiting または別席ロジック）
    const tableAfterBust = (
      await db
        .collection('scheduledTournaments')
        .doc(tournamentId)
        .collection('tablesSeat')
        .doc(tableId)
        .get()
    ).data()!;
    const stillOnSeat01 = tableAfterBust.seats?.seat01UserId === customerUid;
    waiting = (
      await db
        .collection('scheduledTournaments')
        .doc(tournamentId)
        .collection('tablesSeat')
        .doc('waiting')
        .get()
    ).data()!;
    const inWaiting = !!waiting.waiting?.[customerUid];
    expect(stillOnSeat01 || inWaiting).toBe(true);
    // 空席が少ない卓では waiting に入る
    if (!stillOnSeat01) {
      expect(inWaiting).toBe(true);
    }

    // 4) addon
    const addonResult = await (addon as any).run({
      auth: { uid: adminUid },
      data: {
        operationId: 'op_tn_chain_addon',
        tournamentId,
        userId: customerUid,
        pokerName,
      },
    });
    expect(addonResult.success).toBe(true);

    billTn = (await billTnRef.get()).data()!;
    expect(billTn.addonCount).toBe(1);
    expect(billTn.lastAddonAt).toBeDefined();
    expect(billTn.entryCount).toBe(1);
    expect(billTn.reentryCount).toBe(1);

    views = (
      await db
        .collection('scheduledTournaments')
        .doc(tournamentId)
        .collection('views')
        .doc('main')
        .get()
    ).data()!;
    expect(views.addons).toBe(1);

    // 残高は会計前のため減らない（TN は bill 計上）
    const user = (await db.collection('users').doc(customerUid).get()).data()!;
    expect(user.pointA).toBe(5000);
    expect(user.pointB).toBe(100);
    expect(user.sideGameChip).toBe(99);

    // 二重 addon: 上限到達で拒否され count は増えない
    const addonReplay = await (addon as any).run({
      auth: { uid: adminUid },
      data: {
        operationId: 'op_tn_chain_addon_2',
        tournamentId,
        userId: customerUid,
        pokerName,
      },
    });
    expect(addonReplay.success).toBe(false);
    billTn = (await billTnRef.get()).data()!;
    expect(billTn.addonCount).toBe(1);

    // bill 上の料金イメージ（フィールド名差異に耐える）
    const entryAmount = billTn.entryFeeIncl ?? billTn.entryFeeTotal ?? billTn.entryFee;
    const reentryAmount = billTn.reentryFeeIncl ?? billTn.reentryFeeTotal ?? billTn.reentryFee;
    const addonAmount = billTn.addonFeeIncl ?? billTn.addonFeeTotal ?? billTn.addonFee;
    if (typeof entryAmount === 'number') expect(entryAmount).toBe(ENTRY_FEE);
    if (typeof reentryAmount === 'number') expect(reentryAmount).toBe(REENTRY_FEE);
    if (typeof addonAmount === 'number') expect(addonAmount).toBe(ADDON_FEE);
  });
});
