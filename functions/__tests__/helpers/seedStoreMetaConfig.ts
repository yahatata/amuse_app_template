import type { Firestore } from 'firebase-admin/firestore';

/**
 * getStoreConfigForExecution が doc 存在を要求する経路向けに、空ドキュメントで storeMeta/config を作成する。
 * mergeWithDefaults({}) でフィールド欠落は従来どおりデフォルト補完される。
 */
export async function seedStoreMetaConfigDocExists(db: Firestore): Promise<void> {
  await db.collection('storeMeta').doc('config').set({});
}
