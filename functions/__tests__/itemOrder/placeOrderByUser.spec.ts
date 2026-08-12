/**
 * placeOrderByUser L3-A 契約テスト（Firestore Emulator）
 */

import { initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { placeOrderByUser } from '../../src/domains/itemOrder/callables/placeOrderByUser';
import { createBillWithActiveStay } from '../../src/domains/bills/repos/createBillWithActiveStay';
import {
  MAX_ORDER_QUANTITY_PER_LINE,
} from '../../src/domains/itemOrder/helpers/normalizePlaceOrderByUserItems';
import {
  placeOrderByUserAtomicTestHooks,
  parseOrderableMenuItemFromData,
} from '../../src/domains/itemOrder/helpers/placeOrderByUserAtomic';

describe('placeOrderByUser L3-A', () => {
  let testEnv: RulesTestEnvironment;
  let db: admin.firestore.Firestore;
  const projectId = 'test-project-place-order-by-user-l3a';

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
    placeOrderByUserAtomicTestHooks.abortAfterMenuReadOnAttempt1 = undefined;
    placeOrderByUserAtomicTestHooks.mutateMenuBeforeAttempt = undefined;
    placeOrderByUserAtomicTestHooks.failPostCommitResponseUpdate = undefined;
    placeOrderByUserAtomicTestHooks._currentAttempt = undefined;
  });

  afterEach(() => {
    placeOrderByUserAtomicTestHooks.abortAfterMenuReadOnAttempt1 = undefined;
    placeOrderByUserAtomicTestHooks.mutateMenuBeforeAttempt = undefined;
    placeOrderByUserAtomicTestHooks.failPostCommitResponseUpdate = undefined;
    placeOrderByUserAtomicTestHooks._currentAttempt = undefined;
  });

  async function createTestMenuItem(
    menuItemId: string,
    name: string,
    category: string,
    price: number,
    flags: { isArchive?: boolean; isSoldOut?: boolean } = {},
  ) {
    await db.collection('menuItems').doc(menuItemId).set({
      name,
      category,
      price,
      description: '',
      imageUrl: '',
      isArchive: flags.isArchive === true,
      isSoldOut: flags.isSoldOut === true,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }

  async function orderDocIdFromBill(billId: string): Promise<string> {
    const billDoc = await db.collection('bills').doc(billId).get();
    const businessDate = billDoc.data()!.businessDate as string;
    return businessDate.replace(/-/g, '');
  }

  function makeIds(testName: string) {
    const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    return {
      billId: `bill_${testName}_${suffix}`,
      userId: `user_${testName}_${suffix}`,
      menuItemId: `menu_${testName}_${suffix}`,
      clientNonce: `nonce_${testName}_${suffix}`,
    };
  }

  describe('auth / nonce validation', () => {
    it('未認証は unauthenticated + ORDER_UNAUTHENTICATED', async () => {
      await expect(
        placeOrderByUser.run({
          data: { items: [{ menuItemId: 'm1', quantity: 1 }], clientNonce: 'n1' },
          auth: null,
        } as any),
      ).rejects.toMatchObject({
        code: 'unauthenticated',
        details: { errorKey: 'ORDER_UNAUTHENTICATED' },
      });
    });

    it('clientNonce 欠損は ORDER_NONCE_REQUIRED', async () => {
      const ids = makeIds('nonce_missing');
      await createTestMenuItem(ids.menuItemId, 'Beer', 'drink', 500);
      await createBillWithActiveStay({
        billId: ids.billId,
        userId: ids.userId,
        pokerName: 'T',
        idempotencyKey: `idem_${ids.billId}`,
      });

      await expect(
        placeOrderByUser.run({
          data: { items: [{ menuItemId: ids.menuItemId, quantity: 1 }] },
          auth: { uid: ids.userId },
        } as any),
      ).rejects.toMatchObject({
        code: 'invalid-argument',
        details: { errorKey: 'ORDER_NONCE_REQUIRED' },
      });
    });

    it('clientNonce 空文字は ORDER_NONCE_REQUIRED', async () => {
      await expect(
        placeOrderByUser.run({
          data: { items: [{ menuItemId: 'm', quantity: 1 }], clientNonce: '   ' },
          auth: { uid: 'u' },
        } as any),
      ).rejects.toMatchObject({
        code: 'invalid-argument',
        details: { errorKey: 'ORDER_NONCE_REQUIRED' },
      });
    });
  });

  describe('happy / atomic / idempotency', () => {
    it('3件正常で 3件作成・strict success shape', async () => {
      const ids = makeIds('three_ok');
      const m2 = `${ids.menuItemId}_2`;
      const m3 = `${ids.menuItemId}_3`;
      await createTestMenuItem(ids.menuItemId, 'A', 'drink', 100);
      await createTestMenuItem(m2, 'B', 'food', 200);
      await createTestMenuItem(m3, 'C', 'drink', 300);
      await createBillWithActiveStay({
        billId: ids.billId,
        userId: ids.userId,
        pokerName: 'T',
        idempotencyKey: `idem_${ids.billId}`,
      });

      const result = await placeOrderByUser.run({
        data: {
          clientNonce: ids.clientNonce,
          items: [
            { menuItemId: ids.menuItemId, quantity: 1, price: 9999 },
            { menuItemId: m2, quantity: 2 },
            { menuItemId: m3, quantity: 1 },
          ],
        },
        auth: { uid: ids.userId },
      } as any);

      expect(result.success).toBe(true);
      expect(result.data.billId).toBe(ids.billId);
      expect(result.data.clientNonce).toBe(ids.clientNonce);
      expect(result.data.reused).toBe(false);
      expect(result.data.itemsCount).toBe(3);
      expect(result.data.totalQuantity).toBe(4);
      expect(result.data.totalAmount).toBe(100 + 400 + 300);
      expect(result.data.items).toHaveLength(3);
      for (const it of result.data.items) {
        expect(it.itemId).toBeTruthy();
        expect(it.menuItemId).toBeTruthy();
        expect(it.name).toBeTruthy();
        expect(it.unitPrice).toBeGreaterThan(0);
        expect(it.totalPrice).toBe(it.unitPrice * it.quantity);
        expect(it.status).toBe('preparing');
        expect(typeof it.orderedAt).toBe('string');
      }

      const itemsSnap = await db.collection('bills').doc(ids.billId).collection('items').get();
      expect(itemsSnap.size).toBe(3);
      // bill items に status を新設しない（appendItem 互換: voided のみ）
      itemsSnap.docs.forEach((doc) => {
        expect(doc.data().status).toBeUndefined();
        expect(doc.data().orderClientNonce).toBe(ids.clientNonce);
        expect(doc.data().voided).toBe(false);
      });

      const orderDocId = await orderDocIdFromBill(ids.billId);
      const todays = await db.collection('orders').doc(orderDocId).collection('_TodaysOrders').get();
      expect(todays.size).toBe(3);
      todays.docs.forEach((doc) => {
        expect(doc.data().status).toBe('preparing');
      });
    });

    it('同一 nonce+同一 items 再送は reused・重複なし', async () => {
      const ids = makeIds('replay');
      await createTestMenuItem(ids.menuItemId, 'Beer', 'drink', 500);
      await createBillWithActiveStay({
        billId: ids.billId,
        userId: ids.userId,
        pokerName: 'T',
        idempotencyKey: `idem_${ids.billId}`,
      });

      const req = {
        data: {
          clientNonce: ids.clientNonce,
          items: [{ menuItemId: ids.menuItemId, quantity: 2 }],
        },
        auth: { uid: ids.userId },
      } as any;

      const r1 = await placeOrderByUser.run(req);
      const r2 = await placeOrderByUser.run(req);

      expect(r1.success).toBe(true);
      expect(r1.data.reused).toBe(false);
      expect(r2.success).toBe(true);
      expect(r2.data.reused).toBe(true);
      expect(r2.data.totalAmount).toBe(r1.data.totalAmount);
      expect(r2.data.items[0].itemId).toBe(r1.data.items[0].itemId);

      const itemsSnap = await db.collection('bills').doc(ids.billId).collection('items').get();
      expect(itemsSnap.size).toBe(1);

      const orderDocId = await orderDocIdFromBill(ids.billId);
      const ordersDoc = await db.collection('orders').doc(orderDocId).get();
      expect(ordersDoc.data()!.onedayOrderQuantity).toBe(1);
    });

    it('同一 nonce+異なる items は ORDER_NONCE_CONFLICT・書込みなし', async () => {
      const ids = makeIds('conflict');
      const m2 = `${ids.menuItemId}_b`;
      await createTestMenuItem(ids.menuItemId, 'A', 'drink', 100);
      await createTestMenuItem(m2, 'B', 'drink', 200);
      await createBillWithActiveStay({
        billId: ids.billId,
        userId: ids.userId,
        pokerName: 'T',
        idempotencyKey: `idem_${ids.billId}`,
      });

      await placeOrderByUser.run({
        data: {
          clientNonce: ids.clientNonce,
          items: [{ menuItemId: ids.menuItemId, quantity: 1 }],
        },
        auth: { uid: ids.userId },
      } as any);

      await expect(
        placeOrderByUser.run({
          data: {
            clientNonce: ids.clientNonce,
            items: [{ menuItemId: m2, quantity: 1 }],
          },
          auth: { uid: ids.userId },
        } as any),
      ).rejects.toMatchObject({
        code: 'failed-precondition',
        details: { errorKey: 'ORDER_NONCE_CONFLICT' },
      });

      const itemsSnap = await db.collection('bills').doc(ids.billId).collection('items').get();
      expect(itemsSnap.size).toBe(1);
    });

    it('別 nonce+同一 items は別注文', async () => {
      const ids = makeIds('other_nonce');
      await createTestMenuItem(ids.menuItemId, 'Beer', 'drink', 500);
      await createBillWithActiveStay({
        billId: ids.billId,
        userId: ids.userId,
        pokerName: 'T',
        idempotencyKey: `idem_${ids.billId}`,
      });

      await placeOrderByUser.run({
        data: {
          clientNonce: `${ids.clientNonce}_a`,
          items: [{ menuItemId: ids.menuItemId, quantity: 1 }],
        },
        auth: { uid: ids.userId },
      } as any);
      await placeOrderByUser.run({
        data: {
          clientNonce: `${ids.clientNonce}_b`,
          items: [{ menuItemId: ids.menuItemId, quantity: 1 }],
        },
        auth: { uid: ids.userId },
      } as any);

      const itemsSnap = await db.collection('bills').doc(ids.billId).collection('items').get();
      expect(itemsSnap.size).toBe(2);
    });

    it('重複 menuItemId は quantity 合算', async () => {
      const ids = makeIds('merge');
      await createTestMenuItem(ids.menuItemId, 'Beer', 'drink', 100);
      await createBillWithActiveStay({
        billId: ids.billId,
        userId: ids.userId,
        pokerName: 'T',
        idempotencyKey: `idem_${ids.billId}`,
      });

      const result = await placeOrderByUser.run({
        data: {
          clientNonce: ids.clientNonce,
          items: [
            { menuItemId: ids.menuItemId, quantity: 2 },
            { menuItemId: ids.menuItemId, quantity: 3 },
          ],
        },
        auth: { uid: ids.userId },
      } as any);

      expect(result.data.itemsCount).toBe(1);
      expect(result.data.items[0].quantity).toBe(5);
      expect(result.data.totalAmount).toBe(500);
    });
  });

  describe('atomic failure → 0 writes', () => {
    it('2件目 soldOut なら 0件', async () => {
      const ids = makeIds('soldout_atomic');
      const m2 = `${ids.menuItemId}_2`;
      await createTestMenuItem(ids.menuItemId, 'A', 'drink', 100);
      await createTestMenuItem(m2, 'B', 'drink', 200, { isSoldOut: true });
      await createBillWithActiveStay({
        billId: ids.billId,
        userId: ids.userId,
        pokerName: 'T',
        idempotencyKey: `idem_${ids.billId}`,
      });

      await expect(
        placeOrderByUser.run({
          data: {
            clientNonce: ids.clientNonce,
            items: [
              { menuItemId: ids.menuItemId, quantity: 1 },
              { menuItemId: m2, quantity: 1 },
            ],
          },
          auth: { uid: ids.userId },
        } as any),
      ).rejects.toMatchObject({
        details: { errorKey: 'ORDER_ITEM_SOLD_OUT' },
      });

      const itemsSnap = await db.collection('bills').doc(ids.billId).collection('items').get();
      expect(itemsSnap.size).toBe(0);
      const reqSnap = await db
        .collection('bills')
        .doc(ids.billId)
        .collection('orderRequests')
        .doc(ids.clientNonce)
        .get();
      expect(reqSnap.exists).toBe(false);
    });

    it('2件目 不存在なら 0件', async () => {
      const ids = makeIds('missing_atomic');
      await createTestMenuItem(ids.menuItemId, 'A', 'drink', 100);
      await createBillWithActiveStay({
        billId: ids.billId,
        userId: ids.userId,
        pokerName: 'T',
        idempotencyKey: `idem_${ids.billId}`,
      });

      await expect(
        placeOrderByUser.run({
          data: {
            clientNonce: ids.clientNonce,
            items: [
              { menuItemId: ids.menuItemId, quantity: 1 },
              { menuItemId: 'does_not_exist', quantity: 1 },
            ],
          },
          auth: { uid: ids.userId },
        } as any),
      ).rejects.toMatchObject({
        details: { errorKey: 'ORDER_ITEM_NOT_FOUND' },
      });

      const itemsSnap = await db.collection('bills').doc(ids.billId).collection('items').get();
      expect(itemsSnap.size).toBe(0);
    });

    it('archive は ORDER_ITEM_UNAVAILABLE・0件', async () => {
      const ids = makeIds('archive');
      await createTestMenuItem(ids.menuItemId, 'A', 'drink', 100, { isArchive: true });
      await createBillWithActiveStay({
        billId: ids.billId,
        userId: ids.userId,
        pokerName: 'T',
        idempotencyKey: `idem_${ids.billId}`,
      });

      await expect(
        placeOrderByUser.run({
          data: {
            clientNonce: ids.clientNonce,
            items: [{ menuItemId: ids.menuItemId, quantity: 1 }],
          },
          auth: { uid: ids.userId },
        } as any),
      ).rejects.toMatchObject({
        details: { errorKey: 'ORDER_ITEM_UNAVAILABLE' },
      });
    });
  });

  describe('quantity / bill status', () => {
    it('quantity 0 / 負数 / 小数を拒否', async () => {
      for (const quantity of [0, -1, 1.5, NaN, Infinity]) {
        await expect(
          placeOrderByUser.run({
            data: {
              clientNonce: `n_${quantity}`,
              items: [{ menuItemId: 'm', quantity }],
            },
            auth: { uid: 'u' },
          } as any),
        ).rejects.toMatchObject({
          details: { errorKey: 'ORDER_QUANTITY_INVALID' },
        });
      }
    });

    it(`quantity > ${MAX_ORDER_QUANTITY_PER_LINE} を拒否`, async () => {
      await expect(
        placeOrderByUser.run({
          data: {
            clientNonce: 'n_max',
            items: [{ menuItemId: 'm', quantity: MAX_ORDER_QUANTITY_PER_LINE + 1 }],
          },
          auth: { uid: 'u' },
        } as any),
      ).rejects.toMatchObject({
        details: { errorKey: 'ORDER_QUANTITY_INVALID' },
      });
    });

    it('settled bill は ORDER_BILL_NOT_OPEN', async () => {
      const ids = makeIds('settled');
      await createTestMenuItem(ids.menuItemId, 'Beer', 'drink', 500);
      await createBillWithActiveStay({
        billId: ids.billId,
        userId: ids.userId,
        pokerName: 'T',
        idempotencyKey: `idem_${ids.billId}`,
      });
      await db.collection('bills').doc(ids.billId).set({ status: 'settled' }, { merge: true });

      await expect(
        placeOrderByUser.run({
          data: {
            clientNonce: ids.clientNonce,
            items: [{ menuItemId: ids.menuItemId, quantity: 1 }],
          },
          auth: { uid: ids.userId },
        } as any),
      ).rejects.toMatchObject({
        code: 'failed-precondition',
        details: { errorKey: 'ORDER_BILL_NOT_OPEN' },
      });
    });

    it('active bill なしは ORDER_ACTIVE_BILL_NOT_FOUND', async () => {
      const ids = makeIds('no_bill');
      await createTestMenuItem(ids.menuItemId, 'Beer', 'drink', 500);

      await expect(
        placeOrderByUser.run({
          data: {
            clientNonce: ids.clientNonce,
            items: [{ menuItemId: ids.menuItemId, quantity: 1 }],
          },
          auth: { uid: ids.userId },
        } as any),
      ).rejects.toMatchObject({
        details: { errorKey: 'ORDER_ACTIVE_BILL_NOT_FOUND' },
      });
    });
  });

  describe('chip', () => {
    it('chip は bill に載り orders/_TodaysOrders には載らない', async () => {
      const ids = makeIds('chip');
      await createTestMenuItem(ids.menuItemId, 'Chip 1000', 'chip', 1000);
      await createBillWithActiveStay({
        billId: ids.billId,
        userId: ids.userId,
        pokerName: 'T',
        idempotencyKey: `idem_${ids.billId}`,
      });

      const result = await placeOrderByUser.run({
        data: {
          clientNonce: ids.clientNonce,
          items: [{ menuItemId: ids.menuItemId, quantity: 1 }],
        },
        auth: { uid: ids.userId },
      } as any);

      expect(result.success).toBe(true);
      const itemsSnap = await db.collection('bills').doc(ids.billId).collection('items').get();
      expect(itemsSnap.size).toBe(1);
      const orderDocId = await orderDocIdFromBill(ids.billId);
      const todays = await db.collection('orders').doc(orderDocId).collection('_TodaysOrders').get();
      expect(todays.empty).toBe(true);
    });
  });

  describe('transaction 内 menu 最新 snapshot（race）', () => {
    it('retry 時に soldOut へ変更 → 拒否・0 item', async () => {
      const ids = makeIds('race_soldout');
      await createTestMenuItem(ids.menuItemId, 'Beer', 'drink', 500);
      await createBillWithActiveStay({
        billId: ids.billId,
        userId: ids.userId,
        pokerName: 'T',
        idempotencyKey: `idem_${ids.billId}`,
      });

      placeOrderByUserAtomicTestHooks.abortAfterMenuReadOnAttempt1 = true;
      placeOrderByUserAtomicTestHooks.mutateMenuBeforeAttempt = async (attempt) => {
        if (attempt === 2) {
          await db.collection('menuItems').doc(ids.menuItemId).update({ isSoldOut: true });
        }
      };

      await expect(
        placeOrderByUser.run({
          data: {
            clientNonce: ids.clientNonce,
            items: [{ menuItemId: ids.menuItemId, quantity: 1 }],
          },
          auth: { uid: ids.userId },
        } as any),
      ).rejects.toMatchObject({
        details: { errorKey: 'ORDER_ITEM_SOLD_OUT' },
      });

      const itemsSnap = await db.collection('bills').doc(ids.billId).collection('items').get();
      expect(itemsSnap.size).toBe(0);
      const reqSnap = await db
        .collection('bills')
        .doc(ids.billId)
        .collection('orderRequests')
        .doc(ids.clientNonce)
        .get();
      expect(reqSnap.exists).toBe(false);
    });

    it('retry 時に archive へ変更 → 拒否・0 item', async () => {
      const ids = makeIds('race_archive');
      await createTestMenuItem(ids.menuItemId, 'Beer', 'drink', 500);
      await createBillWithActiveStay({
        billId: ids.billId,
        userId: ids.userId,
        pokerName: 'T',
        idempotencyKey: `idem_${ids.billId}`,
      });

      placeOrderByUserAtomicTestHooks.abortAfterMenuReadOnAttempt1 = true;
      placeOrderByUserAtomicTestHooks.mutateMenuBeforeAttempt = async (attempt) => {
        if (attempt === 2) {
          await db.collection('menuItems').doc(ids.menuItemId).update({ isArchive: true });
        }
      };

      await expect(
        placeOrderByUser.run({
          data: {
            clientNonce: ids.clientNonce,
            items: [{ menuItemId: ids.menuItemId, quantity: 1 }],
          },
          auth: { uid: ids.userId },
        } as any),
      ).rejects.toMatchObject({
        details: { errorKey: 'ORDER_ITEM_UNAVAILABLE' },
      });

      const itemsSnap = await db.collection('bills').doc(ids.billId).collection('items').get();
      expect(itemsSnap.size).toBe(0);
    });

    it('retry 時に price 変更 → server 最新価格で成功', async () => {
      const ids = makeIds('race_price');
      await createTestMenuItem(ids.menuItemId, 'Beer', 'drink', 500);
      await createBillWithActiveStay({
        billId: ids.billId,
        userId: ids.userId,
        pokerName: 'T',
        idempotencyKey: `idem_${ids.billId}`,
      });

      placeOrderByUserAtomicTestHooks.abortAfterMenuReadOnAttempt1 = true;
      placeOrderByUserAtomicTestHooks.mutateMenuBeforeAttempt = async (attempt) => {
        if (attempt === 2) {
          await db.collection('menuItems').doc(ids.menuItemId).update({ price: 777 });
        }
      };

      const result = await placeOrderByUser.run({
        data: {
          clientNonce: ids.clientNonce,
          items: [{ menuItemId: ids.menuItemId, quantity: 2, price: 1 }],
        },
        auth: { uid: ids.userId },
      } as any);

      expect(result.success).toBe(true);
      expect(result.data.items[0].unitPrice).toBe(777);
      expect(result.data.totalAmount).toBe(1554);

      const itemDoc = (
        await db.collection('bills').doc(ids.billId).collection('items').get()
      ).docs[0];
      expect(itemDoc.data()!.unitPriceIncl).toBe(777);
    });

    it('parseOrderableMenuItemFromData は snapshot を厳密に判定', () => {
      expect(() =>
        parseOrderableMenuItemFromData('m', undefined, false),
      ).toThrow();
      expect(() =>
        parseOrderableMenuItemFromData('m', { name: 'A', category: 'd', price: 1, isSoldOut: true }, true),
      ).toThrow();
      const ok = parseOrderableMenuItemFromData(
        'm',
        { name: 'A', category: 'drink', price: 100, isArchive: false, isSoldOut: false },
        true,
      );
      expect(ok.unitPriceIncl).toBe(100);
    });
  });

  describe('post-commit response 更新失敗時の冪等性', () => {
    it('commit 成功後 response 更新失敗 → 同一 nonce 再送で reused・item 不変', async () => {
      const ids = makeIds('post_commit_fail');
      await createTestMenuItem(ids.menuItemId, 'Beer', 'drink', 500);
      await createBillWithActiveStay({
        billId: ids.billId,
        userId: ids.userId,
        pokerName: 'T',
        idempotencyKey: `idem_${ids.billId}`,
      });

      placeOrderByUserAtomicTestHooks.failPostCommitResponseUpdate = true;

      const first = await placeOrderByUser.run({
        data: {
          clientNonce: ids.clientNonce,
          items: [{ menuItemId: ids.menuItemId, quantity: 2 }],
        },
        auth: { uid: ids.userId },
      } as any);

      expect(first.success).toBe(true);
      expect(first.data.reused).toBe(false);
      expect(first.data.totalAmount).toBe(1000);

      const reqSnap = await db
        .collection('bills')
        .doc(ids.billId)
        .collection('orderRequests')
        .doc(ids.clientNonce)
        .get();
      expect(reqSnap.exists).toBe(true);
      expect(reqSnap.data()!.status).toBe('succeeded');
      expect(reqSnap.data()!.itemSnapshots).toHaveLength(1);
      expect(reqSnap.data()!.response).toBeUndefined();

      placeOrderByUserAtomicTestHooks.failPostCommitResponseUpdate = undefined;

      const second = await placeOrderByUser.run({
        data: {
          clientNonce: ids.clientNonce,
          items: [{ menuItemId: ids.menuItemId, quantity: 2 }],
        },
        auth: { uid: ids.userId },
      } as any);

      expect(second.success).toBe(true);
      expect(second.data.reused).toBe(true);
      expect(second.data.itemsCount).toBe(1);
      expect(second.data.totalQuantity).toBe(2);
      expect(second.data.totalAmount).toBe(1000);
      expect(second.data.items[0].itemId).toBe(first.data.items[0].itemId);
      expect(JSON.stringify(second)).not.toMatch(/stack|transaction|FIRESTORE/i);

      const itemsSnap = await db.collection('bills').doc(ids.billId).collection('items').get();
      expect(itemsSnap.size).toBe(1);
    });
  });
});
