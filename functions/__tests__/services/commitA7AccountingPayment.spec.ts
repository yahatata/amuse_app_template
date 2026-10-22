/**
 * A-7 Phase 2: commitA7AccountingPayment Emulator 統合テスト
 *
 * - 正常系（残高・ログ・bill meta）
 * - transaction rollback（残高不足）
 * - 冪等（二重減算なし）
 * - logId 内容不一致 conflict
 */

import { initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { commitA7AccountingPayment } from '../../src/domains/bills/services/commitA7AccountingPayment';
import { FunctionCustomError } from '../../src/shared/logging/functionCustomError';
import type { ResolvedA7AccountingPayment } from '../../src/domains/bills/services/resolveA7AccountingPayment';

describe('commitA7AccountingPayment (emulator)', () => {
  let testEnv: RulesTestEnvironment;
  let db: admin.firestore.Firestore;
  const projectId = 'test-project-commit-a7';

  beforeAll(async () => {
    process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8081';
    testEnv = await initializeTestEnvironment({ projectId });
    if (admin.apps.length > 0) {
      await Promise.all(admin.apps.map((a) => a?.delete()).filter(Boolean));
    }
    admin.initializeApp({ projectId });
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

  async function seedUser(uid: string, balances: Record<string, number>) {
    await db.collection('users').doc(uid).set({
      pointA: 0,
      pointB: 0,
      pointC: 0,
      pointD: 0,
      pointE: 0,
      sideGameChip: 0,
      ...balances,
    });
  }

  async function seedBill(billId: string, userId: string) {
    await db.collection('bills').doc(billId).set({
      status: 'settling',
      party: { userId },
      meta: {},
    });
  }

  function resolvedPointA(amount: number): ResolvedA7AccountingPayment {
    return {
      paymentMethodsByCategory: {
        items: [
          { method: 'pointA', amount },
          { method: 'cash', amount: 100 },
        ],
      },
      paymentMethodsByAmount: { pointA: amount, cash: 100 },
      paymentMethodDetails: {
        pointA: {
          referenceAmount: amount,
          balanceAmount: amount,
          conversion: { referenceUnits: 1, balanceUnits: 1 },
          usageUnit: 1,
          refundedBalanceAmount: 0,
        },
      },
      usedBalanceAmounts: { pointA: amount },
    };
  }

  it('pointA 減算・pointLog・bill meta を同一 tx で保存', async () => {
    const uid = 'u1';
    const billId = 'b1';
    await seedUser(uid, { pointA: 500 });
    await seedBill(billId, uid);

    const resolved = resolvedPointA(200);
    const out = await commitA7AccountingPayment({ billId, userId: uid, resolved });
    expect(out.reused).toBe(false);

    const user = (await db.collection('users').doc(uid).get()).data()!;
    expect(user.pointA).toBe(300);

    const log = (
      await db
        .collection('users')
        .doc(uid)
        .collection('pointLogs')
        .doc(`accounting_${billId}_pointA`)
        .get()
    ).data()!;
    expect(log.changeAmount).toBe(-200);
    expect(log.balanceBefore).toBe(500);
    expect(log.balanceAfter).toBe(300);
    expect(log.reasonType).toBe('accounting');
    expect(log.relatedId).toBe(billId);

    const bill = (await db.collection('bills').doc(billId).get()).data()!;
    expect(bill.meta.paymentMethodsByAmount.pointA).toBe(200);
    expect(bill.meta.paymentMethodDetails.pointA.refundedBalanceAmount).toBe(0);
    expect(bill.draftAccountingInput.paymentMethodsByAmount.pointA).toBe(200);
  });

  it('pointA + sideGameChip 併用', async () => {
    const uid = 'u2';
    const billId = 'b2';
    await seedUser(uid, { pointA: 100, sideGameChip: 5 });
    await seedBill(billId, uid);

    const resolved: ResolvedA7AccountingPayment = {
      paymentMethodsByCategory: {
        items: [
          { method: 'pointA', amount: 100 },
          { method: 'sideGameChip', amount: 200 },
          { method: 'cash', amount: 50 },
        ],
      },
      paymentMethodsByAmount: { pointA: 100, sideGameChip: 200, cash: 50 },
      paymentMethodDetails: {
        pointA: {
          referenceAmount: 100,
          balanceAmount: 100,
          conversion: { referenceUnits: 1, balanceUnits: 1 },
          usageUnit: 1,
          refundedBalanceAmount: 0,
        },
        sideGameChip: {
          referenceAmount: 200,
          balanceAmount: 2,
          conversion: { referenceUnits: 100, balanceUnits: 1 },
          usageUnit: 100,
          refundedBalanceAmount: 0,
        },
      },
      usedBalanceAmounts: { pointA: 100, sideGameChip: 2 },
    };

    await commitA7AccountingPayment({ billId, userId: uid, resolved });

    const user = (await db.collection('users').doc(uid).get()).data()!;
    expect(user.pointA).toBe(0);
    expect(user.sideGameChip).toBe(3);

    const chipLog = (
      await db
        .collection('users')
        .doc(uid)
        .collection('sideGameChipLogs')
        .doc(`accounting_${billId}`)
        .get()
    ).data()!;
    expect(chipLog.changeAmount).toBe(-2);
    expect(chipLog.reasonType).toBe('accounting');
  });

  it('残高不足時は rollback（残高・ログ・bill 未更新）', async () => {
    const uid = 'u3';
    const billId = 'b3';
    await seedUser(uid, { pointA: 50 });
    await seedBill(billId, uid);

    await expect(
      commitA7AccountingPayment({
        billId,
        userId: uid,
        resolved: resolvedPointA(200),
      }),
    ).rejects.toBeInstanceOf(FunctionCustomError);

    const user = (await db.collection('users').doc(uid).get()).data()!;
    expect(user.pointA).toBe(50);

    const logSnap = await db
      .collection('users')
      .doc(uid)
      .collection('pointLogs')
      .doc(`accounting_${billId}_pointA`)
      .get();
    expect(logSnap.exists).toBe(false);

    const bill = (await db.collection('bills').doc(billId).get()).data()!;
    expect(bill.meta?.paymentMethodsByAmount).toBeUndefined();
  });

  it('同一内容の再実行は冪等（二重減算なし）', async () => {
    const uid = 'u4';
    const billId = 'b4';
    await seedUser(uid, { pointA: 500 });
    await seedBill(billId, uid);
    const resolved = resolvedPointA(100);

    await commitA7AccountingPayment({ billId, userId: uid, resolved });
    const second = await commitA7AccountingPayment({
      billId,
      userId: uid,
      resolved,
    });
    expect(second.reused).toBe(true);

    const user = (await db.collection('users').doc(uid).get()).data()!;
    expect(user.pointA).toBe(400);
  });

  it('同一 logId・異なる内容は conflict（残高維持）', async () => {
    const uid = 'u5';
    const billId = 'b5';
    await seedUser(uid, { pointA: 500 });
    await seedBill(billId, uid);

    await commitA7AccountingPayment({
      billId,
      userId: uid,
      resolved: resolvedPointA(100),
    });

    await expect(
      commitA7AccountingPayment({
        billId,
        userId: uid,
        resolved: resolvedPointA(150),
      }),
    ).rejects.toMatchObject({ errorKey: 'POINT_LOG_IDEMPOTENCY_CONFLICT' });

    const user = (await db.collection('users').doc(uid).get()).data()!;
    expect(user.pointA).toBe(400);
  });
});
