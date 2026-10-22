/**
 * A-7 会計テスト用: storeMeta/config に検証可能なポイント設定を投入する
 */

import type { Firestore } from 'firebase-admin/firestore';

export function a7StoreConfigDocument(): Record<string, unknown> {
  return {
    pointSettings: {
      pointA: { enabled: true, displayName: 'ポイントA' },
      pointB: { enabled: true, displayName: 'ポイントB' },
      pointC: { enabled: false, displayName: 'ポイントC' },
      pointD: { enabled: false, displayName: 'ポイントD' },
      pointE: { enabled: false, displayName: 'ポイントE' },
    },
    sideGameChipSettings: {
      enabled: true,
      displayName: 'サイドゲームチップ',
    },
    tournament: {
      rankingRewardPointTypes: ['pointA'],
    },
    billing: {
      paymentPolicy: {
        categoryOrder: ['extraCost', 'sideGameChip', 'tournaments', 'items'],
        pointPriority: ['pointA', 'pointB', 'sideGameChip'],
        categoryPaymentMethods: {
          extraCost: ['cash', 'credit_card', 'electronic_money'],
          sideGameChip: ['cash', 'credit_card', 'electronic_money'],
          tournaments: [
            'cash',
            'credit_card',
            'electronic_money',
            'pointA',
            'pointB',
          ],
          items: [
            'cash',
            'credit_card',
            'electronic_money',
            'pointA',
            'pointB',
            'sideGameChip',
          ],
        },
        balancePaymentSettings: {
          pointA: {
            conversion: { referenceUnits: 1, balanceUnits: 1 },
            usageUnit: 1,
          },
          pointB: {
            conversion: { referenceUnits: 1, balanceUnits: 1 },
            usageUnit: 1,
          },
          sideGameChip: {
            conversion: { referenceUnits: 100, balanceUnits: 1 },
            usageUnit: 100,
          },
        },
      },
    },
  };
}

export async function seedA7StoreConfig(db: Firestore): Promise<void> {
  await db.collection('storeMeta').doc('config').set(a7StoreConfigDocument(), {
    merge: true,
  });
}

/**
 * A-7 一連フロー Emulator 用 config
 *
 * - pointA: enabled / 残高1=基準1 / 自動充当
 * - pointB: enabled / 残高1=基準10 / 自動充当
 * - pointC: enabled / 残高2=基準1 / 支払い可・priority外（手動のみ）
 * - pointD/E: disabled
 * - sideGameChip: enabled / 残高1=基準10
 */
export function a7E2EFlowStoreConfigDocument(): Record<string, unknown> {
  return {
    pointSettings: {
      pointA: { enabled: true, displayName: 'E2EポイントA' },
      pointB: { enabled: true, displayName: 'E2EポイントB' },
      pointC: { enabled: true, displayName: 'E2EポイントC手動' },
      pointD: { enabled: false, displayName: 'E2EポイントD無効' },
      pointE: { enabled: false, displayName: 'E2EポイントE無効' },
    },
    sideGameChipSettings: {
      enabled: true,
      displayName: 'E2Eサイドゲームチップ',
    },
    tournament: {
      rankingRewardPointTypes: ['pointA', 'pointB'],
    },
    billing: {
      paymentPolicy: {
        categoryOrder: ['extraCost', 'sideGameChip', 'tournaments', 'items'],
        pointPriority: ['pointA', 'pointB', 'sideGameChip'],
        categoryPaymentMethods: {
          extraCost: ['cash', 'credit_card', 'electronic_money'],
          sideGameChip: ['cash', 'credit_card', 'electronic_money'],
          tournaments: [
            'cash',
            'credit_card',
            'electronic_money',
            'pointA',
            'pointB',
          ],
          items: [
            'cash',
            'credit_card',
            'electronic_money',
            'pointA',
            'pointB',
            'pointC',
            'sideGameChip',
          ],
        },
        balancePaymentSettings: {
          pointA: {
            conversion: { referenceUnits: 1, balanceUnits: 1 },
            usageUnit: 1,
          },
          pointB: {
            conversion: { referenceUnits: 10, balanceUnits: 1 },
            usageUnit: 10,
          },
          pointC: {
            conversion: { referenceUnits: 1, balanceUnits: 2 },
            usageUnit: 1,
          },
          sideGameChip: {
            conversion: { referenceUnits: 10, balanceUnits: 1 },
            usageUnit: 10,
          },
        },
      },
    },
  };
}

export async function seedA7E2EFlowStoreConfig(db: Firestore): Promise<void> {
  await db
    .collection('storeMeta')
    .doc('config')
    .set(a7E2EFlowStoreConfigDocument(), { merge: true });
}
