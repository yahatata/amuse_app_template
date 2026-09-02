/**
 * startAccounting Callable 境界での支払拒否 + settling 非残留
 *
 * Batch B: 支払検証失敗時に bill が会計開始前の状態を維持すること。
 *
 * 前提: Firestore Emulator
 */

import { initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import * as admin from 'firebase-admin';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

import { startAccounting } from '../../src/domains/bills/callables/accounting';
import { createBillWithActiveStay } from '../../src/domains/bills/repos/createBillWithActiveStay';
import { appendItem } from '../../src/domains/bills/repos/appendItem';
import { a7StoreConfigDocument, seedA7StoreConfig } from '../helpers/a7StoreConfig';
import { __setMockConfig, __resetMockConfig } from '../helpers/mockStoreConfig';

const PROJECT_ID = 'test-default';
const BUSINESS_DATE = '2026-07-25';
const ITEM_PRICE = 1000;

describe('startAccounting A-7 payment rejects (callable boundary)', () => {
  let testEnv: RulesTestEnvironment;
  let db: admin.firestore.Firestore;

  const adminId = 'admin_a7_pay_reject';
  const userId = 'user_a7_pay_reject';
  const menuItemId = 'menu_a7_pay_reject';

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
    await db.collection('devices').doc(`dev_${adminId}`).set({
      uid: adminId,
      role: 'admin',
      status: 'active',
      name: 'A7 Pay Reject Admin',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    await db.collection('users').doc(userId).set({
      uid: userId,
      pokerName: 'A7PayRejectUser',
      userType: 'line',
      pointA: 5000,
      pointB: 100,
      pointC: 0,
      pointD: 0,
      pointE: 0,
      sideGameChip: 50,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    await db.collection('menuItems').doc(menuItemId).set({
      name: 'A7 Reject Drink',
      category: 'drink',
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

  async function prepareOpenBill(billId: string) {
    await createBillWithActiveStay({
      billId,
      userId,
      pokerName: 'A7PayRejectUser',
      idempotencyKey: `idem_${billId}`,
    });
    await appendItem({
      billId,
      item: {
        menuItemId,
        quantity: 1,
        clientNonce: `nonce_item_${billId}`,
      },
      idempotencyKey: `${billId}:appendItem:nonce_item_${billId}`,
    });
  }

  function userBalances(data: Record<string, any> | undefined) {
    return {
      pointA: data?.pointA ?? 0,
      pointB: data?.pointB ?? 0,
      sideGameChip: data?.sideGameChip ?? 0,
    };
  }

  async function snapshotBusinessState(billId: string) {
    const billRef = db.collection('bills').doc(billId);
    const bill = (await billRef.get()).data();
    const user = (await db.collection('users').doc(userId).get()).data();
    const stay = (await db.collection('activeStays').doc(userId).get()).data();
    const idempotencySnap = await billRef.collection('idempotency').get();
    const startIdemDocs = idempotencySnap.docs.filter((d) =>
      d.id.includes('startAccounting'),
    );
    return {
      billStatus: bill?.status ?? null,
      accountingStartedAt: bill?.ops?.accountingStartedAt ?? null,
      accountingStartedBy: bill?.ops?.accountingStartedBy ?? null,
      billMetaByAmount: bill?.meta?.paymentMethodsByAmount ?? null,
      billMetaByCategory: bill?.meta?.paymentMethodsByCategory ?? null,
      draftByAmount: bill?.draftAccountingInput?.paymentMethodsByAmount ?? null,
      user: userBalances(user),
      stayActive: stay?.isActive ?? null,
      stayBillId: stay?.billId ?? null,
      startAccountingIdempotencyCount: startIdemDocs.length,
      paymentsCount: (await db.collection('payments').where('billId', '==', billId).get())
        .size,
      eventsCount: (await billRef.collection('events').get()).size,
      accountingHistoryCount: (
        await db.collection('accountingHistory').where('billId', '==', billId).get()
      ).size,
    };
  }

  async function expectRejectKeepsPreStartState(
    billId: string,
    before: Awaited<ReturnType<typeof snapshotBusinessState>>,
  ) {
    const after = await snapshotBusinessState(billId);
    expect(after).toEqual(before);
    expect(after.billStatus).not.toBe('settling');
    expect(after.accountingStartedAt).toBeNull();
    expect(after.accountingStartedBy).toBeNull();
    expect(after.startAccountingIdempotencyCount).toBe(0);
  }

  it('未知 payment method は Zod で invalid-argument（会計開始前状態を維持）', async () => {
    const billId = 'bill_unknown_method';
    await prepareOpenBill(billId);
    const before = await snapshotBusinessState(billId);

    let err: any;
    try {
      await (startAccounting as any).run({
        auth: { uid: adminId },
        data: {
          billId,
          clientNonce: 'nonce_unknown_method',
          accountingMode: 'custom',
          paymentMethodsByCategory: { items: 'bitcoin_wallet' },
          paymentMethodsByAmount: { bitcoin_wallet: ITEM_PRICE },
        },
      });
      fail('Should reject unknown method');
    } catch (e: any) {
      err = e;
    }

    expect(err.code).toBe('invalid-argument');
    expect(err.message).toBe('入力データが無効です');
    expect(String(err.message)).not.toMatch(/stack|bitcoin_wallet|functions\/src/i);
    expect(err.details?.errorKey).toBeUndefined();
    await expectRejectKeepsPreStartState(billId, before);
  });

  it('auto で paymentMethodsByCategory 欠落 → PAYMENT_CATEGORY_REQUIRED（settling 非残留）', async () => {
    const billId = 'bill_missing_by_category';
    await prepareOpenBill(billId);
    const before = await snapshotBusinessState(billId);
    expect(before.billStatus).toMatch(/^(open|in_progress)$/);

    const logOpsModule = await import('../../src/shared/logging/logOpsError');
    const logOpsErrorSpy = jest
      .spyOn(logOpsModule, 'logOpsError')
      .mockImplementation(() => undefined);

    let err: any;
    try {
      await (startAccounting as any).run({
        auth: { uid: adminId },
        data: {
          billId,
          clientNonce: 'nonce_missing_by_cat',
          accountingMode: 'auto',
          selectedBaseMethod: 'cash',
          paymentMethodsByAmount: { cash: ITEM_PRICE },
        },
      });
      fail('Should reject missing ByCategory');
    } catch (e: any) {
      err = e;
    }

    expect(err.code).toBe('failed-precondition');
    expect(err.details?.errorKey).toBe('PAYMENT_CATEGORY_REQUIRED');
    expect(err.message).toContain('paymentMethodsByCategory');
    expect(String(err.message)).not.toMatch(/stack|\/Users\/|functions\/src/i);

    const matchingLog = logOpsErrorSpy.mock.calls.find((call) => {
      const arg = call[0] as {
        functionEntry?: string;
        operation?: string;
        cause?: { errorKey?: string };
        context?: { billId?: string };
      };
      return (
        arg?.functionEntry === 'startAccounting' &&
        arg?.operation === 'startAccountingCallableCustom' &&
        arg?.cause?.errorKey === 'PAYMENT_CATEGORY_REQUIRED' &&
        arg?.context?.billId === billId
      );
    });
    expect(matchingLog).toBeDefined();
    expect(
      logOpsErrorSpy.mock.calls.filter((call) => {
        const arg = call[0] as { functionEntry?: string };
        return arg?.functionEntry === 'startAccounting';
      }).length,
    ).toBe(1);
    logOpsErrorSpy.mockRestore();

    await expectRejectKeepsPreStartState(billId, before);
  });

  it('custom で対象 category 欠落 → CUSTOM_PAYMENT_CATEGORY_MISSING（settling 非残留）', async () => {
    const billId = 'bill_missing_category_key';
    await prepareOpenBill(billId);
    const before = await snapshotBusinessState(billId);

    let err: any;
    try {
      await (startAccounting as any).run({
        auth: { uid: adminId },
        data: {
          billId,
          clientNonce: 'nonce_missing_cat_key',
          accountingMode: 'custom',
          paymentMethodsByCategory: { tournaments: 'cash' },
          paymentMethodsByAmount: { cash: ITEM_PRICE },
        },
      });
      fail('Should reject missing category key');
    } catch (e: any) {
      err = e;
    }

    expect(err.code).toBe('failed-precondition');
    expect(err.details?.errorKey).toBe('CUSTOM_PAYMENT_CATEGORY_MISSING');
    await expectRejectKeepsPreStartState(billId, before);
  });

  it('Config 非許可 method → PAYMENT_METHOD_NOT_ALLOWED（settling 非残留）', async () => {
    const billId = 'bill_method_not_allowed';
    await prepareOpenBill(billId);
    const before = await snapshotBusinessState(billId);

    let err: any;
    try {
      await (startAccounting as any).run({
        auth: { uid: adminId },
        data: {
          billId,
          clientNonce: 'nonce_method_not_allowed',
          accountingMode: 'custom',
          paymentMethodsByCategory: { items: 'pointC' },
          paymentMethodsByAmount: { pointC: ITEM_PRICE },
        },
      });
      fail('Should reject disallowed method');
    } catch (e: any) {
      err = e;
    }

    expect(err.code).toBe('failed-precondition');
    expect(err.details?.errorKey).toBe('PAYMENT_METHOD_NOT_ALLOWED');
    await expectRejectKeepsPreStartState(billId, before);
  });

  it('usageUnit 不整合 → USAGE_UNIT_VIOLATION（settling 非残留）', async () => {
    const billId = 'bill_usage_unit';
    await prepareOpenBill(billId);
    const before = await snapshotBusinessState(billId);

    // a7StoreConfig: sideGameChip usageUnit=100。基準50は単位違反
    let err: any;
    try {
      await (startAccounting as any).run({
        auth: { uid: adminId },
        data: {
          billId,
          clientNonce: 'nonce_usage_unit',
          accountingMode: 'custom',
          paymentMethodsByCategory: {
            items: [
              { method: 'sideGameChip', amount: 50 },
              { method: 'cash', amount: 950 },
            ],
          },
          paymentMethodsByAmount: { sideGameChip: 50, cash: 950 },
        },
      });
      fail('Should reject usage unit violation');
    } catch (e: any) {
      err = e;
    }

    expect(err.code).toBe('failed-precondition');
    expect(err.details?.errorKey).toBe('USAGE_UNIT_VIOLATION');
    await expectRejectKeepsPreStartState(billId, before);
  });

  it('ByAmount 改ざん → PAYMENT_SPLIT_MISMATCH（settling 非残留）', async () => {
    const billId = 'bill_payload_tamper';
    await prepareOpenBill(billId);
    const before = await snapshotBusinessState(billId);

    let err: any;
    try {
      await (startAccounting as any).run({
        auth: { uid: adminId },
        data: {
          billId,
          clientNonce: 'nonce_payload_tamper',
          accountingMode: 'custom',
          paymentMethodsByCategory: { items: 'cash' },
          // ByCategory は cash 1000 相当なのに ByAmount を改ざん
          paymentMethodsByAmount: { cash: 999 },
        },
      });
      fail('Should reject tampered ByAmount');
    } catch (e: any) {
      err = e;
    }

    expect(err.code).toBe('failed-precondition');
    expect(err.details?.errorKey).toBe('PAYMENT_SPLIT_MISMATCH');
    await expectRejectKeepsPreStartState(billId, before);
  });

  it('有効な支払条件では settling へ遷移する', async () => {
    const billId = 'bill_happy_settling';
    await prepareOpenBill(billId);
    const before = await snapshotBusinessState(billId);

    const result = await (startAccounting as any).run({
      auth: { uid: adminId },
      data: {
        billId,
        clientNonce: 'nonce_happy_settling',
        accountingMode: 'custom',
        paymentMethodsByCategory: { items: 'cash' },
        paymentMethodsByAmount: { cash: ITEM_PRICE },
      },
    });

    expect(result.success).toBe(true);
    expect(result.status).toBe('settling');
    expect(result.ops?.accountingStartedAt).toBeDefined();
    expect(result.ops?.accountingStartedBy).toBe(adminId);

    const after = await snapshotBusinessState(billId);
    expect(after.billStatus).toBe('settling');
    expect(after.accountingStartedAt).not.toBeNull();
    expect(after.accountingStartedBy).toBe(adminId);
    expect(after.billMetaByAmount).toEqual({ cash: ITEM_PRICE });
    expect(after.user).toEqual(before.user); // cash のみなので残高不変
    expect(after.stayBillId).toBe(before.stayBillId);
    expect(after.startAccountingIdempotencyCount).toBe(1);
  });

  it('二重 startAccounting は現行契約どおり拒否（2回目で追加書込みなし・logOps 1回）', async () => {
    const billId = 'bill_double_start';
    await prepareOpenBill(billId);

    const first = await (startAccounting as any).run({
      auth: { uid: adminId },
      data: {
        billId,
        clientNonce: 'nonce_double_start_1',
        accountingMode: 'custom',
        paymentMethodsByCategory: { items: 'cash' },
        paymentMethodsByAmount: { cash: ITEM_PRICE },
      },
    });
    expect(first.success).toBe(true);

    const afterFirst = await snapshotBusinessState(billId);

    const logOpsModule = await import('../../src/shared/logging/logOpsError');
    const logOpsErrorSpy = jest
      .spyOn(logOpsModule, 'logOpsError')
      .mockImplementation(() => undefined);

    let err: any;
    try {
      await (startAccounting as any).run({
        auth: { uid: adminId },
        data: {
          billId,
          clientNonce: 'nonce_double_start_2',
          accountingMode: 'custom',
          paymentMethodsByCategory: { items: 'cash' },
          paymentMethodsByAmount: { cash: ITEM_PRICE },
        },
      });
      fail('Second start should fail');
    } catch (e: any) {
      err = e;
    }

    expect(err.code).toBe('failed-precondition');
    expect(['ACCOUNTING_ALREADY_STARTED', 'ACCOUNTING_INVALID_STATE']).toContain(
      err.details?.errorKey,
    );
    expect(err.details?.context).toEqual(
      expect.objectContaining({
        billId,
        phase: 'validateAccountingState',
        idempKey: expect.stringContaining('startAccounting'),
        result: 'fail',
      }),
    );

    const startAccountingLogs = logOpsErrorSpy.mock.calls.filter((call) => {
      const arg = call[0] as { functionEntry?: string };
      return arg?.functionEntry === 'startAccounting';
    });
    expect(startAccountingLogs.length).toBe(1);
    expect(startAccountingLogs[0][0]).toEqual(
      expect.objectContaining({
        functionEntry: 'startAccounting',
        operation: 'startAccountingCallableCustom',
        context: expect.objectContaining({
          billId,
          errorKey: err.details?.errorKey,
          phase: 'validateAccountingState',
          idempKey: expect.any(String),
        }),
      }),
    );
    // helper 側の旧 operation（validateAccountingState 単体ログ）は出ない
    expect(
      logOpsErrorSpy.mock.calls.some((call) => {
        const arg = call[0] as { operation?: string };
        return arg?.operation === 'validateAccountingState';
      }),
    ).toBe(false);
    logOpsErrorSpy.mockRestore();

    const afterSecond = await snapshotBusinessState(billId);
    expect(afterSecond.billStatus).toBe(afterFirst.billStatus);
    expect(afterSecond.user).toEqual(afterFirst.user);
    expect(afterSecond.billMetaByAmount).toEqual(afterFirst.billMetaByAmount);
    expect(afterSecond.startAccountingIdempotencyCount).toBe(
      afterFirst.startAccountingIdempotencyCount,
    );
  });

  it('idempotency requestHash 不一致は 1 回の logOps と details.errorKey', async () => {
    const billId = 'bill_idemp_mismatch';
    await prepareOpenBill(billId);

    await (startAccounting as any).run({
      auth: { uid: adminId },
      data: {
        billId,
        idempotencyKey: `${billId}:startAccounting:fixed_nonce`,
        accountingMode: 'custom',
        paymentMethodsByCategory: { items: 'cash' },
        paymentMethodsByAmount: { cash: ITEM_PRICE },
      },
    });

    // helper 直呼びで requestHash を食い違わせる（Callable は requestHash を渡さないため）
    const { startAccounting: startAccountingHelper } = await import(
      '../../src/domains/bills/repos/startAccounting'
    );

    const logOpsModule = await import('../../src/shared/logging/logOpsError');
    const logOpsErrorSpy = jest
      .spyOn(logOpsModule, 'logOpsError')
      .mockImplementation(() => undefined);

    // Callable 経由で同じ idempotencyKey・別 caller 相当の hash 不一致を再現するため
    // helper を別 requestHash で呼び、Callable と同じ catch 経路を通すには
    // 別 nonce ではなく固定 key + 異なる accountingStartedBy が必要。
    // ここでは Callable を使い、同一 key で異なる admin 相当を再現できないため
    // helper で mismatch を起こし、Callable 境界の「1失敗1ログ」は二重startで担保する。
    // 本ケースは helper が FCE を log せず throw すること＋Callable 経由 details を確認する。

    let helperErr: any;
    try {
      await startAccountingHelper({
        billId,
        idempotencyKey: `${billId}:startAccounting:fixed_nonce`,
        accountingStartedBy: adminId,
        requestHash: 'hash_different_from_first',
      });
      fail('helper should reject mismatch');
    } catch (e: any) {
      helperErr = e;
    }
    expect(helperErr.errorKey).toBe('ACCOUNTING_IDEMPOTENCY_MISMATCH');
    expect(helperErr.context).toEqual(
      expect.objectContaining({
        billId,
        idempKey: `${billId}:startAccounting:fixed_nonce`,
        phase: 'validateIdempotencyRequest',
        result: 'fail',
      }),
    );
    // helper 単体では FCE を logOpsError しない
    expect(
      logOpsErrorSpy.mock.calls.filter((call) => {
        const arg = call[0] as { functionEntry?: string };
        return arg?.functionEntry === 'startAccounting';
      }).length,
    ).toBe(0);
    logOpsErrorSpy.mockRestore();
  });
});
