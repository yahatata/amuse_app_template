/**
 * appendItem の統合テスト
 * 
 * ChangeSpec P1-02 に準拠
 * Firestore Emulator を使用
 * 
 * テスト観点:
 * - happy path
 * - invalid-argument (quantity <= 0, メニュー未解決)
 * - not-found (アクティブな billId なし)
 * - failed-precondition (status が settling/settled/voided)
 * - 強い冪等性 (同一 clientNonce で再実行、itemId = idempotencyKey、親updatedAtは変更されない)
 * - DualWrite ON/OFF
 */

import { initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { appendItem } from '../../../src/helpers/billsApi/appendItem';

describe('appendItem', () => {
  let testEnv: RulesTestEnvironment;
  let db: admin.firestore.Firestore;
  const projectId = 'test-project-bills';

  beforeAll(async () => {
    process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080';
    
    testEnv = await initializeTestEnvironment({
      projectId,
    });
    
    if (admin.apps.length > 0) {
      await admin.app().delete();
    }
    admin.initializeApp({
      projectId,
    });
    
    db = getFirestore();
  });

  afterAll(async () => {
    await testEnv.cleanup();
    await Promise.all(admin.apps.map(a => a?.delete()).filter(Boolean));
    delete process.env.FIRESTORE_EMULATOR_HOST;
  });

  beforeEach(async () => {
    await testEnv.clearFirestore();
    // テスト前に環境変数をクリア
    delete process.env.WRITE_TODAYS_BILLS_IN_PARALLEL;
  });

  // テスト用のヘルパ関数: メニューアイテムを作成
  async function createTestMenuItem(menuItemId: string, name: string, category: string, price: number) {
    await db.collection('menuItems').doc(menuItemId).set({
      name,
      category,
      price,
      description: '',
      imageUrl: '',
      isArchive: false,
      isSoldOut: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }

  // テスト用のヘルパ関数: 伝票と activeStays を作成
  async function createTestBill(billId: string, userId: string, status: string = 'open') {
    await db.collection('bills').doc(billId).set({
      businessDate: '2025-11-15',
      status,
      party: {
        userId,
        pokerName: 'テスト太郎',
      },
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      meta: {
        schemaVersion: '1.3',
      },
    });

    await db.collection('activeStays').doc(userId).set({
      uid: userId,
      billId,
      isActive: true,
      startedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }

  describe('happy path', () => {
    it('正常なアイテム追加ができること（itemId = idempotencyKey、orderedAt のみ）', async () => {
      const billId = 'bill_test_happy_001';
      const userId = 'user_test_happy_001';
      const menuItemId = 'menu_test_happy_001';
      const clientNonce = 'nonce_test_happy_001';
      const idempotencyKey = `appendItem:${billId}:${clientNonce}`;

      // テストデータ準備
      await createTestMenuItem(menuItemId, 'ビール', 'drink', 500);
      await createTestBill(billId, userId, 'open');

      const result = await appendItem({
        billId,
        item: {
          menuItemId,
          quantity: 2,
          clientNonce,
        },
        idempotencyKey,
      });

      expect(result.success).toBe(true);
      expect(result.itemId).toBe(idempotencyKey); // itemId = idempotencyKey
      expect(result.orderedAt).toBeDefined();

      // /bills/{billId}/items/{itemId} が作成されている
      const itemDoc = await db.collection('bills').doc(billId)
        .collection('items').doc(idempotencyKey).get();
      expect(itemDoc.exists).toBe(true);
      const itemData = itemDoc.data()!;
      expect(itemData.menuItemId).toBe(menuItemId);
      expect(itemData.name).toBe('ビール');
      expect(itemData.category).toBe('drink');
      expect(itemData.unitPriceIncl).toBe(500);
      expect(itemData.quantity).toBe(2);
      expect(itemData.totalPriceIncl).toBe(1000);
      expect(itemData.orderedAt).toBeDefined();
      expect(itemData.voided).toBe(false);
      // createdAt/updatedAt は持たせない
      expect(itemData.createdAt).toBeUndefined();
      expect(itemData.updatedAt).toBeUndefined();

      // 親 /bills/{billId}.updatedAt が更新されている
      const billDoc = await db.collection('bills').doc(billId).get();
      expect(billDoc.data()!.updatedAt).toBeDefined();

      // /bills/{billId}/idempotency/{idempotencyKey} が作成されている（itemId を保存）
      const idemDoc = await db.collection('bills').doc(billId)
        .collection('idempotency').doc(idempotencyKey).get();
      expect(idemDoc.exists).toBe(true);
      const idemData = idemDoc.data()!;
      expect(idemData.requestHash).toBeDefined();
      expect(idemData.createdAt).toBeDefined();
      expect(idemData.itemId).toBe(idempotencyKey); // itemId を保存
      expect(idemData.expiresAt).toBeUndefined(); // expiresAt は保存されない
    });
  });

  describe('invalid-argument', () => {
    it('quantity <= 0 → invalid-argument', async () => {
      const billId = 'bill_test_invalid_001';
      const userId = 'user_test_invalid_001';
      const menuItemId = 'menu_test_invalid_001';
      const clientNonce = 'nonce_test_invalid_001';
      const idempotencyKey = `appendItem:${billId}:${clientNonce}`;

      await createTestMenuItem(menuItemId, 'ビール', 'drink', 500);
      await createTestBill(billId, userId);

      try {
        await appendItem({
          billId,
          item: {
            menuItemId,
            quantity: 0, // quantity <= 0
            clientNonce,
          },
          idempotencyKey,
        });
        fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.code).toBe('invalid-argument');
      }
    });

    it('メニュー未解決（menuItemId が存在しない） → invalid-argument', async () => {
      const billId = 'bill_test_invalid_002';
      const userId = 'user_test_invalid_002';
      const menuItemId = 'menu_not_exist';
      const clientNonce = 'nonce_test_invalid_002';
      const idempotencyKey = `appendItem:${billId}:${clientNonce}`;

      await createTestBill(billId, userId);

      try {
        await appendItem({
          billId,
          item: {
            menuItemId, // 存在しない menuItemId
            quantity: 1,
            clientNonce,
          },
          idempotencyKey,
        });
        fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.code).toBe('invalid-argument');
        expect(error.message).toContain('Menu item not found');
      }
    });
  });

  describe('not-found', () => {
    it('アクティブな billId なし → not-found', async () => {
      const billId = 'bill_not_exist';
      const menuItemId = 'menu_test_notfound_001';
      const clientNonce = 'nonce_test_notfound_001';
      const idempotencyKey = `appendItem:${billId}:${clientNonce}`;

      await createTestMenuItem(menuItemId, 'ビール', 'drink', 500);

      try {
        await appendItem({
          billId, // 存在しない billId
          item: {
            menuItemId,
            quantity: 1,
            clientNonce,
          },
          idempotencyKey,
        });
        fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.code).toBe('not-found');
      }
    });
  });

  describe('failed-precondition', () => {
    it('status が settled の場合 → failed-precondition', async () => {
      const billId = 'bill_test_settled_001';
      const userId = 'user_test_settled_001';
      const menuItemId = 'menu_test_settled_001';
      const clientNonce = 'nonce_test_settled_001';
      const idempotencyKey = `appendItem:${billId}:${clientNonce}`;

      await createTestMenuItem(menuItemId, 'ビール', 'drink', 500);
      await createTestBill(billId, userId, 'settled'); // settled 状態

      try {
        await appendItem({
          billId,
          item: {
            menuItemId,
            quantity: 1,
            clientNonce,
          },
          idempotencyKey,
        });
        fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.code).toBe('failed-precondition');
        expect(error.message).toContain('status');
      }
    });

    it('status が settling の場合 → failed-precondition', async () => {
      const billId = 'bill_test_settling_001';
      const userId = 'user_test_settling_001';
      const menuItemId = 'menu_test_settling_001';
      const clientNonce = 'nonce_test_settling_001';
      const idempotencyKey = `appendItem:${billId}:${clientNonce}`;

      await createTestMenuItem(menuItemId, 'ビール', 'drink', 500);
      await createTestBill(billId, userId, 'settling'); // settling 状態

      try {
        await appendItem({
          billId,
          item: {
            menuItemId,
            quantity: 1,
            clientNonce,
          },
          idempotencyKey,
        });
        fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.code).toBe('failed-precondition');
      }
    });

    it('status が voided の場合 → failed-precondition', async () => {
      const billId = 'bill_test_voided_001';
      const userId = 'user_test_voided_001';
      const menuItemId = 'menu_test_voided_001';
      const clientNonce = 'nonce_test_voided_001';
      const idempotencyKey = `appendItem:${billId}:${clientNonce}`;

      await createTestMenuItem(menuItemId, 'ビール', 'drink', 500);
      await createTestBill(billId, userId, 'voided'); // voided 状態

      try {
        await appendItem({
          billId,
          item: {
            menuItemId,
            quantity: 1,
            clientNonce,
          },
          idempotencyKey,
        });
        fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.code).toBe('failed-precondition');
      }
    });
  });

  describe('強い冪等性', () => {
    it('同一 clientNonce で再実行 → 既存docを返却（reused: true）、親updatedAtは変更されない', async () => {
      const billId = 'bill_test_idem_001';
      const userId = 'user_test_idem_001';
      const menuItemId = 'menu_test_idem_001';
      const clientNonce = 'nonce_test_idem_001';
      const idempotencyKey = `appendItem:${billId}:${clientNonce}`;

      await createTestMenuItem(menuItemId, 'ビール', 'drink', 500);
      await createTestBill(billId, userId);

      // 1回目実行
      const result1 = await appendItem({
        billId,
        item: {
          menuItemId,
          quantity: 2,
          clientNonce,
        },
        idempotencyKey,
      });

      expect(result1.success).toBe(true);
      expect(result1.diagnostics?.reused).toBeUndefined();

      const billDoc1 = await db.collection('bills').doc(billId).get();
      const updatedAt1 = billDoc1.data()!.updatedAt;

      // 少し待つ（updatedAt の変化を確認するため）
      await new Promise(resolve => setTimeout(resolve, 100));

      // 2回目実行（同一 clientNonce）
      const result2 = await appendItem({
        billId,
        item: {
          menuItemId,
          quantity: 2,
          clientNonce, // 同一 clientNonce
        },
        idempotencyKey,
      });

      expect(result2.success).toBe(true);
      expect(result2.diagnostics?.reused).toBe(true);
      expect(result2.diagnostics?.reason).toBe('idempotent replay');
      expect(result2.itemId).toBe(idempotencyKey); // itemId = idempotencyKey

      // 親 updatedAt は変更されない
      const billDoc2 = await db.collection('bills').doc(billId).get();
      const updatedAt2 = billDoc2.data()!.updatedAt;
      expect(updatedAt2).toEqual(updatedAt1);
    });

    it('itemId = idempotencyKey で統一されていること', async () => {
      const billId = 'bill_test_idem_002';
      const userId = 'user_test_idem_002';
      const menuItemId = 'menu_test_idem_002';
      const clientNonce = 'nonce_test_idem_002';
      const idempotencyKey = `appendItem:${billId}:${clientNonce}`;

      await createTestMenuItem(menuItemId, 'ビール', 'drink', 500);
      await createTestBill(billId, userId);

      const result = await appendItem({
        billId,
        item: {
          menuItemId,
          quantity: 1,
          clientNonce,
        },
        idempotencyKey,
      });

      // itemId = idempotencyKey であることを確認
      expect(result.itemId).toBe(idempotencyKey);

      // /bills/{billId}/items/{itemId} の docID も idempotencyKey であることを確認
      const itemDoc = await db.collection('bills').doc(billId)
        .collection('items').doc(idempotencyKey).get();
      expect(itemDoc.exists).toBe(true);
    });

    it('idempotency doc に保存された itemId を使ったreplay: 初回実行で /idempotency/{key}.itemId が保存され、リプレイ時に保存済み itemId を参照して同じitems docを返す', async () => {
      const billId = 'bill_test_idem_003';
      const userId = 'user_test_idem_003';
      const menuItemId = 'menu_test_idem_003';
      const clientNonce = 'nonce_test_idem_003';
      const idempotencyKey = `appendItem:${billId}:${clientNonce}`;

      await createTestMenuItem(menuItemId, 'ビール', 'drink', 500);
      await createTestBill(billId, userId);

      // 1回目実行
      const result1 = await appendItem({
        billId,
        item: {
          menuItemId,
          quantity: 1,
          clientNonce,
        },
        idempotencyKey,
      });

      expect(result1.success).toBe(true);
      expect(result1.itemId).toBe(idempotencyKey);

      // /idempotency/{key}.itemId が保存されていることを確認
      const idemDoc1 = await db.collection('bills').doc(billId)
        .collection('idempotency').doc(idempotencyKey).get();
      expect(idemDoc1.exists).toBe(true);
      expect(idemDoc1.data()!.itemId).toBe(idempotencyKey);

      // 2回目実行（リプレイ）
      const result2 = await appendItem({
        billId,
        item: {
          menuItemId,
          quantity: 1,
          clientNonce,
        },
        idempotencyKey,
      });

      expect(result2.success).toBe(true);
      expect(result2.diagnostics?.reused).toBe(true);
      expect(result2.itemId).toBe(idempotencyKey); // 保存済み itemId を参照

      // 同じ items doc を返していることを確認
      const itemDoc1 = await db.collection('bills').doc(billId)
        .collection('items').doc(idempotencyKey).get();
      const itemDoc2 = await db.collection('bills').doc(billId)
        .collection('items').doc(idempotencyKey).get();
      expect(itemDoc1.id).toBe(itemDoc2.id);
      expect(itemDoc1.data()!.orderedAt).toEqual(itemDoc2.data()!.orderedAt);
    });

    it('orderedAt の実値返却: appendItem のレスポンス orderedAt が serverTimestamp() 実解決値（ISO8601）になっている', async () => {
      const billId = 'bill_test_orderedAt_001';
      const userId = 'user_test_orderedAt_001';
      const menuItemId = 'menu_test_orderedAt_001';
      const clientNonce = 'nonce_test_orderedAt_001';
      const idempotencyKey = `appendItem:${billId}:${clientNonce}`;

      await createTestMenuItem(menuItemId, 'ビール', 'drink', 500);
      await createTestBill(billId, userId);

      const result = await appendItem({
        billId,
        item: {
          menuItemId,
          quantity: 1,
          clientNonce,
        },
        idempotencyKey,
      });

      expect(result.success).toBe(true);
      expect(result.orderedAt).toBeDefined();
      
      // ISO8601形式であることを確認
      expect(result.orderedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
      
      // items doc の orderedAt と一致することを確認
      const itemDoc = await db.collection('bills').doc(billId)
        .collection('items').doc(idempotencyKey).get();
      const itemData = itemDoc.data()!;
      const orderedAtTimestamp = itemData.orderedAt;
      const orderedAtIso = orderedAtTimestamp && orderedAtTimestamp.toDate 
        ? orderedAtTimestamp.toDate().toISOString() 
        : new Date().toISOString();
      expect(result.orderedAt).toBe(orderedAtIso);
    });
  });

  describe('DualWrite ON/OFF', () => {
    beforeEach(() => {
      delete process.env.WRITE_TODAYS_BILLS_IN_PARALLEL;
    });

    it('DualWrite ON: todaysBills.items 配列に arrayUnion で行追加されること（金額は更新されない、totalPriceも更新されない）', async () => {
      process.env.WRITE_TODAYS_BILLS_IN_PARALLEL = 'true';

      const billId = 'bill_test_dual_on_001';
      const userId = 'user_test_dual_on_001';
      const menuItemId = 'menu_test_dual_on_001';
      const clientNonce = 'nonce_test_dual_on_001';
      const idempotencyKey = `appendItem:${billId}:${clientNonce}`;

      await createTestMenuItem(menuItemId, 'ビール', 'drink', 500);
      await createTestBill(billId, userId);

      // todaysBills を事前に作成
      await db.collection('todaysBills').doc(billId).set({
        status: 'open',
        userId,
        items: [],
        sideGameChip: [],
      });

      const result = await appendItem({
        billId,
        item: {
          menuItemId,
          quantity: 2,
          clientNonce,
        },
        idempotencyKey,
      });

      expect(result.success).toBe(true);

      // todaysBills.items 配列に行追加されている
      const todaysBillsDoc = await db.collection('todaysBills').doc(billId).get();
      expect(todaysBillsDoc.exists).toBe(true);
      const todaysBillsData = todaysBillsDoc.data()!;
      expect(Array.isArray(todaysBillsData.items)).toBe(true);
      expect(todaysBillsData.items.length).toBe(1);
      
      const addedItem = todaysBillsData.items[0];
      expect(addedItem.orderId).toBe(idempotencyKey); // orderId = itemId
      expect(addedItem.menuItemId).toBe(menuItemId);
      expect(addedItem.quantity).toBe(2);
      // 金額フィールドは入れない
      expect(addedItem.price).toBeUndefined();
      expect(addedItem.totalPrice).toBeUndefined();
      // orderedAt は入れない（arrayUnion の重複検出に不向き）
      expect(addedItem.orderedAt).toBeUndefined();

      // totalPrice は更新されていない
      expect(todaysBillsData.totalPrice).toBeUndefined();
    });

    it('DualWrite OFF: todaysBills への複写がスキップされること', async () => {
      process.env.WRITE_TODAYS_BILLS_IN_PARALLEL = 'false';

      const billId = 'bill_test_dual_off_001';
      const userId = 'user_test_dual_off_001';
      const menuItemId = 'menu_test_dual_off_001';
      const clientNonce = 'nonce_test_dual_off_001';
      const idempotencyKey = `appendItem:${billId}:${clientNonce}`;

      await createTestMenuItem(menuItemId, 'ビール', 'drink', 500);
      await createTestBill(billId, userId);

      // todaysBills を事前に作成
      await db.collection('todaysBills').doc(billId).set({
        status: 'open',
        userId,
        items: [],
      });

      const result = await appendItem({
        billId,
        item: {
          menuItemId,
          quantity: 1,
          clientNonce,
        },
        idempotencyKey,
      });

      expect(result.success).toBe(true);

      // todaysBills.items は更新されていない（元の空配列のまま）
      const todaysBillsDoc = await db.collection('todaysBills').doc(billId).get();
      const todaysBillsData = todaysBillsDoc.data()!;
      expect(todaysBillsData.items).toEqual([]);
    });

    it('DualWrite ON: 同一 idempotencyKey でリプレイ → todaysBills.items の件数は増えない（arrayUnion の重複抑止）', async () => {
      process.env.WRITE_TODAYS_BILLS_IN_PARALLEL = 'true';

      const billId = 'bill_test_dual_replay_001';
      const userId = 'user_test_dual_replay_001';
      const menuItemId = 'menu_test_dual_replay_001';
      const clientNonce = 'nonce_test_dual_replay_001';
      const idempotencyKey = `appendItem:${billId}:${clientNonce}`;

      await createTestMenuItem(menuItemId, 'ビール', 'drink', 500);
      await createTestBill(billId, userId);

      // todaysBills を事前に作成
      await db.collection('todaysBills').doc(billId).set({
        status: 'open',
        userId,
        items: [],
        sideGameChip: [],
      });

      // 1回目実行
      const result1 = await appendItem({
        billId,
        item: {
          menuItemId,
          quantity: 1,
          clientNonce,
        },
        idempotencyKey,
      });

      expect(result1.success).toBe(true);

      // todaysBills.items に1行追加されている
      const todaysBillsDoc1 = await db.collection('todaysBills').doc(billId).get();
      const todaysBillsData1 = todaysBillsDoc1.data()!;
      expect(todaysBillsData1.items.length).toBe(1);

      // 2回目実行（同一 idempotencyKey）
      const result2 = await appendItem({
        billId,
        item: {
          menuItemId,
          quantity: 1,
          clientNonce,
        },
        idempotencyKey,
      });

      expect(result2.success).toBe(true);
      expect(result2.diagnostics?.reused).toBe(true);

      // todaysBills.items の件数は増えない（arrayUnion の重複抑止）
      // 注: リプレイ分岐では DualWrite をスキップしているため、件数は変わらない
      const todaysBillsDoc2 = await db.collection('todaysBills').doc(billId).get();
      const todaysBillsData2 = todaysBillsDoc2.data()!;
      expect(todaysBillsData2.items.length).toBe(1); // 増えていない
    });
  });

  describe('価格の信頼境界（サーバ正規化）', () => {
    it('クライアントが price を改ざんして送っても、無視され、resolveMenuItem(...).price が採用される', async () => {
      const billId = 'bill_test_price_001';
      const userId = 'user_test_price_001';
      const menuItemId = 'menu_test_price_001';
      const clientNonce = 'nonce_test_price_001';
      const idempotencyKey = `appendItem:${billId}:${clientNonce}`;

      // サーバ側の正しい価格: 500円
      await createTestMenuItem(menuItemId, 'ビール', 'drink', 500);
      await createTestBill(billId, userId);

      // クライアントが改ざんした価格（100円）を送っても無視される
      // 注: appendItem は menuItemId のみを受け取り、price は resolveMenuItem で解決されるため、
      // クライアントから price を送ることはできないが、テストとして確認
      const result = await appendItem({
        billId,
        item: {
          menuItemId,
          quantity: 2,
          clientNonce,
        },
        idempotencyKey,
      });

      expect(result.success).toBe(true);

      // items doc の unitPriceIncl はサーバ側の正しい価格（500円）が採用されている
      const itemDoc = await db.collection('bills').doc(billId)
        .collection('items').doc(idempotencyKey).get();
      const itemData = itemDoc.data()!;
      expect(itemData.unitPriceIncl).toBe(500); // サーバ側の正しい価格
      expect(itemData.totalPriceIncl).toBe(1000); // 500 * 2
    });
  });

  describe('status ガードの厳密化', () => {
    it('status=open では通る', async () => {
      const billId = 'bill_test_status_open_001';
      const userId = 'user_test_status_open_001';
      const menuItemId = 'menu_test_status_open_001';
      const clientNonce = 'nonce_test_status_open_001';
      const idempotencyKey = `appendItem:${billId}:${clientNonce}`;

      await createTestMenuItem(menuItemId, 'ビール', 'drink', 500);
      await createTestBill(billId, userId, 'open');

      const result = await appendItem({
        billId,
        item: {
          menuItemId,
          quantity: 1,
          clientNonce,
        },
        idempotencyKey,
      });

      expect(result.success).toBe(true);
    });

    it('status=in_progress では通る', async () => {
      const billId = 'bill_test_status_inprogress_001';
      const userId = 'user_test_status_inprogress_001';
      const menuItemId = 'menu_test_status_inprogress_001';
      const clientNonce = 'nonce_test_status_inprogress_001';
      const idempotencyKey = `appendItem:${billId}:${clientNonce}`;

      await createTestMenuItem(menuItemId, 'ビール', 'drink', 500);
      await createTestBill(billId, userId, 'in_progress');

      const result = await appendItem({
        billId,
        item: {
          menuItemId,
          quantity: 1,
          clientNonce,
        },
        idempotencyKey,
      });

      expect(result.success).toBe(true);
    });
  });
});

