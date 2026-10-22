/**
 * D-2B: commit 時 ACCOUNTING_INSUFFICIENT_BALANCE の settling 補償
 *
 * - 競合再現（spy で helper 後・commit 前に残高を落とす）
 * - previousStatus open / in_progress 復元
 * - ownership 不一致 noop
 * - 二重補償
 * - 事前不足は補償不要（settling 非作成）
 */

import { initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import * as admin from 'firebase-admin';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

import { startAccounting } from '../../src/domains/bills/callables/accounting';
import { startAccounting as startAccountingHelper } from '../../src/domains/bills/repos/startAccounting';
import {
  rollbackAccountingStartIfOwned,
  shouldRollbackAccountingStartAfterCommitFailure,
} from '../../src/domains/bills/repos/rollbackAccountingStartIfOwned';
import * as rollbackModule from '../../src/domains/bills/repos/rollbackAccountingStartIfOwned';
import * as commitModule from '../../src/domains/bills/services/commitA7AccountingPayment';
import { createBillWithActiveStay } from '../../src/domains/bills/repos/createBillWithActiveStay';
import { appendItem } from '../../src/domains/bills/repos/appendItem';
import { FunctionCustomError } from '../../src/shared/logging/functionCustomError';
import { a7StoreConfigDocument, seedA7StoreConfig } from '../helpers/a7StoreConfig';
import { __setMockConfig, __resetMockConfig } from '../helpers/mockStoreConfig';

const PROJECT_ID = 'test-default';
const BUSINESS_DATE = '2026-07-25';
const ITEM_PRICE = 1000;

describe('startAccounting commit insufficient rollback (D-2B)', () => {
  let testEnv: RulesTestEnvironment;
  let db: admin.firestore.Firestore;

  const adminId = 'admin_d2b_commit_insuf';
  const userId = 'user_d2b_commit_insuf';
  const menuItemId = 'menu_d2b_commit_insuf';

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
      name: 'D2B Admin',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    await db.collection('users').doc(userId).set({
      uid: userId,
      pokerName: 'D2BUser',
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
      name: 'D2B Drink',
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
    jest.restoreAllMocks();
  });

  async function prepareBill(billId: string, status: 'open' | 'in_progress' = 'open') {
    await createBillWithActiveStay({
      billId,
      userId,
      pokerName: 'D2BUser',
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
    if (status === 'in_progress') {
      await db.collection('bills').doc(billId).update({ status: 'in_progress' });
    }
  }

  function installCommitRaceDrainPointA() {
    const original = commitModule.commitA7AccountingPayment;
    return jest
      .spyOn(commitModule, 'commitA7AccountingPayment')
      .mockImplementation(async (params) => {
        await db.collection('users').doc(userId).update({
          pointA: 0,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        return original(params);
      });
  }

  it('shouldRollback... は errorKey によらず true（状態で no-op）', () => {
    expect(
      shouldRollbackAccountingStartAfterCommitFailure(
        new FunctionCustomError({
          errorKey: 'ACCOUNTING_INSUFFICIENT_BALANCE',
          message: 'x',
        }),
      ),
    ).toBe(true);
    expect(
      shouldRollbackAccountingStartAfterCommitFailure(
        new FunctionCustomError({
          errorKey: 'POINT_LOG_IDEMPOTENCY_CONFLICT',
          message: 'x',
        }),
      ),
    ).toBe(true);
  });

  it('commit競合で INSUFFICIENT → settling残留なし・previousStatus=open 復元・再start可', async () => {
    const billId = 'bill_d2b_race_open';
    await prepareBill(billId, 'open');
    installCommitRaceDrainPointA();

    const logOpsModule = await import('../../src/shared/logging/logOpsError');
    const logOpsErrorSpy = jest
      .spyOn(logOpsModule, 'logOpsError')
      .mockImplementation(() => undefined);
    const logOpsSuccessSpy = jest
      .spyOn(logOpsModule, 'logOpsSuccess')
      .mockImplementation(() => undefined);

    let err: any;
    try {
      await (startAccounting as any).run({
        auth: { uid: adminId },
        data: {
          billId,
          clientNonce: 'nonce_d2b_race_open',
          accountingMode: 'custom',
          paymentMethodsByCategory: { items: 'pointA' },
          paymentMethodsByAmount: { pointA: ITEM_PRICE },
        },
      });
      fail('Should fail with insufficient balance');
    } catch (e: any) {
      err = e;
    }

    expect(err.code).toBe('failed-precondition');
    expect(err.details?.errorKey).toBe('ACCOUNTING_INSUFFICIENT_BALANCE');
    expect(err.details?.context?.compensationAttempted).toBe(true);
    expect(err.details?.context?.compensationSucceeded).toBe(true);

    const bill = (await db.collection('bills').doc(billId).get()).data();
    expect(bill?.status).toBe('open');
    expect(bill?.ops?.accountingStartedAt ?? null).toBeNull();
    expect(bill?.ops?.accountingStartedBy ?? null).toBeNull();
    expect(bill?.ops?.accountingStartPreviousStatus ?? null).toBeNull();
    expect(bill?.meta?.paymentMethodsByAmount ?? null).toBeNull();

    const user = (await db.collection('users').doc(userId).get()).data();
    expect(user?.pointA).toBe(0);

    const pointLogs = await db
      .collection('users')
      .doc(userId)
      .collection('pointLogs')
      .get();
    expect(pointLogs.size).toBe(0);

    const idemDocs = await db
      .collection('bills')
      .doc(billId)
      .collection('idempotency')
      .get();
    const startIdems = idemDocs.docs.filter((d) => d.id.includes('startAccounting'));
    expect(startIdems.length).toBe(0);

    const compensationSuccessLogs = logOpsSuccessSpy.mock.calls.filter((call) => {
      const arg = call[0] as { operation?: string };
      return arg?.operation === 'rollbackAccountingStartAfterCommitFail';
    });
    expect(compensationSuccessLogs.length).toBe(1);

    const errorLogs = logOpsErrorSpy.mock.calls.filter((call) => {
      const arg = call[0] as { functionEntry?: string };
      return arg?.functionEntry === 'startAccounting';
    });
    expect(errorLogs.length).toBe(1);
    expect(errorLogs[0][0]).toEqual(
      expect.objectContaining({
        operation: 'startAccountingCallableCustom',
        context: expect.objectContaining({
          errorKey: 'ACCOUNTING_INSUFFICIENT_BALANCE',
          compensationAttempted: true,
          compensationSucceeded: true,
        }),
      }),
    );

    // 残高を戻して再会計可能
    await db.collection('users').doc(userId).update({ pointA: 5000 });
    jest.restoreAllMocks();

    const retry = await (startAccounting as any).run({
      auth: { uid: adminId },
      data: {
        billId,
        clientNonce: 'nonce_d2b_race_open_retry',
        accountingMode: 'custom',
        paymentMethodsByCategory: { items: 'cash' },
        paymentMethodsByAmount: { cash: ITEM_PRICE },
      },
    });
    expect(retry.success).toBe(true);
    const afterRetry = (await db.collection('bills').doc(billId).get()).data();
    expect(afterRetry?.status).toBe('settling');
  });

  it('previousStatus=in_progress を正しく復元（一律 open にしない）', async () => {
    const billId = 'bill_d2b_race_in_progress';
    await prepareBill(billId, 'in_progress');
    installCommitRaceDrainPointA();

    jest
      .spyOn(await import('../../src/shared/logging/logOpsError'), 'logOpsError')
      .mockImplementation(() => undefined);
    jest
      .spyOn(await import('../../src/shared/logging/logOpsError'), 'logOpsSuccess')
      .mockImplementation(() => undefined);

    await expect(
      (startAccounting as any).run({
        auth: { uid: adminId },
        data: {
          billId,
          clientNonce: 'nonce_d2b_race_ip',
          accountingMode: 'custom',
          paymentMethodsByCategory: { items: 'pointA' },
          paymentMethodsByAmount: { pointA: ITEM_PRICE },
        },
      }),
    ).rejects.toMatchObject({
      details: { errorKey: 'ACCOUNTING_INSUFFICIENT_BALANCE' },
    });

    const bill = (await db.collection('bills').doc(billId).get()).data();
    expect(bill?.status).toBe('in_progress');
    expect(bill?.ops?.accountingStartedAt ?? null).toBeNull();
  });

  it('事前custom残高不足は settling を作らず補償対象外', async () => {
    const billId = 'bill_d2b_precheck';
    await prepareBill(billId, 'open');
    await db.collection('users').doc(userId).update({ pointA: 10 });

    const commitSpy = jest.spyOn(commitModule, 'commitA7AccountingPayment');

    jest
      .spyOn(await import('../../src/shared/logging/logOpsError'), 'logOpsError')
      .mockImplementation(() => undefined);

    await expect(
      (startAccounting as any).run({
        auth: { uid: adminId },
        data: {
          billId,
          clientNonce: 'nonce_d2b_precheck',
          accountingMode: 'custom',
          paymentMethodsByCategory: { items: 'pointA' },
          paymentMethodsByAmount: { pointA: ITEM_PRICE },
        },
      }),
    ).rejects.toMatchObject({
      details: { errorKey: 'ACCOUNTING_INSUFFICIENT_BALANCE' },
    });

    expect(commitSpy).not.toHaveBeenCalled();

    const bill = (await db.collection('bills').doc(billId).get()).data();
    expect(bill?.status).toBe('open');
    expect(bill?.ops?.accountingStartedAt ?? null).toBeNull();
  });

  it('ownership不一致（startedAt変更）では巻き戻さない', async () => {
    const billId = 'bill_d2b_own_mismatch';
    await prepareBill(billId, 'open');
    const helper = await startAccountingHelper({
      billId,
      idempotencyKey: `${billId}:startAccounting:own`,
      accountingStartedBy: adminId,
    });

    // 別処理が startedAt を差し替えた想定
    const otherAt = Timestamp.fromMillis(Date.parse(helper.ops.accountingStartedAt) + 5000);
    await db.collection('bills').doc(billId).update({
      'ops.accountingStartedAt': otherAt,
      'ops.accountingStartedBy': adminId,
    });

    const result = await rollbackAccountingStartIfOwned({
      billId,
      idempotencyKey: `${billId}:startAccounting:own`,
      accountingStartedBy: adminId,
      accountingStartedAtIso: helper.ops.accountingStartedAt,
      previousStatus: 'open',
    });

    expect(result.outcome).toBe('noop');
    expect(result.reason).toBe('accounting_started_at_mismatch');

    const bill = (await db.collection('bills').doc(billId).get()).data();
    expect(bill?.status).toBe('settling');
    expect(bill?.ops?.accountingStartedAt?.toMillis()).toBe(otherAt.toMillis());
  });

  it('status=settled は巻き戻さない', async () => {
    const billId = 'bill_d2b_settled';
    const startedAt = Timestamp.now();
    await db.collection('bills').doc(billId).set({
      status: 'settled',
      party: { userId },
      ops: {
        accountingStartedAt: startedAt,
        accountingStartedBy: adminId,
        accountingStartPreviousStatus: 'open',
      },
    });
    const iso = startedAt.toDate().toISOString();
    await db
      .collection('bills')
      .doc(billId)
      .collection('idempotency')
      .doc(`${billId}:startAccounting:x`)
      .set({ requestHash: 'abc', previousStatus: 'open', createdAt: startedAt });

    const result = await rollbackAccountingStartIfOwned({
      billId,
      idempotencyKey: `${billId}:startAccounting:x`,
      accountingStartedBy: adminId,
      accountingStartedAtIso: iso,
      previousStatus: 'open',
    });

    expect(result.outcome).toBe('noop');
    expect(result.reason).toBe('status_not_settling');
    expect((await db.collection('bills').doc(billId).get()).data()?.status).toBe('settled');
  });

  it('二重補償は2回目 noop で破壊しない', async () => {
    const billId = 'bill_d2b_double';
    await prepareBill(billId, 'in_progress');
    const helper = await startAccountingHelper({
      billId,
      idempotencyKey: `${billId}:startAccounting:double`,
      accountingStartedBy: adminId,
    });

    const first = await rollbackAccountingStartIfOwned({
      billId,
      idempotencyKey: `${billId}:startAccounting:double`,
      accountingStartedBy: adminId,
      accountingStartedAtIso: helper.ops.accountingStartedAt,
      previousStatus: 'in_progress',
    });
    expect(first.outcome).toBe('rolled_back');
    expect(first.restoredStatus).toBe('in_progress');

    const second = await rollbackAccountingStartIfOwned({
      billId,
      idempotencyKey: `${billId}:startAccounting:double`,
      accountingStartedBy: adminId,
      accountingStartedAtIso: helper.ops.accountingStartedAt,
      previousStatus: 'in_progress',
    });
    expect(second.outcome).toBe('noop');
    expect(second.reason).toBe('already_pre_start');

    const bill = (await db.collection('bills').doc(billId).get()).data();
    expect(bill?.status).toBe('in_progress');
    expect(bill?.ops?.accountingStartedAt ?? null).toBeNull();
  });

  it('補償失敗しても元 errorKey を維持し、単一 logOpsError', async () => {
    const billId = 'bill_d2b_comp_fail';
    await prepareBill(billId, 'open');
    installCommitRaceDrainPointA();

    jest
      .spyOn(rollbackModule, 'rollbackAccountingStartIfOwned')
      .mockRejectedValue(new Error('forced compensation failure'));

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
          clientNonce: 'nonce_d2b_comp_fail',
          accountingMode: 'custom',
          paymentMethodsByCategory: { items: 'pointA' },
          paymentMethodsByAmount: { pointA: ITEM_PRICE },
        },
      });
      fail('expected fail');
    } catch (e: any) {
      err = e;
    }

    expect(err.details?.errorKey).toBe('ACCOUNTING_INSUFFICIENT_BALANCE');
    expect(err.details?.context?.compensationAttempted).toBe(true);
    expect(err.details?.context?.compensationSucceeded).toBe(false);
    expect(err.details?.context?.compensationError).toContain('forced compensation failure');

    const errorLogs = logOpsErrorSpy.mock.calls.filter((call) => {
      const arg = call[0] as { functionEntry?: string };
      return arg?.functionEntry === 'startAccounting';
    });
    expect(errorLogs.length).toBe(1);
  });
});
