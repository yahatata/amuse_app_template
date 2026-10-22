/**
 * P0: completeAccountingV2 二重実行の Callable 境界テスト
 *
 * - 1回目で settled になる
 * - 2回目は ACCOUNTING_ALREADY_SETTLED（現行メッセージ）で拒否
 * - 2回目で金額・残高・activeStay・関連件数が変わらない
 *
 * 前提: Firestore Emulator
 */

import { initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import * as admin from 'firebase-admin';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

import {
  startAccounting,
  completeAccountingV2,
} from '../../src/domains/bills/callables/accounting';
import { createBillWithActiveStay } from '../../src/domains/bills/repos/createBillWithActiveStay';
import { appendItem } from '../../src/domains/bills/repos/appendItem';
import { a7StoreConfigDocument, seedA7StoreConfig } from '../helpers/a7StoreConfig';
import { __setMockConfig, __resetMockConfig } from '../helpers/mockStoreConfig';

const PROJECT_ID = 'test-default';
const BUSINESS_DATE = '2026-07-25';
const ITEM_PRICE = 1000;

describe('completeAccountingV2 double settle (callable boundary)', () => {
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
    delete process.env.WRITE_TODAYS_BILLS_IN_PARALLEL;
    await seedA7StoreConfig(db);
    __setMockConfig(a7StoreConfigDocument());
    await db.collection('storeMeta').doc('currentBusinessDay').set({
      status: 'running',
      currentBusinessDateKey: BUSINESS_DATE,
      lastClosedBusinessDateKey: null,
      updatedAt: Timestamp.now(),
      source: 'test',
      lastError: null,
    });
  });

  afterEach(() => {
    __resetMockConfig();
  });

  async function seedAdmin(uid: string) {
    await db.collection('devices').doc(`dev_${uid}`).set({
      uid,
      role: 'admin',
      status: 'active',
      name: 'DoubleSettle Admin',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }

  async function seedUser(userId: string) {
    await db.collection('users').doc(userId).set({
      uid: userId,
      pokerName: 'DoubleSettleUser',
      userType: 'line',
      pointA: 5000,
      pointB: 0,
      pointC: 0,
      pointD: 0,
      pointE: 0,
      sideGameChip: 0,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }

  async function seedMenu(menuItemId: string) {
    await db.collection('menuItems').doc(menuItemId).set({
      name: 'DoubleSettle Drink',
      category: 'drink',
      price: ITEM_PRICE,
      description: '',
      imageUrl: '',
      isArchive: false,
      isSoldOut: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }

  function businessSnapshot(data: Record<string, any> | undefined) {
    if (!data) return null;
    return {
      status: data.status ?? null,
      businessDate: data.businessDate ?? null,
      amounts: data.amounts ?? null,
      paymentTotals: data.paymentTotals ?? null,
      metaPaymentByAmount: data.meta?.paymentMethodsByAmount ?? null,
      metaPaymentByCategory: data.meta?.paymentMethodsByCategory ?? null,
      opsCompletedBy: data.ops?.accountingCompletedBy ?? null,
      partyUserId: data.party?.userId ?? null,
    };
  }

  function userBalanceSnapshot(data: Record<string, any> | undefined) {
    if (!data) return null;
    return {
      pointA: data.pointA ?? 0,
      pointB: data.pointB ?? 0,
      pointC: data.pointC ?? 0,
      pointD: data.pointD ?? 0,
      pointE: data.pointE ?? 0,
      sideGameChip: data.sideGameChip ?? 0,
    };
  }

  it('1回目 settle 成功 → 2回目は ACCOUNTING_ALREADY_SETTLED でデータ不変', async () => {
    const adminId = 'admin_double_settle';
    const userId = 'user_double_settle';
    const billId = 'bill_double_settle';
    const menuItemId = 'menu_double_settle';

    await seedAdmin(adminId);
    await seedUser(userId);
    await seedMenu(menuItemId);
    await createBillWithActiveStay({
      billId,
      userId,
      pokerName: 'DoubleSettleUser',
      idempotencyKey: 'idem_double_settle_checkin',
    });
    await appendItem({
      billId,
      item: {
        menuItemId,
        quantity: 1,
        clientNonce: 'nonce_double_settle_item',
      },
      idempotencyKey: `${billId}:appendItem:nonce_double_settle_item`,
    });

    const startResult = await (startAccounting as any).run({
      auth: { uid: adminId },
      data: {
        billId,
        clientNonce: 'nonce_double_settle_start',
        accountingMode: 'custom',
        paymentMethodsByCategory: { items: 'cash' },
        paymentMethodsByAmount: { cash: ITEM_PRICE },
      },
    });
    expect(startResult.success).toBe(true);

    const first = await (completeAccountingV2 as any).run({
      auth: { uid: adminId },
      data: { billId },
    });
    expect(first.success).toBe(true);

    const billRef = db.collection('bills').doc(billId);
    const userRef = db.collection('users').doc(userId);
    const stayRef = db.collection('activeStays').doc(userId);

    const billAfterFirst = (await billRef.get()).data()!;
    expect(billAfterFirst.status).toBe('settled');

    const staySnapBefore = await stayRef.get();
    const beforeSecond = {
      bill: businessSnapshot(billAfterFirst),
      user: userBalanceSnapshot((await userRef.get()).data()),
      stay: staySnapBefore.exists
        ? {
            exists: true,
            isActive: staySnapBefore.data()?.isActive ?? null,
            billId: staySnapBefore.data()?.billId ?? null,
          }
        : { exists: false, isActive: null, billId: null },
      paymentsCount: (await db.collection('payments').where('billId', '==', billId).get()).size,
      billEventsCount: (await billRef.collection('events').get()).size,
      billLogsCount: (await billRef.collection('logs').get()).size,
      accountingHistoryCount: (
        await db.collection('accountingHistory').where('billId', '==', billId).get()
      ).size,
    };

    const logOpsModule = await import('../../src/shared/logging/logOpsError');
    const logOpsErrorSpy = jest
      .spyOn(logOpsModule, 'logOpsError')
      .mockImplementation(() => undefined);

    let secondError: any;
    try {
      await (completeAccountingV2 as any).run({
        auth: { uid: adminId },
        data: { billId },
      });
      fail('2回目 completeAccountingV2 は失敗するべき');
    } catch (e: any) {
      secondError = e;
    }

    expect(secondError.code).toBe('failed-precondition');
    expect(secondError.message).toBe('この請求書は既に会計済みです');
    expect(String(secondError.message)).not.toMatch(/stack|Error:|\/Users\/|functions\/src/i);
    expect(secondError.details?.errorKey).toBe('ACCOUNTING_ALREADY_SETTLED');
    expect(secondError.details?.context).toEqual(
      expect.objectContaining({
        billId,
        currentStatus: 'settled',
      }),
    );

    const matchingLog = logOpsErrorSpy.mock.calls.find((call) => {
      const arg = call[0] as {
        functionEntry?: string;
        operation?: string;
        cause?: { errorKey?: string };
      };
      return (
        arg?.functionEntry === 'completeAccountingV2' &&
        arg?.operation === 'completeAccountingV2Catch' &&
        arg?.cause?.errorKey === 'ACCOUNTING_ALREADY_SETTLED'
      );
    });
    expect(matchingLog).toBeDefined();
    expect(
      logOpsErrorSpy.mock.calls.filter((call) => {
        const arg = call[0] as { functionEntry?: string };
        return arg?.functionEntry === 'completeAccountingV2';
      }).length,
    ).toBe(1);
    logOpsErrorSpy.mockRestore();

    const billAfterSecond = (await billRef.get()).data()!;
    expect(businessSnapshot(billAfterSecond)).toEqual(beforeSecond.bill);
    expect(userBalanceSnapshot((await userRef.get()).data())).toEqual(beforeSecond.user);

    const stayAfter = await stayRef.get();
    expect({
      exists: stayAfter.exists,
      isActive: stayAfter.data()?.isActive ?? null,
      billId: stayAfter.data()?.billId ?? null,
    }).toEqual(beforeSecond.stay);

    expect((await db.collection('payments').where('billId', '==', billId).get()).size).toBe(
      beforeSecond.paymentsCount,
    );
    expect((await billRef.collection('events').get()).size).toBe(beforeSecond.billEventsCount);
    expect((await billRef.collection('logs').get()).size).toBe(beforeSecond.billLogsCount);
    expect(
      (await db.collection('accountingHistory').where('billId', '==', billId).get()).size,
    ).toBe(beforeSecond.accountingHistoryCount);
  });
});
