import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

/**
 * 既存のList形式のwaitingデータをMap形式に変換するCloud Function
 * 
 * 使用方法:
 * 1. この関数をデプロイ
 * 2. 必要に応じて呼び出し
 * 3. 変換後はこの関数を削除
 */

export const migrateWaitingDataCallable = functions.https.onCall(async (data, context) => {
  try {
    console.log('=== waitingデータ移行開始 ===');
    
    const db = admin.firestore();
    
    // 全トーナメントを取得
    const tournamentsSnapshot = await db
      .collection('scheduledTournaments')
      .where('isArchived', '==', false)
      .get();
    
    console.log(`対象トーナメント数: ${tournamentsSnapshot.docs.length}`);
    
    let successCount = 0;
    let failureCount = 0;
    const results: Array<{ tournamentId: string; success: boolean; error?: string }> = [];
    
    for (const doc of tournamentsSnapshot.docs) {
      const tournamentId = doc.id;
      
      try {
        console.log(`トーナメント ${tournamentId} の移行開始`);
        
        const waitingRef = db
          .collection('scheduledTournaments')
          .doc(tournamentId)
          .collection('tablesSeat')
          .doc('waiting');
        
        // 現在のデータを取得
        const waitingDoc = await waitingRef.get();
        if (!waitingDoc.exists) {
          console.log(`トーナメント ${tournamentId}: waitingドキュメントが存在しません`);
          results.push({ tournamentId, success: true });
          successCount++;
          continue;
        }
        
        const currentData = waitingDoc.data()!;
        const waiting = currentData.waiting;
        
        // 既にMap形式の場合は変換不要
        if (waiting && typeof waiting === 'object' && !Array.isArray(waiting)) {
          console.log(`トーナメント ${tournamentId}: 既にMap形式です`);
          results.push({ tournamentId, success: true });
          successCount++;
          continue;
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
        
        console.log(`トーナメント ${tournamentId}: 移行完了 (${count}ユーザー)`);
        results.push({ tournamentId, success: true });
        successCount++;
        
      } catch (error) {
        console.error(`トーナメント ${tournamentId} の移行エラー:`, error);
        results.push({ 
          tournamentId, 
          success: false, 
          error: error instanceof Error ? error.message : '不明なエラー'
        });
        failureCount++;
      }
    }
    
    console.log('=== waitingデータ移行完了 ===');
    console.log(`成功: ${successCount}件`);
    console.log(`失敗: ${failureCount}件`);
    
    return {
      success: true,
      summary: {
        total: tournamentsSnapshot.docs.length,
        success: successCount,
        failure: failureCount,
      },
      results: results,
    };
    
  } catch (error) {
    console.error('waitingデータ移行エラー:', error);
    
    return {
      success: false,
      error: error instanceof Error ? error.message : '不明なエラー',
    };
  }
});
