import { initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';

import { createBillWithActiveStay } from '../../src/domains/bills/repos/createBillWithActiveStay';

describe('placeOrder (table device)', () => {
  let testEnv: RulesTestEnvironment;
  let db: admin.firestore.Firestore;
  let placeOrder: { run: (req: unknown) => Promise<Record<string, unknown>> };
  const projectId = 'test-place-order-table-device';

  beforeAll(async () => {
    process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8081';
    testEnv = await initializeTestEnvironment({ projectId });
    if (admin.apps.length > 0) {
      await Promise.all(admin.apps.map((app) => app?.delete()).filter(Boolean));
    }
    admin.initializeApp({ projectId });
    db = getFirestore();
    const mod = await import('../../src/domains/itemOrder/callables/placeOrder');
    placeOrder = mod.placeOrder as typeof placeOrder;
  });

  afterAll(async () => {
    await testEnv.cleanup();
    await Promise.all(admin.apps.map((app) => app?.delete()).filter(Boolean));
    delete process.env.FIRESTORE_EMULATOR_HOST;
  });

  beforeEach(async () => {
    await testEnv.clearFirestore();
  });

  async function createTableDevice(uid: string, tableId: string) {
    await db.collection('devices').doc(`device_${uid}`).set({
      uid,
      role: 'table',
      status: 'active',
      name: `Table Device ${tableId}`,
      options: {},
      optionParams: {
        table_device_table: {
          tableId,
        },
      },
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }

  async function createTestMenuItem(menuItemId: string) {
    await db.collection('menuItems').doc(menuItemId).set({
      name: 'ビール',
      category: 'drink',
      price: 500,
      description: '',
      imageUrl: '',
      isArchive: false,
      isSoldOut: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }

  it('紐付け卓の伝票なら table role でも注文できる', async () => {
    const uid = 'table_place_order_ok';
    const tableId = 'T1';
    const billId = 'bill_table_place_order_ok';
    const userId = 'user_table_place_order_ok';
    const menuItemId = 'menu_table_place_order_ok';

    await createTableDevice(uid, tableId);
    await createTestMenuItem(menuItemId);
    await createBillWithActiveStay({
      billId,
      userId,
      pokerName: '卓プレイヤー',
      idempotencyKey: 'idem_table_place_order_ok',
    });
    await db.collection('bills').doc(billId).set({
      place: { table: tableId, seat: 1 },
    }, { merge: true });

    const result = await placeOrder.run({
      auth: { uid },
      data: {
        billId,
        item: {
          menuItemId,
          quantity: 1,
        },
        clientNonce: 'nonce_table_place_order_ok',
      },
    } as any);

    expect(result.success).toBe(true);
    expect((result.data as Record<string, unknown>).billId).toBe(billId);
  });

  it('別卓の伝票には注文できない', async () => {
    const uid = 'table_place_order_ng';
    const boundTableId = 'T1';
    const actualTableId = 'T2';
    const billId = 'bill_table_place_order_ng';
    const userId = 'user_table_place_order_ng';
    const menuItemId = 'menu_table_place_order_ng';

    await createTableDevice(uid, boundTableId);
    await createTestMenuItem(menuItemId);
    await createBillWithActiveStay({
      billId,
      userId,
      pokerName: '別卓プレイヤー',
      idempotencyKey: 'idem_table_place_order_ng',
    });
    await db.collection('bills').doc(billId).set({
      place: { table: actualTableId, seat: 2 },
    }, { merge: true });

    await expect(
      placeOrder.run({
        auth: { uid },
        data: {
          billId,
          item: {
            menuItemId,
            quantity: 1,
          },
          clientNonce: 'nonce_table_place_order_ng',
        },
      } as any),
    ).rejects.toThrow(/この卓を操作する権限がありません/);
  });
});
