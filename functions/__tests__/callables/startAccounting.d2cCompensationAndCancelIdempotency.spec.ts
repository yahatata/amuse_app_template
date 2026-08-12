/**
 * D-2C: 状態ベース補償 + cancel idempotency cancelled 化
 */

import { initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import * as admin from 'firebase-admin';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

import { startAccounting } from '../../src/domains/bills/callables/accounting';
import { cancelAccounting } from '../../src/domains/bills/callables/cancelAccounting';
import { startAccounting as startAccountingHelper } from '../../src/domains/bills/repos/startAccounting';
import {
  rollbackAccountingStartIfOwned,
  shouldRollbackAccountingStartAfterCommitFailure,
} from '../../src/domains/bills/repos/rollbackAccountingStartIfOwned';
import {
  ACCOUNTING_START_REQUEST_CANCELLED,
  ACCOUNTING_START_IDEMPOTENCY_STALE,
} from '../../src/domains/bills/repos/accountingStartIdempotency';
import * as commitModule from '../../src/domains/bills/services/commitA7AccountingPayment';
import { createBillWithActiveStay } from '../../src/domains/bills/repos/createBillWithActiveStay';
import { appendItem } from '../../src/domains/bills/repos/appendItem';
import { FunctionCustomError } from '../../src/shared/logging/functionCustomError';
import { a7StoreConfigDocument, seedA7StoreConfig } from '../helpers/a7StoreConfig';
import { __setMockConfig, __resetMockConfig } from '../helpers/mockStoreConfig';

const PROJECT_ID = 'test-default';
const BUSINESS_DATE = '2026-07-25';
const ITEM_PRICE = 1000;

describe('D-2C state-based compensation and cancel idempotency', () => {
  let testEnv: RulesTestEnvironment;
  let db: admin.firestore.Firestore;

  const adminId = 'admin_d2c';
  const userId = 'user_d2c';
  const menuItemId = 'menu_d2c';

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
      name: 'D2C Admin',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    await db.collection('users').doc(userId).set({
      uid: userId,
      pokerName: 'D2CUser',
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
      name: 'D2C Drink',
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
      pokerName: 'D2CUser',
      idempotencyKey: `idem_${billId}`,
    });
    await appendItem({
      billId,
      item: { menuItemId, quantity: 1, clientNonce: `nonce_item_${billId}` },
      idempotencyKey: `${billId}:appendItem:nonce_item_${billId}`,
    });
    if (status === 'in_progress') {
      await db.collection('bills').doc(billId).update({ status: 'in_progress' });
    }
  }

  function startPayload(billId: string, nonce: string) {
    return {
      auth: { uid: adminId },
      data: {
        billId,
        clientNonce: nonce,
        accountingMode: 'custom',
        paymentMethodsByCategory: { items: 'pointA' },
        paymentMethodsByAmount: { pointA: ITEM_PRICE },
      },
    };
  }

  it('shouldRollback は errorKey によらず true（状態で no-op）', () => {
    expect(shouldRollbackAccountingStartAfterCommitFailure(new Error('x'))).toBe(true);
    expect(
      shouldRollbackAccountingStartAfterCommitFailure(
        new FunctionCustomError({ errorKey: 'NOT_FOUND', message: 'u' }),
      ),
    ).toBe(true);
  });

  it('A-1 user NOT_FOUND で状態ベース補償', async () => {
    const billId = 'bill_d2c_not_found';
    await prepareBill(billId);
    jest.spyOn(commitModule, 'commitA7AccountingPayment').mockRejectedValue(
      new FunctionCustomError({
        errorKey: 'NOT_FOUND',
        message: 'ユーザー情報が見つかりません',
        context: { userId },
      }),
    );
    jest
      .spyOn(await import('../../src/shared/logging/logOpsError'), 'logOpsError')
      .mockImplementation(() => undefined);
    jest
      .spyOn(await import('../../src/shared/logging/logOpsError'), 'logOpsSuccess')
      .mockImplementation(() => undefined);

    await expect((startAccounting as any).run(startPayload(billId, 'nf1'))).rejects.toMatchObject({
      details: expect.objectContaining({
        errorKey: 'NOT_FOUND',
        context: expect.objectContaining({ compensationSucceeded: true }),
      }),
    });

    const bill = (await db.collection('bills').doc(billId).get()).data();
    expect(bill?.status).toBe('open');
    expect(bill?.ops?.accountingStartedAt ?? null).toBeNull();
    expect(bill?.ops?.activeAccountingStartIdempotencyKey ?? null).toBeNull();
    const idem = await db
      .collection('bills')
      .doc(billId)
      .collection('idempotency')
      .doc(`${billId}:startAccounting:nf1`)
      .get();
    expect(idem.exists).toBe(false);
  });

  it('A-2 transaction abort 相当で補償', async () => {
    const billId = 'bill_d2c_abort';
    await prepareBill(billId);
    jest
      .spyOn(commitModule, 'commitA7AccountingPayment')
      .mockRejectedValue(new Error('simulated transaction abort'));
    jest
      .spyOn(await import('../../src/shared/logging/logOpsError'), 'logOpsError')
      .mockImplementation(() => undefined);
    jest
      .spyOn(await import('../../src/shared/logging/logOpsError'), 'logOpsSuccess')
      .mockImplementation(() => undefined);

    await expect((startAccounting as any).run(startPayload(billId, 'ab1'))).rejects.toBeTruthy();

    const bill = (await db.collection('bills').doc(billId).get()).data();
    expect(bill?.status).toBe('open');
    expect(bill?.ops?.accountingStartedAt ?? null).toBeNull();
  });

  it('A-4 payment meta あり POINT_LOG は補償 noop', async () => {
    const billId = 'bill_d2c_plog_meta';
    await prepareBill(billId);
    const helper = await startAccountingHelper({
      billId,
      idempotencyKey: `${billId}:startAccounting:meta`,
      accountingStartedBy: adminId,
    });

    await db
      .collection('users')
      .doc(userId)
      .collection('pointLogs')
      .doc(`accounting_${billId}_pointA`)
      .set({
        pointType: 'pointA',
        changeAmount: -100,
        balanceBefore: 5000,
        balanceAfter: 4900,
        reasonType: 'accounting',
        relatedId: billId,
      });
    await db.collection('bills').doc(billId).update({
      'meta.paymentMethodsByAmount': { pointA: ITEM_PRICE },
    });

    const result = await rollbackAccountingStartIfOwned({
      billId,
      idempotencyKey: `${billId}:startAccounting:meta`,
      accountingStartedBy: adminId,
      accountingStartedAtIso: helper.ops.accountingStartedAt,
      previousStatus: 'open',
      userId,
    });

    expect(result.outcome).toBe('noop');
    expect(result.reason).toBe('payment_already_committed');
    expect(result.paymentCommitted).toBe(true);

    const bill = (await db.collection('bills').doc(billId).get()).data();
    expect(bill?.status).toBe('settling');
    expect(bill?.meta?.paymentMethodsByAmount?.pointA).toBe(ITEM_PRICE);
    const log = await db
      .collection('users')
      .doc(userId)
      .collection('pointLogs')
      .doc(`accounting_${billId}_pointA`)
      .get();
    expect(log.exists).toBe(true);
  });

  it('A-6 commit 成功後は補償が走らず settling 維持', async () => {
    const billId = 'bill_d2c_success';
    await prepareBill(billId);
    jest
      .spyOn(await import('../../src/shared/logging/logOpsError'), 'logOpsError')
      .mockImplementation(() => undefined);
    jest
      .spyOn(await import('../../src/shared/logging/logOpsError'), 'logOpsSuccess')
      .mockImplementation(() => undefined);

    const rollbackSpy = jest.spyOn(
      await import('../../src/domains/bills/repos/rollbackAccountingStartIfOwned'),
      'rollbackAccountingStartIfOwned',
    );

    const result = await (startAccounting as any).run(startPayload(billId, 'ok1'));
    expect(result.success).toBe(true);
    expect(rollbackSpy).not.toHaveBeenCalled();

    const bill = (await db.collection('bills').doc(billId).get()).data();
    expect(bill?.status).toBe('settling');
    expect(bill?.meta?.paymentMethodsByAmount?.pointA).toBe(ITEM_PRICE);
    expect(bill?.ops?.activeAccountingStartIdempotencyKey).toBe(
      `${billId}:startAccounting:ok1`,
    );
  });

  it('A-5 孤立 pointLog のみ → settling 補償・log 残存', async () => {
    const billId = 'bill_d2c_orphan';
    await prepareBill(billId);
    const helper = await startAccountingHelper({
      billId,
      idempotencyKey: `${billId}:startAccounting:orphan`,
      accountingStartedBy: adminId,
    });

    await db
      .collection('users')
      .doc(userId)
      .collection('pointLogs')
      .doc(`accounting_${billId}_pointA`)
      .set({
        pointType: 'pointA',
        changeAmount: -100,
        balanceBefore: 5000,
        balanceAfter: 4900,
        reasonType: 'accounting',
        relatedId: billId,
      });

    const result = await rollbackAccountingStartIfOwned({
      billId,
      idempotencyKey: `${billId}:startAccounting:orphan`,
      accountingStartedBy: adminId,
      accountingStartedAtIso: helper.ops.accountingStartedAt,
      previousStatus: 'open',
      userId,
    });

    expect(result.outcome).toBe('rolled_back');
    expect(result.orphanPointLogDetected).toBe(true);

    const bill = (await db.collection('bills').doc(billId).get()).data();
    expect(bill?.status).toBe('open');
    const log = await db
      .collection('users')
      .doc(userId)
      .collection('pointLogs')
      .doc(`accounting_${billId}_pointA`)
      .get();
    expect(log.exists).toBe(true);
  });

  it('B-1 start→cancel で idem cancelled + active key 削除', async () => {
    const billId = 'bill_d2c_cancel';
    await prepareBill(billId);
    const key = `${billId}:startAccounting:c1`;
    await startAccountingHelper({
      billId,
      idempotencyKey: key,
      accountingStartedBy: adminId,
    });

    jest
      .spyOn(await import('../../src/shared/logging/logOpsError'), 'logOpsError')
      .mockImplementation(() => undefined);

    const result = await (cancelAccounting as any).run({
      auth: { uid: adminId },
      data: { billId },
    });
    expect(result.success).toBe(true);

    const bill = (await db.collection('bills').doc(billId).get()).data();
    expect(bill?.status).toBe('open');
    expect(bill?.ops?.activeAccountingStartIdempotencyKey ?? null).toBeNull();
    expect(bill?.ops?.accountingStartedAt ?? null).toBeNull();

    const idem = (
      await db.collection('bills').doc(billId).collection('idempotency').doc(key).get()
    ).data();
    expect(idem?.status).toBe('cancelled');
    expect(idem?.cancelledBy).toBe(adminId);
  });

  it('B-2 cancel後・同一key再start は CANCELLED（internal ではない）', async () => {
    const billId = 'bill_d2c_same_key';
    await prepareBill(billId);
    const key = `${billId}:startAccounting:same`;
    await startAccountingHelper({
      billId,
      idempotencyKey: key,
      accountingStartedBy: adminId,
    });
    jest
      .spyOn(await import('../../src/shared/logging/logOpsError'), 'logOpsError')
      .mockImplementation(() => undefined);

    await (cancelAccounting as any).run({ auth: { uid: adminId }, data: { billId } });

    await expect(
      startAccountingHelper({
        billId,
        idempotencyKey: key,
        accountingStartedBy: adminId,
      }),
    ).rejects.toMatchObject({
      errorKey: ACCOUNTING_START_REQUEST_CANCELLED,
    });

    const bill = (await db.collection('bills').doc(billId).get()).data();
    expect(bill?.status).toBe('open');
  });

  it('B-3 cancel後・新key再start 成功', async () => {
    const billId = 'bill_d2c_new_key';
    await prepareBill(billId);
    const oldKey = `${billId}:startAccounting:old`;
    await startAccountingHelper({
      billId,
      idempotencyKey: oldKey,
      accountingStartedBy: adminId,
    });
    jest
      .spyOn(await import('../../src/shared/logging/logOpsError'), 'logOpsError')
      .mockImplementation(() => undefined);
    await (cancelAccounting as any).run({ auth: { uid: adminId }, data: { billId } });

    const newKey = `${billId}:startAccounting:new`;
    const again = await startAccountingHelper({
      billId,
      idempotencyKey: newKey,
      accountingStartedBy: adminId,
    });
    expect(again.status).toBe('settling');

    const bill = (await db.collection('bills').doc(billId).get()).data();
    expect(bill?.ops?.activeAccountingStartIdempotencyKey).toBe(newKey);

    const oldIdem = (
      await db.collection('bills').doc(billId).collection('idempotency').doc(oldKey).get()
    ).data();
    expect(oldIdem?.status).toBe('cancelled');

    const newIdem = (
      await db.collection('bills').doc(billId).collection('idempotency').doc(newKey).get()
    ).data();
    expect(newIdem?.status).toBe('active');
  });

  it('B-4 遅延旧request（cancelled key）拒否', async () => {
    const billId = 'bill_d2c_delayed';
    await prepareBill(billId);
    const keyA = `${billId}:startAccounting:A`;
    await startAccountingHelper({
      billId,
      idempotencyKey: keyA,
      accountingStartedBy: adminId,
    });
    jest
      .spyOn(await import('../../src/shared/logging/logOpsError'), 'logOpsError')
      .mockImplementation(() => undefined);
    await (cancelAccounting as any).run({ auth: { uid: adminId }, data: { billId } });

    await startAccountingHelper({
      billId,
      idempotencyKey: `${billId}:startAccounting:B`,
      accountingStartedBy: adminId,
    });

    await expect(
      startAccountingHelper({
        billId,
        idempotencyKey: keyA,
        accountingStartedBy: adminId,
      }),
    ).rejects.toMatchObject({ errorKey: ACCOUNTING_START_REQUEST_CANCELLED });

    const bill = (await db.collection('bills').doc(billId).get()).data();
    expect(bill?.ops?.activeAccountingStartIdempotencyKey).toBe(
      `${billId}:startAccounting:B`,
    );
  });

  it('B-5 status欠損は active、startedAt 欠損は STALE（internal 禁止）', async () => {
    const billId = 'bill_d2c_stale';
    await prepareBill(billId);
    const key = `${billId}:startAccounting:stale`;
    await db
      .collection('bills')
      .doc(billId)
      .collection('idempotency')
      .doc(key)
      .set({
        requestHash: require('crypto')
          .createHash('sha256')
          .update(JSON.stringify({ accountingStartedBy: adminId, billId }))
          .digest('hex'),
        previousStatus: 'open',
        createdAt: Timestamp.now(),
        // status 欠損
      });

    await expect(
      startAccountingHelper({
        billId,
        idempotencyKey: key,
        accountingStartedBy: adminId,
      }),
    ).rejects.toMatchObject({ errorKey: ACCOUNTING_START_IDEMPOTENCY_STALE });
  });

  it('B-6 active key 欠損の旧 bill cancel は状態復元のみ', async () => {
    const billId = 'bill_d2c_no_active';
    const now = Timestamp.now();
    await db.collection('bills').doc(billId).set({
      status: 'settling',
      party: { userId },
      ops: {
        accountingStartedAt: now,
        accountingStartedBy: adminId,
        accountingStartPreviousStatus: 'in_progress',
        // active key なし
      },
    });
    const orphanKey = `${billId}:startAccounting:orphan_other`;
    await db
      .collection('bills')
      .doc(billId)
      .collection('idempotency')
      .doc(orphanKey)
      .set({ requestHash: 'x', status: 'active', createdAt: now });

    jest
      .spyOn(await import('../../src/shared/logging/logOpsError'), 'logOpsError')
      .mockImplementation(() => undefined);

    await (cancelAccounting as any).run({ auth: { uid: adminId }, data: { billId } });

    const bill = (await db.collection('bills').doc(billId).get()).data();
    expect(bill?.status).toBe('in_progress');

    const orphan = (
      await db.collection('bills').doc(billId).collection('idempotency').doc(orphanKey).get()
    ).data();
    expect(orphan?.status).toBe('active'); // 無関係な key は触らない
  });

  it('B-7 二重 cancel 安全', async () => {
    const billId = 'bill_d2c_double_cancel';
    await prepareBill(billId);
    const key = `${billId}:startAccounting:dc`;
    await startAccountingHelper({
      billId,
      idempotencyKey: key,
      accountingStartedBy: adminId,
    });
    jest
      .spyOn(await import('../../src/shared/logging/logOpsError'), 'logOpsError')
      .mockImplementation(() => undefined);

    await (cancelAccounting as any).run({ auth: { uid: adminId }, data: { billId } });
    const second = await (cancelAccounting as any).run({
      auth: { uid: adminId },
      data: { billId },
    });
    expect(second.success).toBe(true);

    const idem = (
      await db.collection('bills').doc(billId).collection('idempotency').doc(key).get()
    ).data();
    expect(idem?.status).toBe('cancelled');
  });

  it('B-8 cancel 後の補償は cancelled idem を削除しない', async () => {
    const billId = 'bill_d2c_race';
    await prepareBill(billId);
    const key = `${billId}:startAccounting:race`;
    const helper = await startAccountingHelper({
      billId,
      idempotencyKey: key,
      accountingStartedBy: adminId,
    });
    jest
      .spyOn(await import('../../src/shared/logging/logOpsError'), 'logOpsError')
      .mockImplementation(() => undefined);
    await (cancelAccounting as any).run({ auth: { uid: adminId }, data: { billId } });

    // startedAt は消えているが、補償が古い snapshot で呼ばれても cancelled を消さない
    const result = await rollbackAccountingStartIfOwned({
      billId,
      idempotencyKey: key,
      accountingStartedBy: adminId,
      accountingStartedAtIso: helper.ops.accountingStartedAt,
      previousStatus: 'open',
      userId,
    });
    expect(result.outcome).toBe('noop');
    expect(['already_pre_start', 'idempotency_cancelled', 'status_not_settling']).toContain(
      result.reason,
    );

    const idem = (
      await db.collection('bills').doc(billId).collection('idempotency').doc(key).get()
    ).data();
    expect(idem?.status).toBe('cancelled');
  });
});
