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
