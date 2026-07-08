/**
 * 既存 staffs doc に status: 'active' を一括付与する移行スクリプト（手動実行）
 *
 * 実行例:
 *   cd functions && npx ts-node scripts/migrateStaffStatusActive.ts
 *
 * 本番では GOOGLE_APPLICATION_CREDENTIALS 等で Firebase Admin を初期化してから実行すること。
 */
import * as admin from 'firebase-admin';

async function main(): Promise<void> {
  if (admin.apps.length === 0) {
    admin.initializeApp();
  }

  const db = admin.firestore();
  const snapshot = await db.collection('staffs').get();
  let updated = 0;
  let skipped = 0;

  for (const doc of snapshot.docs) {
    const data = doc.data();
    if (data.status === 'retired' || data.status === 'active') {
      skipped += 1;
      continue;
    }
    await doc.ref.update({
      status: 'active',
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    updated += 1;
  }

  console.log(`migrateStaffStatusActive complete: updated=${updated}, skipped=${skipped}, total=${snapshot.size}`);
}

main().catch((error) => {
  console.error('migrateStaffStatusActive failed:', error);
  process.exit(1);
});
