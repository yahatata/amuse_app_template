import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';

export const resetAllTables = onCall(async (request) => {
  try {
    const db = getFirestore();
    
    console.log('=== 全テーブルリセット開始 ===');
    
    // 1. tablesコレクションの全ドキュメントを取得
    const tablesSnapshot = await db.collection('tables').get();
    
    if (tablesSnapshot.empty) {
      return {
        success: true,
        message: 'テーブルが存在しません',
        count: 0,
      };
    }
    
    // 2. バッチ更新を実行
    const batch = db.batch();
    let count = 0;
    
    tablesSnapshot.forEach((doc) => {
      const tableRef = db.collection('tables').doc(doc.id);
      batch.update(tableRef, {
        status: 'open',
        updatedAt: new Date(),
      });
      count++;
    });
    
    await batch.commit();
    
    console.log(`全テーブルリセット完了: ${count}件`);
    
    return {
      success: true,
      message: `${count}件のテーブルを開店状態にリセットしました`,
      count,
    };
    
  } catch (error) {
    console.error('resetAllTablesエラー:', error);
    throw new HttpsError(
      'internal',
      `全テーブルリセットに失敗しました: ${error}`
    );
  }
});

