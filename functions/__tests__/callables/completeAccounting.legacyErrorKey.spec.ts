/**
 * legacy completeAccounting の FunctionCustomError → details.errorKey 契約
 *
 * 前提: Firestore Emulator
 */

import { initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import * as admin from 'firebase-admin';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

import { completeAccounting } from '../../src/domains/bills/callables/accounting';

const PROJECT_ID = 'test-default';

describe('completeAccounting (legacy) details.errorKey', () => {
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
  });

  async function seedAdmin(uid: string) {
    await db.collection('devices').doc(`dev_${uid}`).set({
      uid,
      role: 'admin',
      status: 'active',
      name: 'Legacy Complete Admin',
      options: { accounting: true },
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }

  it('ACCOUNTING_ALREADY_SETTLED で details.errorKey を返す（code/message維持・データ不変）', async () => {
    const adminId = 'admin_legacy_settled';
    const billId = 'todays_bill_legacy_settled';
    await seedAdmin(adminId);

    await db.collection('todaysBills').doc(billId).set({
      status: 'settled',
      accountingStartedAt: Timestamp.now(),
      accountingStartedBy: adminId,
      pokerName: 'LegacyUser',
      totalPrice: 1000,
      userId: 'user_legacy_settled',
      paymentMethodsByAmount: { cash: 1000 },
      updatedAt: Timestamp.now(),
    });

    const before = (await db.collection('todaysBills').doc(billId).get()).data()!;
    const historyBefore = (await db.collection('accountingHistory').get()).size;

    const logOpsModule = await import('../../src/shared/logging/logOpsError');
    const logOpsErrorSpy = jest
      .spyOn(logOpsModule, 'logOpsError')
      .mockImplementation(() => undefined);

    let err: any;
    try {
      await (completeAccounting as any).run({
        auth: { uid: adminId },
        data: { billId },
      });
      fail('Should reject already settled');
    } catch (e: any) {
      err = e;
    }

    expect(err.code).toBe('failed-precondition');
    expect(err.message).toBe('この請求書は既に会計済みです');
    expect(err.details?.errorKey).toBe('ACCOUNTING_ALREADY_SETTLED');
    expect(err.details?.context).toEqual(
      expect.objectContaining({
        billId,
        legacy: true,
        currentStatus: 'settled',
      }),
    );

    expect(
      logOpsErrorSpy.mock.calls.filter((call) => {
        const arg = call[0] as { functionEntry?: string };
        return arg?.functionEntry === 'completeAccounting';
      }).length,
    ).toBe(1);
    logOpsErrorSpy.mockRestore();

    const after = (await db.collection('todaysBills').doc(billId).get()).data()!;
    expect(after.status).toBe(before.status);
    expect(after.totalPrice).toBe(before.totalPrice);
    expect((await db.collection('accountingHistory').get()).size).toBe(historyBefore);
  });

  it('ACCOUNTING_NOT_STARTED で details.errorKey を返す', async () => {
    const adminId = 'admin_legacy_not_started';
    const billId = 'todays_bill_legacy_not_started';
    await seedAdmin(adminId);

    await db.collection('todaysBills').doc(billId).set({
      status: 'open',
      pokerName: 'LegacyUser',
      totalPrice: 500,
      userId: 'user_legacy_not_started',
      updatedAt: Timestamp.now(),
    });

    let err: any;
    try {
      await (completeAccounting as any).run({
        auth: { uid: adminId },
        data: { billId },
      });
      fail('Should reject not started');
    } catch (e: any) {
      err = e;
    }

    expect(err.code).toBe('failed-precondition');
    expect(err.message).toBe('この請求書はまだ会計開始されていません');
    expect(err.details?.errorKey).toBe('ACCOUNTING_NOT_STARTED');
    expect(err.details?.context).toEqual(
      expect.objectContaining({ billId, legacy: true }),
    );

    const after = (await db.collection('todaysBills').doc(billId).get()).data()!;
    expect(after.status).toBe('open');
  });
});
