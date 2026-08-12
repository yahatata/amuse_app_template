/**
 * P0: 正式入店 → 注文 → 会計 → settle の Callable 接続テスト
 *
 * 目的: manualCheckIn が生成した bill / activeStay を、placeOrder →
 * startAccounting → completeAccountingV2 → billsOnSettle がそのまま利用できること。
 *
 * 返金・追加徴収・着席は含めない（既存 suite / Scenario B へ委譲）。
 *
 * 前提: Firestore Emulator（localhost:8081）
 *   firebase emulators:exec --only firestore \
 *     'cd functions && npm test -- --runInBand a7/guest_checkout_callable_chain.spec.ts'
 */

import { initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import * as bcrypt from 'bcryptjs';
import * as admin from 'firebase-admin';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

import { startAccounting, completeAccountingV2 } from '../../src/domains/bills/callables/accounting';
import { billsOnSettle } from '../../src/domains/bills/triggers/billsOnSettle';
import { calculateA7PaymentSplit } from '../../src/domains/bills/services/a7PaymentSplit';
import { placeOrder } from '../../src/domains/itemOrder/callables/placeOrder';
import { setInitialUserBalances } from '../../src/domains/user/callables/setInitialUserBalances';
import { manualCheckIn } from '../../src/domains/user/callables/manualCheckIn';
import { validatePointConfigFromStoreConfig } from '../../src/shared/config/validatePointConfig';
import {
  a7E2EFlowStoreConfigDocument,
  seedA7E2EFlowStoreConfig,
} from '../helpers/a7StoreConfig';
import { __setMockConfig, __resetMockConfig } from '../helpers/mockStoreConfig';

/** setupFirebase / devicePermissions のモジュールロード時 getFirestore() と揃える */
const PROJECT_ID = 'test-default';
const BUSINESS_DATE = '2026-07-25';
const ITEM_PRICE = 2500;

describe('guest checkout callable chain (manualCheckIn → placeOrder → accounting → settle)', () => {
  let testEnv: RulesTestEnvironment;
  let db: admin.firestore.Firestore;

  const adminUid = 'admin_guest_checkout';
  const entryUid = 'term_entry_guest_checkout';
  const orderAcctUid = 'term_order_acct_guest_checkout';
  const customerUid = 'user_guest_checkout';
  const loginId = 'guestchk0725';
  const pin = '1234';
  const menuItemId = 'menu_guest_checkout_food';

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
    await seedA7E2EFlowStoreConfig(db);
    __setMockConfig(a7E2EFlowStoreConfigDocument());

    await db.collection('storeMeta').doc('currentBusinessDay').set({
      status: 'running',
      currentBusinessDateKey: BUSINESS_DATE,
      lastClosedBusinessDateKey: null,
      updatedAt: Timestamp.now(),
      source: 'test',
      lastError: null,
    });

    await db.collection('devices').doc('dev_admin_guest_checkout').set({
      uid: adminUid,
      role: 'admin',
      status: 'active',
      name: 'GuestCheckout Admin',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    await db.collection('devices').doc('dev_entry_guest_checkout').set({
      uid: entryUid,
      role: 'terminal',
      status: 'active',
      name: 'GuestCheckout Entry',
      options: { user_entry_exit: true },
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    await db.collection('devices').doc('dev_order_acct_guest_checkout').set({
      uid: orderAcctUid,
      role: 'terminal',
      status: 'active',
      name: 'GuestCheckout Order/Accounting',
      options: { order: true, accounting: true },
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    await db.collection('users').doc(customerUid).set({
      uid: customerUid,
      loginId,
      pokerName: 'GuestCheckoutPlayer',
      hashedPin: bcrypt.hashSync(pin, 10),
      role: 'user',
      userType: 'line',
      pointA: 0,
      pointB: 0,
      pointC: 0,
      pointD: 0,
      pointE: 0,
      sideGameChip: 0,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    await db.collection('menuItems').doc(menuItemId).set({
      name: 'GuestCheckout Food',
      category: 'Food',
      price: ITEM_PRICE,
      description: '',
      imageUrl: '',
      isArchive: false,
      isSoldOut: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  });

  afterEach(() => {
    __resetMockConfig();
  });

  function flowConfig() {
    return validatePointConfigFromStoreConfig(a7E2EFlowStoreConfigDocument() as any);
  }

  async function settleBillViaV2AndTrigger(billId: string, adminId: string) {
    const billRef = db.collection('bills').doc(billId);
    const beforeSnap = await billRef.get();
    const beforeData = beforeSnap.data()!;
    expect(beforeData.status).toBe('settling');

    await (completeAccountingV2 as any).run({
      auth: { uid: adminId },
      data: { billId },
    });

    const afterSnap = await billRef.get();
    const afterData = afterSnap.data()!;
    expect(afterData.status).toBe('settled');

    await (billsOnSettle as any).run({
      data: {
        before: {
          data: () => ({ ...beforeData, status: 'settling' }),
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
    });
  }

  it('manualCheckIn → placeOrder → startAccounting → completeAccountingV2 → billsOnSettle', async () => {
    // 1) 初期残高（正式 Callable。ユーザー本体は fixture seed）
    const initResult = await (setInitialUserBalances as any).run({
      auth: { uid: adminUid },
      data: {
        targetUserId: customerUid,
        balances: {
          pointA: 800,
          pointB: 50,
          pointC: 400,
          sideGameChip: 30,
        },
        confirmOverwrite: true,
        clientNonce: 'guest_checkout_init',
        note: 'guest_checkout_chain',
      },
    });
    expect(initResult.success).toBe(true);

    // 2) 正式入店
    const checkInResult = await (manualCheckIn as any).run({
      auth: { uid: entryUid },
      data: {
        loginId,
        pin,
        entranceFee: 0,
        entranceFeeDescription: 'guest_checkout',
        chargeEntranceFeeOnReentry: false,
      },
    });
    expect(checkInResult.success).toBe(true);
    const billId = checkInResult.data?.billId as string;
    expect(typeof billId).toBe('string');
    expect(billId.length).toBeGreaterThan(0);

    const staySnap = await db.collection('activeStays').doc(customerUid).get();
    expect(staySnap.exists).toBe(true);
    const stay = staySnap.data()!;
    expect(stay.isActive).toBe(true);
    expect(stay.billId).toBe(billId);

    const billAfterCheckIn = (await db.collection('bills').doc(billId).get()).data()!;
    expect(billAfterCheckIn.party?.userId).toBe(customerUid);
    expect(billAfterCheckIn.businessDate).toBe(BUSINESS_DATE);
    expect(['open', 'in_progress']).toContain(billAfterCheckIn.status);

    // 3) 注文（入店が作った billId をそのまま使用）
    const placeResult = await (placeOrder as any).run({
      auth: { uid: orderAcctUid },
      data: {
        billId,
        item: { menuItemId, quantity: 1 },
        clientNonce: 'guest_checkout_order_1',
      },
    });
    expect(placeResult.success).toBe(true);

    const itemsSnap = await db.collection('bills').doc(billId).collection('items').get();
    expect(itemsSnap.size).toBe(1);
    const itemDoc = itemsSnap.docs[0].data();
    const lineAmount =
      typeof itemDoc.amountIncl === 'number'
        ? itemDoc.amountIncl
        : (itemDoc.unitPriceIncl ?? itemDoc.price) * (itemDoc.quantity ?? 1);
    expect(lineAmount).toBe(ITEM_PRICE);

    const billAfterOrder = (await db.collection('bills').doc(billId).get()).data()!;
    expect(billAfterOrder.businessDate).toBe(BUSINESS_DATE);

    // orders/{YYYYMMDD}/_TodaysOrders/{itemId} — キーは bill.businessDate 由来
    const expectedTodaysKey = String(billAfterOrder.businessDate).replace(/-/g, '');
    expect(expectedTodaysKey).toBe('20260725');
    const wallClockKey = (() => {
      const d = new Date();
      const jst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
      return (
        `${jst.getUTCFullYear()}` +
        `${String(jst.getUTCMonth() + 1).padStart(2, '0')}` +
        `${String(jst.getUTCDate()).padStart(2, '0')}`
      );
    })();

    const orderItemId = placeResult.data?.itemId as string;
    expect(typeof orderItemId).toBe('string');
    const todaysOrderDoc = await db
      .collection('orders')
      .doc(expectedTodaysKey)
      .collection('_TodaysOrders')
      .doc(orderItemId)
      .get();
    expect(todaysOrderDoc.exists).toBe(true);
    expect(todaysOrderDoc.data()?.billId).toBe(billId);
    expect(todaysOrderDoc.data()?.menuItemId).toBe(menuItemId);
    if (wallClockKey !== expectedTodaysKey) {
      const wrongClockDoc = await db
        .collection('orders')
        .doc(wallClockKey)
        .collection('_TodaysOrders')
        .doc(orderItemId)
        .get();
      expect(wrongClockDoc.exists).toBe(false);
    }

    // 4) 会計開始（A-7 ByCategory）
    const cfg = flowConfig();
    const expectedSplit = calculateA7PaymentSplit({
      selectedBaseMethod: 'cash',
      bill: {
        extraCost: 0,
        sideGameChip: 0,
        tournaments: 0,
        items: ITEM_PRICE,
      },
      balances: {
        pointA: 800,
        pointB: 50,
        pointC: 400,
        pointD: 0,
        pointE: 0,
        sideGameChip: 30,
      },
      pointPriority: cfg.pointPriority,
      categoryPaymentMethods: cfg.categoryPaymentMethods,
      categoryOrder: cfg.categoryOrder,
      balancePaymentSettings: cfg.balancePaymentSettings,
    });

    const startResult = await (startAccounting as any).run({
      auth: { uid: orderAcctUid },
      data: {
        billId,
        clientNonce: 'guest_checkout_acct',
        accountingMode: 'auto',
        selectedBaseMethod: 'cash',
        paymentMethodsByCategory: expectedSplit.paymentMethodsByCategory,
        paymentMethodsByAmount: expectedSplit.paymentMethodsByAmount,
      },
    });
    expect(startResult.success).toBe(true);
    expect(startResult.status).toBe('settling');

    let bill = (await db.collection('bills').doc(billId).get()).data()!;
    expect(bill.status).toBe('settling');
    expect(bill.meta?.paymentMethodsByCategory).toBeDefined();
    expect(bill.meta?.paymentMethodsByAmount).toEqual(expectedSplit.paymentMethodsByAmount);
    expect(bill.draftAccountingInput || bill.meta).toBeDefined();
    expect(bill.meta?.paymentMethodDetails?.pointA).toMatchObject({
      referenceAmount: 800,
      balanceAmount: 800,
      conversion: { referenceUnits: 1, balanceUnits: 1 },
    });
    expect(bill.meta?.paymentMethodDetails?.pointB).toMatchObject({
      referenceAmount: 500,
      balanceAmount: 50,
      conversion: { referenceUnits: 10, balanceUnits: 1 },
    });
    expect(bill.meta?.paymentMethodDetails?.sideGameChip).toMatchObject({
      referenceAmount: 300,
      balanceAmount: 30,
      conversion: { referenceUnits: 10, balanceUnits: 1 },
    });

    const userAfterPay = (await db.collection('users').doc(customerUid).get()).data()!;
    expect(userAfterPay.pointA).toBe(0);
    expect(userAfterPay.pointB).toBe(0);
    expect(userAfterPay.sideGameChip).toBe(0);
    expect(userAfterPay.pointC).toBe(400);

    // 5) settle（既存 E2E と同じ: V2 + trigger 手動発火）
    await settleBillViaV2AndTrigger(billId, adminUid);

    bill = (await db.collection('bills').doc(billId).get()).data()!;
    expect(bill.status).toBe('settled');
    expect(bill.amounts).toBeDefined();
    expect(bill.amounts?.grandTotalRounded).toBe(ITEM_PRICE);
    expect(bill.meta?.contentHash).toBeDefined();
    expect(typeof bill.meta.contentHash).toBe('string');
    expect(bill.meta.contentHash.length).toBeGreaterThan(0);
    expect(bill.settlementSnapshot?.amounts?.grandTotalRounded).toBe(ITEM_PRICE);
    expect(bill.paymentTotals).toEqual(expectedSplit.paymentMethodsByAmount);
    expect(bill.meta.paymentMethodsByCategory).toEqual(expectedSplit.paymentMethodsByCategory);

    const cycleSnap = await db
      .collection('bills')
      .doc(billId)
      .collection('settlementCycles')
      .doc('1')
      .get();
    expect(cycleSnap.exists).toBe(true);

    const stayAfter = (await db.collection('activeStays').doc(customerUid).get()).data()!;
    expect(stayAfter.isActive).toBe(false);

    const pointLogs = await db.collection('users').doc(customerUid).collection('pointLogs').get();
    expect(pointLogs.size).toBeGreaterThanOrEqual(1);

    // 二重 settle（同一 contentHash）で破壊的更新しない
    const contentHash = bill.meta.contentHash;
    const paymentTotals = { ...bill.paymentTotals };
    await (billsOnSettle as any).run({
      data: {
        before: {
          data: () => ({ ...bill, status: 'settling' }),
          ref: db.collection('bills').doc(billId),
          exists: true,
        },
        after: {
          data: () => bill,
          ref: db.collection('bills').doc(billId),
          exists: true,
        },
      },
      params: { billId },
    });
    const billAfterReplay = (await db.collection('bills').doc(billId).get()).data()!;
    expect(billAfterReplay.meta.contentHash).toBe(contentHash);
    expect(billAfterReplay.paymentTotals).toEqual(paymentTotals);
  });
});
