import { onCall } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';

async function walkCollections(
  colRefs: FirebaseFirestore.CollectionReference[],
  acc: { bytes: number; docs: number; collections: number }
) {
  for (const col of colRefs) {
    acc.collections++;
    logger.info(`スキャン中: ${col.path}`);

    const snap = await col.get();

    for (const doc of snap.docs) {
      // ① 本文の近似サイズ
      const dataStr = JSON.stringify(doc.data());
      acc.bytes += Buffer.byteLength(dataStr, 'utf8');
      acc.docs++;

      // 進捗表示（1000件ごと）
      if (acc.docs % 1000 === 0) {
        logger.info(`進捗: ${acc.docs}件, ${(acc.bytes/1024/1024).toFixed(2)}MB`);
      }

      // ② サブコレクションへ再帰
      const subcols = await doc.ref.listCollections();
      if (subcols.length > 0) {
        await walkCollections(subcols, acc);
      }
    }
  }
}

export const calculateFirestoreSize = onCall(
  {
    timeoutSeconds: 540,  // 9分に延長
    memory: '1GiB',       // メモリも増やす
  },
  async () => {
    try {
      const db = getFirestore();
      const roots = await db.listCollections();
      const acc = { bytes: 0, docs: 0, collections: 0 };

      logger.info('Firestoreサイズ計算開始');
      await walkCollections(roots, acc);

      // 実際のサイズは30%程度多いと見積もる
      const estimatedActualBytes = Math.floor(acc.bytes * 1.3);

      logger.info(`計算完了: ${acc.docs}件, ${(acc.bytes/1024/1024).toFixed(2)}MB`);

      return {
        success: true,
        approxDocBytes: acc.bytes,
        approxDocMB: +(acc.bytes / 1024 / 1024).toFixed(2),
        estimatedActualMB: +(estimatedActualBytes / 1024 / 1024).toFixed(2),
        docCount: acc.docs,
        collectionCount: acc.collections,
      };
    } catch (error) {
      logger.error('Firestoreサイズ計算エラー:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
);
