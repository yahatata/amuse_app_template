/**
 * getUserOrderHistory L3-A 契約テスト（Firestore Emulator）
 */

import { initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { getUserOrderHistory } from '../../src/domains/itemOrder/callables/getUserOrderHistory';

describe('getUserOrderHistory L3-A', () => {
  let testEnv: RulesTestEnvironment;
  let db: admin.firestore.Firestore;
  const projectId = 'test-project-order-history-l3a';
  const BUSINESS_DATE = '2026-08-07';

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
    await db.collection('storeMeta').doc('currentBusinessDay').set({
      status: 'running',
      currentBusinessDateKey: BUSINESS_DATE,
    });
  });

  async function createBillWithItems(params: {
    billId: string;
    userId: string;
    businessDate: string;
    status: string;
    items: Array<{
      itemId: string;
      name: string;
      quantity: number;
      unitPriceIncl: number;
      voided?: boolean;
      status?: string | null;
      orderClientNonce?: string;
    }>;
  }) {
    const billRef = db.collection('bills').doc(params.billId);
    await billRef.set({
      businessDate: params.businessDate,
      status: params.status,
      party: { userId: params.userId, pokerName: 'Taro' },
      amounts: { grandTotalRounded: 0 },
      place: { table: 't1', seat: 1 },
      createdAt: admin.firestore.Timestamp.fromDate(new Date('2026-08-07T03:00:00Z')),
      updatedAt: admin.firestore.Timestamp.fromDate(new Date('2026-08-07T03:00:00Z')),
    });

    for (const it of params.items) {
      await billRef.collection('items').doc(it.itemId).set({
        menuItemId: `menu_${it.itemId}`,
        name: it.name,
        quantity: it.quantity,
        unitPriceIncl: it.unitPriceIncl,
        totalPriceIncl: it.unitPriceIncl * it.quantity,
        voided: it.voided === true,
        ...(it.status ? { status: it.status } : {}),
        ...(it.orderClientNonce ? { orderClientNonce: it.orderClientNonce } : {}),
        orderedAt: admin.firestore.Timestamp.fromDate(new Date('2026-08-07T03:10:00Z')),
      });
    }
  }

  it('未認証は unauthenticated', async () => {
    await expect(
      (getUserOrderHistory as any).run({ auth: null, data: {} }),
    ).rejects.toMatchObject({
      code: 'unauthenticated',
      details: { errorKey: 'ORDER_UNAUTHENTICATED' },
    });
  });

  it('当日 open bill の会計前 item を返す', async () => {
    const userId = 'user_open_001';
    await createBillWithItems({
      billId: 'bill_open_001',
      userId,
      businessDate: BUSINESS_DATE,
      status: 'open',
      items: [
        {
          itemId: 'item_1',
          name: 'Beer',
          quantity: 2,
          unitPriceIncl: 500,
          status: 'preparing',
          orderClientNonce: 'nonce_1',
        },
      ],
    });

    const result = await (getUserOrderHistory as any).run({
      auth: { uid: userId },
      data: {},
    });

    expect(result.success).toBe(true);
    expect(result.data.businessDate).toBe(BUSINESS_DATE);
    expect(result.data.orders).toHaveLength(1);
    expect(result.data.orders[0].status).toBe('open');
    expect(result.data.orders[0].items).toHaveLength(1);
    expect(result.data.orders[0].items[0]).toMatchObject({
      itemId: 'item_1',
      name: 'Beer',
      quantity: 2,
      unitPrice: 500,
      totalPrice: 1000,
      status: 'preparing',
      voided: false,
      clientNonce: 'nonce_1',
    });
    expect(result.data.totalAmount).toBe(1000);
  });

  it('open と settled の両方を返す', async () => {
    const userId = 'user_both_001';
    await createBillWithItems({
      billId: 'bill_open',
      userId,
      businessDate: BUSINESS_DATE,
      status: 'open',
      items: [{ itemId: 'i1', name: 'A', quantity: 1, unitPriceIncl: 100, status: 'preparing' }],
    });
    await createBillWithItems({
      billId: 'bill_settled',
      userId,
      businessDate: BUSINESS_DATE,
      status: 'settled',
      items: [{ itemId: 'i2', name: 'B', quantity: 1, unitPriceIncl: 200, status: 'preparing' }],
    });

    const result = await (getUserOrderHistory as any).run({
      auth: { uid: userId },
      data: {},
    });

    expect(result.data.orders).toHaveLength(2);
    expect(result.data.totalAmount).toBe(300);
  });

  it('voided item を含み合計から除外', async () => {
    const userId = 'user_void_001';
    await createBillWithItems({
      billId: 'bill_void',
      userId,
      businessDate: BUSINESS_DATE,
      status: 'open',
      items: [
        { itemId: 'ok', name: 'A', quantity: 1, unitPriceIncl: 100, status: 'preparing' },
        { itemId: 'ng', name: 'B', quantity: 1, unitPriceIncl: 999, voided: true },
      ],
    });

    const result = await (getUserOrderHistory as any).run({
      auth: { uid: userId },
      data: {},
    });

    expect(result.data.orders[0].items).toHaveLength(2);
    expect(result.data.orders[0].items.find((i: any) => i.itemId === 'ng').voided).toBe(true);
    expect(result.data.orders[0].totalPrice).toBe(100);
    expect(result.data.totalAmount).toBe(100);
  });

  it('他人の bill を除外', async () => {
    await createBillWithItems({
      billId: 'bill_other',
      userId: 'other_user',
      businessDate: BUSINESS_DATE,
      status: 'open',
      items: [{ itemId: 'i1', name: 'A', quantity: 1, unitPriceIncl: 100 }],
    });

    const result = await (getUserOrderHistory as any).run({
      auth: { uid: 'me' },
      data: {},
    });

    expect(result.data.orders).toEqual([]);
    expect(result.data.totalCount).toBe(0);
  });

  it('前営業日を除外', async () => {
    const userId = 'user_prev';
    await createBillWithItems({
      billId: 'bill_prev',
      userId,
      businessDate: '2026-08-06',
      status: 'open',
      items: [{ itemId: 'i1', name: 'A', quantity: 1, unitPriceIncl: 100 }],
    });

    const result = await (getUserOrderHistory as any).run({
      auth: { uid: userId },
      data: {},
    });

    expect(result.data.orders).toEqual([]);
  });

  it('当日 0 件は success + 空配列', async () => {
    const result = await (getUserOrderHistory as any).run({
      auth: { uid: 'nobody' },
      data: {},
    });
    expect(result.success).toBe(true);
    expect(result.data.orders).toEqual([]);
    expect(result.data.totalAmount).toBe(0);
  });

  it('store 非 running は空配列にせず throw', async () => {
    await db.collection('storeMeta').doc('currentBusinessDay').set({
      status: 'closed',
      currentBusinessDateKey: null,
    });

    await expect(
      (getUserOrderHistory as any).run({ auth: { uid: 'u' }, data: {} }),
    ).rejects.toMatchObject({
      code: 'failed-precondition',
    });
  });
});
