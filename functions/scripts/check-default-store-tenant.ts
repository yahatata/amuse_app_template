#!/usr/bin/env npx ts-node
/**
 * Phase0A 既存データ影響確認スクリプト
 *
 * scheduledTournaments / tournamentRecurrences の
 * storeId == "default-store" / tenantId == "default-tenant" の件数を集計する。
 *
 * 実行方法:
 *   # 本番/ステージング（要認証）:
 *   cd functions && npx ts-node scripts/check-default-store-tenant.ts
 *
 *   # エミュレータ接続（firebase emulators:exec 内で実行）:
 *   firebase emulators:exec --only firestore 'cd functions && npx ts-node scripts/check-default-store-tenant.ts'
 *
 * 環境変数:
 *   - FIRESTORE_EMULATOR_HOST: 設定時はエミュレータに接続
 *   - GCLOUD_PROJECT: プロジェクトID（エミュレータ時は demo-test 等で可）
 */

import * as admin from 'firebase-admin';

async function main() {
  if (!admin.apps.length) {
    const projectId = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || 'demo-test';
    admin.initializeApp({ projectId });
  }
  const db = admin.firestore();

  const collections = ['scheduledTournaments', 'tournamentRecurrences'] as const;

  console.log('=== Phase0A 既存データ影響確認 ===\n');

  for (const collName of collections) {
    const coll = db.collection(collName);
    const snapshot = await coll.get();
    const total = snapshot.size;

    let defaultStoreCount = 0;
    let defaultTenantCount = 0;
    let missingStoreId = 0;
    let missingTenantId = 0;

    for (const doc of snapshot.docs) {
      const d = doc.data();
      if (d.storeId === 'default-store') defaultStoreCount++;
      if (d.tenantId === 'default-tenant') defaultTenantCount++;
      if (!d.storeId || (typeof d.storeId === 'string' && !d.storeId.trim())) missingStoreId++;
      if (!d.tenantId || (typeof d.tenantId === 'string' && !d.tenantId.trim())) missingTenantId++;
    }

    console.log(`【${collName}】`);
    console.log(`  総件数: ${total}`);
    console.log(`  storeId == "default-store": ${defaultStoreCount}`);
    console.log(`  tenantId == "default-tenant": ${defaultTenantCount}`);
    console.log(`  storeId 欠損: ${missingStoreId}`);
    console.log(`  tenantId 欠損: ${missingTenantId}`);
    console.log('');

    if (defaultStoreCount > 0 || defaultTenantCount > 0) {
      console.log(`  ⚠ 補正バッチ実施後に本番ガード有効化を推奨`);
    }
  }

  console.log('=== 完了 ===');
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
