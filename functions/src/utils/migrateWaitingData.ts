import * as admin from 'firebase-admin';

/**
 * 既存のList形式のwaitingデータをMap形式に変換する移行スクリプト
 * 
 * 使用方法:
 * 1. このファイルをfunctions/src/utils/に配置
 * 2. 必要に応じてmigrateWaitingData関数を呼び出し
 * 3. 変換後はこのファイルを削除
 */

/**
 * 特定のトーナメントのwaitingデータを変換
 */
export async function migrateWaitingData(tournamentId: string): Promise<boolean> {
  try {
    console.log(`=== waitingデータ移行開始: ${tournamentId} ===`);
    
    const db = admin.firestore();
    const waitingRef = db
      .collection('scheduledTournaments')
      .doc(tournamentId)
      .collection('tablesSeat')
      .doc('waiting');
    
    // 現在のデータを取得
    const waitingDoc = await waitingRef.get();
    if (!waitingDoc.exists) {
      console.log('waitingドキュメントが存在しません');
      return false;
    }
    
    const currentData = waitingDoc.data()!;
    const waiting = currentData.waiting;
    
    // 既にMap形式の場合は変換不要
    if (waiting && typeof waiting === 'object' && !Array.isArray(waiting)) {
      console.log('既にMap形式です。変換不要。');
      return true;
    }
    
    // List形式からMap形式に変換
    const newWaiting: { [userId: string]: boolean } = {};
    let count = 0;
    
    if (Array.isArray(waiting)) {
      for (const item of waiting) {
        if (item && item.userId) {
          newWaiting[item.userId] = true;
          count++;
        }
      }
    }
    
    // 新しいデータで更新
    await waitingRef.update({
      waiting: newWaiting,
      count: count,
      updatedAt: admin.firestore.Timestamp.now(),
    });
    
    console.log(`=== waitingデータ移行完了: ${tournamentId} ===`);
    console.log(`変換されたユーザー数: ${count}`);
    
    return true;
    
  } catch (error) {
    console.error(`waitingデータ移行エラー (${tournamentId}):`, error);
    return false;
  }
}

/**
 * 全トーナメントのwaitingデータを一括変換
 */
export async function migrateAllWaitingData(): Promise<void> {
  try {
    console.log('=== 全トーナメントwaitingデータ移行開始 ===');
    
    const db = admin.firestore();
    
    // 全トーナメントを取得
    const tournamentsSnapshot = await db
      .collection('scheduledTournaments')
      .where('isArchived', '==', false)
      .get();
    
    console.log(`対象トーナメント数: ${tournamentsSnapshot.docs.length}`);
    
    let successCount = 0;
    let failureCount = 0;
    
    for (const doc of tournamentsSnapshot.docs) {
      const tournamentId = doc.id;
      const success = await migrateWaitingData(tournamentId);
      
      if (success) {
        successCount++;
      } else {
        failureCount++;
      }
    }
    
    console.log('=== 全トーナメントwaitingデータ移行完了 ===');
    console.log(`成功: ${successCount}件`);
    console.log(`失敗: ${failureCount}件`);
    
  } catch (error) {
    console.error('全トーナメントwaitingデータ移行エラー:', error);
  }
}

/**
 * 移行スクリプトの実行例
 * 
 * 注意: 本番環境で実行する前に、必ずバックアップを取得してください
 */
export async function runMigration(): Promise<void> {
  try {
    // 特定のトーナメントのみ移行する場合
    // await migrateWaitingData('your-tournament-id');
    
    // 全トーナメントを移行する場合
    await migrateAllWaitingData();
    
  } catch (error) {
    console.error('移行スクリプト実行エラー:', error);
  }
}
