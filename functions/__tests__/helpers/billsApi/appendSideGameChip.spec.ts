/**
 * appendSideGameChip の統合テスト
 * 
 * ChangeSpec P1-03 に準拠
 * Firestore Emulator を使用
 * 
 * テスト観点:
 * - happy path (withdraw/deposit/purchase)
 * - invalid-argument
 * - not-found
 * - failed-precondition (status が settling/settled/voided)
 * - 強い冪等性 (同一 idempotencyKey で再実行、chipId = idempotencyKey、親updatedAtは変更されない)
 * - DualWrite ON/OFF
 */

import { initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { appendSideGameChip } from '../../../src/domains/bills/repos/appendSideGameChip';

describe('appendSideGameChip', () => {
  let testEnv: RulesTestEnvironment;
  let db: admin.firestore.Firestore;
  const projectId = 'test-project-sidegame';

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
    it('正常な withdraw ができること（chipId = idempotencyKey、amountIncl = null）', async () => {
      const billId = 'bill_test_withdraw_001';
      const userId = 'user_test_withdraw_001';
      const idempotencyKey = `${billId}:appendSideGameChip:test-nonce-001`;

      await createTestBill(billId, userId, 'open');

      const result = await appendSideGameChip({
        billId,
        action: 'withdraw',
        chipQty: 100,
        amountIncl: null,
        menuItemId: null,
        name: null,
        idempotencyKey,
      });

      expect(result.success).toBe(true);
      expect(result.chipId).toBe(idempotencyKey); // chipId = idempotencyKey
      expect(result.action).toBe('withdraw');
      expect(result.orderedAt).toBeDefined();

      // /bills/{billId}/sideGameChips/{chipId} が作成されている
      const chipDoc = await db.collection('bills').doc(billId)
        .collection('sideGameChips').doc(idempotencyKey).get();
      expect(chipDoc.exists).toBe(true);
      const chipData = chipDoc.data()!;
      expect(chipData.action).toBe('withdraw');
      expect(chipData.chipQty).toBe(100);
      expect(chipData.amountIncl).toBeNull();
      expect(chipData.menuItemId).toBeNull();
      expect(chipData.name).toBeNull();
      expect(chipData.orderedAt).toBeDefined();
      expect(chipData.createdAt).toBeDefined();

      // 親 /bills/{billId}.updatedAt が更新されている
      const billDoc = await db.collection('bills').doc(billId).get();
      expect(billDoc.data()!.updatedAt).toBeDefined();

      // /bills/{billId}/idempotency/{idempotencyKey} が作成されている（chipId を保存）
      const idemDoc = await db.collection('bills').doc(billId)
        .collection('idempotency').doc(idempotencyKey).get();
      expect(idemDoc.exists).toBe(true);
      const idemData = idemDoc.data()!;
      expect(idemData.requestHash).toBeDefined();
      expect(idemData.createdAt).toBeDefined();
      expect(idemData.chipId).toBe(idempotencyKey); // chipId を保存
    });

    it('正常な deposit ができること（chipId = idempotencyKey、amountIncl = null）', async () => {
      const billId = 'bill_test_deposit_001';
      const userId = 'user_test_deposit_001';
      const idempotencyKey = `${billId}:appendSideGameChip:test-nonce-002`;

      await createTestBill(billId, userId, 'open');

      const result = await appendSideGameChip({
        billId,
        action: 'deposit',
        chipQty: 200,
        amountIncl: null,
        menuItemId: null,
        name: null,
        idempotencyKey,
      });

      expect(result.success).toBe(true);
      expect(result.chipId).toBe(idempotencyKey);
      expect(result.action).toBe('deposit');

      const chipDoc = await db.collection('bills').doc(billId)
        .collection('sideGameChips').doc(idempotencyKey).get();
      expect(chipDoc.exists).toBe(true);
      const chipData = chipDoc.data()!;
      expect(chipData.action).toBe('deposit');
      expect(chipData.chipQty).toBe(200);
      expect(chipData.amountIncl).toBeNull();
    });

    it('正常な purchase ができること（chipId = idempotencyKey、amountIncl が含まれる）', async () => {
      const billId = 'bill_test_purchase_001';
      const userId = 'user_test_purchase_001';
      const menuItemId = 'menu_test_purchase_001';
      const idempotencyKey = `${billId}:appendSideGameChip:test-nonce-003`;

      await createTestBill(billId, userId, 'open');

      const result = await appendSideGameChip({
        billId,
        action: 'purchase',
        chipQty: 500,
        amountIncl: 5000,
        menuItemId,
        name: 'SideGame 1000',
        idempotencyKey,
      });

      expect(result.success).toBe(true);
      expect(result.chipId).toBe(idempotencyKey);
      expect(result.action).toBe('purchase');

      const chipDoc = await db.collection('bills').doc(billId)
        .collection('sideGameChips').doc(idempotencyKey).get();
      expect(chipDoc.exists).toBe(true);
      const chipData = chipDoc.data()!;
      expect(chipData.action).toBe('purchase');
      expect(chipData.chipQty).toBe(500);
      expect(chipData.amountIncl).toBe(5000);
      expect(chipData.menuItemId).toBe(menuItemId);
      expect(chipData.name).toBe('SideGame 1000');
    });
  });

  describe('invalid-argument', () => {
    it('chipQty <= 0 → invalid-argument', async () => {
      const billId = 'bill_test_invalid_001';
      const userId = 'user_test_invalid_001';
      const idempotencyKey = `${billId}:appendSideGameChip:test-nonce-invalid-001`;

      await createTestBill(billId, userId);

      try {
        await appendSideGameChip({
          billId,
          action: 'withdraw',
          chipQty: 0, // chipQty <= 0
          amountIncl: null,
          menuItemId: null,
          name: null,
          idempotencyKey,
        });
        fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.code).toBe('invalid-argument');
      }
    });

    it('purchase 時に amountIncl <= 0 → invalid-argument', async () => {
      const billId = 'bill_test_invalid_002';
      const userId = 'user_test_invalid_002';
      const idempotencyKey = `${billId}:appendSideGameChip:test-nonce-invalid-002`;

      await createTestBill(billId, userId);

      try {
        await appendSideGameChip({
          billId,
          action: 'purchase',
          chipQty: 100,
          amountIncl: 0, // amountIncl <= 0
          menuItemId: 'menu_test',
          name: 'SideGame 1000',
          idempotencyKey,
        });
        fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.code).toBe('invalid-argument');
      }
    });

    it('withdraw/deposit 時に amountIncl が null でない → invalid-argument', async () => {
      const billId = 'bill_test_invalid_003';
      const userId = 'user_test_invalid_003';
      const idempotencyKey = `${billId}:appendSideGameChip:test-nonce-invalid-003`;

      await createTestBill(billId, userId);

      try {
        await appendSideGameChip({
          billId,
          action: 'withdraw',
          chipQty: 100,
          amountIncl: 1000, // withdraw の場合は null である必要がある
          menuItemId: null,
          name: null,
          idempotencyKey,
        });
        fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.code).toBe('invalid-argument');
      }
    });

    it('action が不正 → invalid-argument', async () => {
      const billId = 'bill_test_invalid_004';
      const userId = 'user_test_invalid_004';
      const idempotencyKey = `${billId}:appendSideGameChip:test-nonce-invalid-004`;

      await createTestBill(billId, userId);

      try {
        await appendSideGameChip({
          billId,
          action: 'invalid' as any, // 不正な action
          chipQty: 100,
          amountIncl: null,
          menuItemId: null,
          name: null,
          idempotencyKey,
        });
        fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.code).toBe('invalid-argument');
      }
    });

    it('billId 未指定の場合 → invalid-argument', async () => {
      await expect(appendSideGameChip({
        billId: '' as any, // 空文字
        action: 'purchase',
        chipQty: 100,
        amountIncl: 1000,
        menuItemId: 'menu_test',
        name: 'SideGame 1000',
        idempotencyKey: 'idem_missing_billId_001',
      })).rejects.toMatchObject({ code: 'invalid-argument' });
    });

    it('action 未指定の場合 → invalid-argument', async () => {
      await expect(appendSideGameChip({
        billId: 'bill_test_invalid_005',
        action: '' as any, // 空文字
        chipQty: 100,
        amountIncl: null,
        menuItemId: null,
        name: null,
        idempotencyKey: 'idem_missing_action_001',
      })).rejects.toMatchObject({ code: 'invalid-argument' });
    });

    it('chipQty 未指定の場合 → invalid-argument', async () => {
      await expect(appendSideGameChip({
        billId: 'bill_test_invalid_006',
        action: 'withdraw',
        chipQty: undefined as any, // undefined
        amountIncl: null,
        menuItemId: null,
        name: null,
        idempotencyKey: 'idem_missing_chipQty_001',
      })).rejects.toMatchObject({ code: 'invalid-argument' });
    });

    it('idempotencyKey 未指定の場合 → invalid-argument', async () => {
      await expect(appendSideGameChip({
        billId: 'bill_test_invalid_007',
        action: 'withdraw',
        chipQty: 100,
        amountIncl: null,
        menuItemId: null,
        name: null,
        idempotencyKey: '' as any, // 空文字
      })).rejects.toMatchObject({ code: 'invalid-argument' });
    });
  });

  describe('not-found', () => {
    it('billId が存在しない → not-found', async () => {
      const billId = 'bill_not_exist';
      const idempotencyKey = `${billId}:appendSideGameChip:test-nonce-notfound-001`;

      try {
        await appendSideGameChip({
          billId, // 存在しない billId
          action: 'withdraw',
          chipQty: 100,
          amountIncl: null,
          menuItemId: null,
          name: null,
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
      const idempotencyKey = `${billId}:appendSideGameChip:test-nonce-settled-001`;

      await createTestBill(billId, userId, 'settled'); // settled 状態

      try {
        await appendSideGameChip({
          billId,
          action: 'withdraw',
          chipQty: 100,
          amountIncl: null,
          menuItemId: null,
          name: null,
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
      const idempotencyKey = `${billId}:appendSideGameChip:test-nonce-settling-001`;

      await createTestBill(billId, userId, 'settling'); // settling 状態

      try {
        await appendSideGameChip({
          billId,
          action: 'withdraw',
          chipQty: 100,
          amountIncl: null,
          menuItemId: null,
          name: null,
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
      const idempotencyKey = `${billId}:appendSideGameChip:test-nonce-voided-001`;

      await createTestBill(billId, userId, 'voided'); // voided 状態

      try {
        await appendSideGameChip({
          billId,
          action: 'withdraw',
          chipQty: 100,
          amountIncl: null,
          menuItemId: null,
          name: null,
          idempotencyKey,
        });
        fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.code).toBe('failed-precondition');
        expect(error.message).toContain('status');
      }
    });
  });

  describe('idempotent-replay', () => {
    it('同一 idempotencyKey で再実行 → 既存docを返却（reused: true）、親updatedAtは変更されない', async () => {
      const billId = 'bill_test_idempotent_001';
      const userId = 'user_test_idempotent_001';
      const idempotencyKey = `${billId}:appendSideGameChip:test-nonce-idempotent-001`;

      await createTestBill(billId, userId, 'open');

      // 1回目の実行
      const result1 = await appendSideGameChip({
        billId,
        action: 'withdraw',
        chipQty: 100,
        amountIncl: null,
        menuItemId: null,
        name: null,
        idempotencyKey,
      });

      expect(result1.success).toBe(true);
      expect(result1.chipId).toBe(idempotencyKey);
      expect(result1.diagnostics?.reused).toBeUndefined(); // 初回は reused なし

      // 親 updatedAt を記録
      const billDoc1 = await db.collection('bills').doc(billId).get();
      const updatedAt1 = billDoc1.data()!.updatedAt;

      // 少し待つ（updatedAt の更新を確認するため）
      await new Promise(resolve => setTimeout(resolve, 100));

      // 2回目の実行（同一 idempotencyKey）
      const result2 = await appendSideGameChip({
        billId,
        action: 'withdraw',
        chipQty: 100,
        amountIncl: null,
        menuItemId: null,
        name: null,
        idempotencyKey,
      });

      expect(result2.success).toBe(true);
      expect(result2.chipId).toBe(idempotencyKey);
      expect(result2.diagnostics?.reused).toBe(true); // 2回目は reused: true

      // 親 updatedAt は変更されていない
      const billDoc2 = await db.collection('bills').doc(billId).get();
      const updatedAt2 = billDoc2.data()!.updatedAt;
      expect(updatedAt2).toEqual(updatedAt1);

      // /bills/{billId}/sideGameChips の doc 数は1つのまま
      const chipsSnapshot = await db.collection('bills').doc(billId)
        .collection('sideGameChips').get();
      expect(chipsSnapshot.size).toBe(1);
    });

    it('同一 idempotencyKey だが payload 差し替え → failed-precondition（requestHash 不一致）', async () => {
      const billId = 'bill_test_mismatch_001';
      const userId = 'user_test_mismatch_001';
      const idempotencyKey = `${billId}:appendSideGameChip:test-nonce-mismatch-001`;

      await createTestBill(billId, userId, 'open');

      // 1回目の実行
      await appendSideGameChip({
        billId,
        action: 'withdraw',
        chipQty: 100,
        amountIncl: null,
        menuItemId: null,
        name: null,
        idempotencyKey,
      });

      // 2回目の実行（同一 idempotencyKey だが chipQty を変更）
      try {
        await appendSideGameChip({
          billId,
          action: 'withdraw',
          chipQty: 200, // chipQty を変更（requestHash が不一致になる）
          amountIncl: null,
          menuItemId: null,
          name: null,
          idempotencyKey,
        });
        fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.code).toBe('failed-precondition');
        expect(error.message).toContain('requestHash');
      }
    });
  });

  describe('DualWrite ON/OFF', () => {
    it('DualWrite ON: todaysBills.sideGameChip 配列に追加が作成されること', async () => {
      process.env.WRITE_TODAYS_BILLS_IN_PARALLEL = 'true';

      const billId = 'bill_test_dualwrite_on_001';
      const userId = 'user_test_dualwrite_on_001';
      const idempotencyKey = `${billId}:appendSideGameChip:test-nonce-dualwrite-001`;

      await createTestBill(billId, userId, 'open');

      // todaysBills を作成（DualWrite の前提）
      await db.collection('todaysBills').doc(billId).set({
        status: 'open',
        userId,
        pokerName: 'テスト太郎',
        items: [],
        sideGameChip: [],
        place: {
          table: null,
          seat: null,
        },
        date: '2025-11-15',
      });

      await appendSideGameChip({
        billId,
        action: 'withdraw',
        chipQty: 100,
        amountIncl: null,
        menuItemId: null,
        name: null,
        idempotencyKey,
      });

      // todaysBills.sideGameChip 配列に追加されている
      const todaysBillsDoc = await db.collection('todaysBills').doc(billId).get();
      expect(todaysBillsDoc.exists).toBe(true);
      const todaysBillsData = todaysBillsDoc.data()!;
      expect(Array.isArray(todaysBillsData.sideGameChip)).toBe(true);
      expect(todaysBillsData.sideGameChip.length).toBe(1);
      
      const legacyChip = todaysBillsData.sideGameChip[0];
      expect(legacyChip.orderId).toBe(idempotencyKey);
      expect(legacyChip.action).toBe('withdraw');
      expect(legacyChip.category).toBe('Chip');
      expect(legacyChip.amount).toBe(100); // チップ枚数
      // 金額フィールドは持たない
      expect(legacyChip.price).toBeUndefined();
      expect(legacyChip.quantity).toBeUndefined();
      expect(legacyChip.totalPrice).toBeUndefined();
    });

    it('DualWrite OFF: todaysBills への複写がスキップされること', async () => {
      process.env.WRITE_TODAYS_BILLS_IN_PARALLEL = 'false';

      const billId = 'bill_test_dualwrite_off_001';
      const userId = 'user_test_dualwrite_off_001';
      const idempotencyKey = `${billId}:appendSideGameChip:test-nonce-dualwrite-off-001`;

      await createTestBill(billId, userId, 'open');

      // todaysBills を作成
      await db.collection('todaysBills').doc(billId).set({
        status: 'open',
        userId,
        pokerName: 'テスト太郎',
        items: [],
        sideGameChip: [],
        place: {
          table: null,
          seat: null,
        },
        date: '2025-11-15',
      });

      await appendSideGameChip({
        billId,
        action: 'withdraw',
        chipQty: 100,
        amountIncl: null,
        menuItemId: null,
        name: null,
        idempotencyKey,
      });

      // todaysBills.sideGameChip 配列は空のまま
      const todaysBillsDoc = await db.collection('todaysBills').doc(billId).get();
      expect(todaysBillsDoc.exists).toBe(true);
      const todaysBillsData = todaysBillsDoc.data()!;
      expect(Array.isArray(todaysBillsData.sideGameChip)).toBe(true);
      expect(todaysBillsData.sideGameChip.length).toBe(0);
    });

    it('DualWrite ON: todaysBills側の失敗がbillsの成功を壊さないこと', async () => {
      process.env.WRITE_TODAYS_BILLS_IN_PARALLEL = 'true';

      const billId = 'bill_test_dualwrite_fail_001';
      const userId = 'user_test_dualwrite_fail_001';
      const idempotencyKey = `${billId}:appendSideGameChip:test-nonce-dualwrite-fail-001`;

      await createTestBill(billId, userId, 'open');

      // todaysBills を作成しない（DualWrite が失敗する状況）

      // appendSideGameChip は成功する（todaysBills の失敗は警告ログのみ）
      const result = await appendSideGameChip({
        billId,
        action: 'withdraw',
        chipQty: 100,
        amountIncl: null,
        menuItemId: null,
        name: null,
        idempotencyKey,
      });

      expect(result.success).toBe(true);
      expect(result.chipId).toBe(idempotencyKey);

      // /bills/{billId}/sideGameChips は作成されている
      const chipDoc = await db.collection('bills').doc(billId)
        .collection('sideGameChips').doc(idempotencyKey).get();
      expect(chipDoc.exists).toBe(true);
    });
  });
});

