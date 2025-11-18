/**
 * resolveMenuItem の単体テスト
 * 
 * ChangeSpec P1-02 に準拠
 * Firestore Emulator を使用
 */

import { initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { resolveMenuItem } from '../../../src/helpers/billsApi/resolveMenuItem';

describe('resolveMenuItem', () => {
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
    if (admin.apps.length) {
      await admin.app().delete();
    }
    delete process.env.FIRESTORE_EMULATOR_HOST;
  });

  beforeEach(async () => {
    await testEnv.clearFirestore();
  });

  describe('happy path', () => {
    it('menuItemId からメニュー定義を解決できること', async () => {
      const menuItemId = 'menu_test_001';
      
      // テストデータを作成
      await db.collection('menuItems').doc(menuItemId).set({
        name: 'ビール',
        category: 'drink',
        price: 500,
        description: 'テスト用ビール',
        imageUrl: '',
        isArchive: false,
        isSoldOut: false,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      const result = await resolveMenuItem(menuItemId);

      expect(result.menuItemId).toBe(menuItemId);
      expect(result.name).toBe('ビール');
      expect(result.category).toBe('drink');
      expect(result.unitPriceIncl).toBe(500);
    });
  });

  describe('invalid-argument', () => {
    it('menuItemId 未指定 → invalid-argument', async () => {
      try {
        await resolveMenuItem('');
        fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.code).toBe('invalid-argument');
      }
    });

    it('メニュー未解決（menuItemId が存在しない） → invalid-argument', async () => {
      try {
        await resolveMenuItem('menu_not_exist');
        fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.code).toBe('invalid-argument');
        expect(error.message).toContain('Menu item not found');
      }
    });

    it('メニューデータが不正（必須フィールド不足） → invalid-argument', async () => {
      const menuItemId = 'menu_test_invalid';
      
      // 必須フィールドが不足したデータを作成
      await db.collection('menuItems').doc(menuItemId).set({
        name: 'テスト',
        // category と price が不足
      });

      try {
        await resolveMenuItem(menuItemId);
        fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.code).toBe('invalid-argument');
        // エラーメッセージは実装に依存するため、code のみ確認
      }
    });
  });
});

