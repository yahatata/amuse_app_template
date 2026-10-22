/**
 * updateBill の統合テスト
 * 
 * ChangeSpec P1-06 に準拠
 * Firestore Emulator を使用
 * 
 * テスト観点:
 * - happy path（正常な安全フィールド更新）
 * - invalid-argument（billId未指定、updatesが空、businessDate変更試行）
 * - not-found（billId不存在）
 * - LWW動作（複数端末からの同時更新）
 * - DualWrite ON/OFF（todaysBillsの該当フィールド更新確認）
 */

import { initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { updateBill } from '../../../src/domains/bills/repos/updateBill';

describe('updateBill', () => {
  let testEnv: RulesTestEnvironment;
  let db: admin.firestore.Firestore;
  const projectId = 'test-project-update-bill';

  beforeAll(async () => {
    process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8081';
    
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
    delete process.env.WRITE_TODAYS_BILLS_IN_PARALLEL;
  });

  // テスト用のヘルパ関数: 伝票を作成
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
      ops: {
        accountingStartedAt: null,
        accountingStartedBy: null,
      },
    });
  }

  describe('happy path', () => {
    it('正常な安全フィールド更新ができること（status更新）', async () => {
      const billId = 'bill_test_happy_001';
      const userId = 'user_test_happy_001';

      await createTestBill(billId, userId, 'open');

      const result = await updateBill({
        billId,
        updates: {
          status: 'in_progress',
        },
      });

      expect(result.success).toBe(true);
      expect(result.billId).toBe(billId);
      expect(result.updatedFields).toContain('status');

      // bills/{billId} が更新されている
      const billDoc = await db.collection('bills').doc(billId).get();
      expect(billDoc.exists).toBe(true);
      const billData = billDoc.data()!;
      expect(billData.status).toBe('in_progress');
      expect(billData.updatedAt).toBeDefined();
    });

    it('正常な安全フィールド更新ができること（ops.*更新）', async () => {
      const billId = 'bill_test_happy_002';
      const userId = 'user_test_happy_002';

      await createTestBill(billId, userId, 'open');

      const result = await updateBill({
        billId,
        updates: {
          'ops.*': {
            accountingCompletedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
        },
      });

      expect(result.success).toBe(true);
      expect(result.updatedFields).toContain('ops.*');

      const billDoc = await db.collection('bills').doc(billId).get();
      const billData = billDoc.data()!;
      expect(billData.ops?.accountingCompletedAt).toBeDefined();
    });

    it('正常な安全フィールド更新ができること（meta.*更新）', async () => {
      const billId = 'bill_test_happy_003';
      const userId = 'user_test_happy_003';

      await createTestBill(billId, userId, 'open');

      const result = await updateBill({
        billId,
        updates: {
          'meta.*': {
            contentHash: 'test_hash_001',
          },
        },
      });

      expect(result.success).toBe(true);
      expect(result.updatedFields).toContain('meta.*');

      const billDoc = await db.collection('bills').doc(billId).get();
      const billData = billDoc.data()!;
      expect(billData.meta?.contentHash).toBe('test_hash_001');
    });
  });

  describe('invalid-argument', () => {
    it('billId 未指定 → invalid-argument', async () => {
      try {
        await updateBill({
          billId: '',
          updates: {
            status: 'in_progress',
          },
        });
        fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.code).toBe('invalid-argument');
      }
    });

    it('updates が空 → invalid-argument', async () => {
      try {
        await updateBill({
          billId: 'bill_test_001',
          updates: {},
        });
        fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.code).toBe('invalid-argument');
      }
    });

    it('businessDate 変更試行 → invalid-argument', async () => {
      const billId = 'bill_test_001';
      const userId = 'user_test_001';

      await createTestBill(billId, userId, 'open');

      try {
        await updateBill({
          billId,
          updates: {
            businessDate: '2025-11-16',
          } as any, // 型チェックを回避（businessDate は許可されていないフィールド）
        });
        fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.code).toBe('invalid-argument');
      }
    });

    it('amounts.* 変更試行 → invalid-argument', async () => {
      const billId = 'bill_test_002';
      const userId = 'user_test_002';

      await createTestBill(billId, userId, 'open');

      try {
        await updateBill({
          billId,
          updates: {
            'amounts.subTotalIncl': 1000,
          } as any, // 型チェックを回避（amounts.* は許可されていないフィールド）
        });
        fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.code).toBe('invalid-argument');
      }
    });

    it('categoryBreakdown 変更試行 → invalid-argument', async () => {
      const billId = 'bill_test_003';
      const userId = 'user_test_003';

      await createTestBill(billId, userId, 'open');

      try {
        await updateBill({
          billId,
          updates: {
            categoryBreakdown: { items: 1000 },
          } as any, // 型チェックを回避（categoryBreakdown は許可されていないフィールド）
        });
        fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.code).toBe('invalid-argument');
      }
    });
  });

  describe('not-found', () => {
    it('billId 不存在 → not-found', async () => {
      try {
        await updateBill({
          billId: 'bill_not_exist',
          updates: {
            status: 'in_progress',
          },
        });
        fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.code).toBe('not-found');
      }
    });
  });

  describe('LWW動作', () => {
    it('複数端末からの同時更新で、最終値が採用されること', async () => {
      const billId = 'bill_test_lww_001';
      const userId = 'user_test_lww_001';

      await createTestBill(billId, userId, 'open');

      // 並行更新
      const [result1, result2] = await Promise.all([
        updateBill({
          billId,
          updates: {
            status: 'in_progress',
          },
        }),
        updateBill({
          billId,
          updates: {
            status: 'settling',
          },
        }),
      ]);

      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);

      // 最終的な status を確認（LWW方式のため、どちらか一方が採用される）
      const billDoc = await db.collection('bills').doc(billId).get();
      const billData = billDoc.data()!;
      expect(['in_progress', 'settling']).toContain(billData.status);
    });
  });

  describe('DualWrite', () => {
    it('DualWrite ON の場合、todaysBills.status が更新されること', async () => {
      process.env.WRITE_TODAYS_BILLS_IN_PARALLEL = 'true';

      const billId = 'bill_test_dualwrite_001';
      const userId = 'user_test_dualwrite_001';

      await createTestBill(billId, userId, 'open');

      // todaysBills を作成
      await db.collection('todaysBills').doc(billId).set({
        status: 'open',
        userId,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      await updateBill({
        billId,
        updates: {
          status: 'in_progress',
        },
      });

      // todaysBills.status が更新されている
      const legacyDoc = await db.collection('todaysBills').doc(billId).get();
      expect(legacyDoc.exists).toBe(true);
      const legacyData = legacyDoc.data()!;
      expect(legacyData.status).toBe('in_progress');
    });

    it('DualWrite OFF の場合、todaysBills.status が更新されないこと', async () => {
      process.env.WRITE_TODAYS_BILLS_IN_PARALLEL = 'false';

      const billId = 'bill_test_dualwrite_002';
      const userId = 'user_test_dualwrite_002';

      await createTestBill(billId, userId, 'open');

      // todaysBills を作成
      await db.collection('todaysBills').doc(billId).set({
        status: 'open',
        userId,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      await updateBill({
        billId,
        updates: {
          status: 'in_progress',
        },
      });

      // todaysBills.status が更新されていない
      const legacyDoc = await db.collection('todaysBills').doc(billId).get();
      expect(legacyDoc.exists).toBe(true);
      const legacyData = legacyDoc.data()!;
      expect(legacyData.status).toBe('open');
    });
  });
});

