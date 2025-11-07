import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';

export const resetAllSideGames = onCall(async (request) => {
  try {
    const db = getFirestore();
    
    console.log('=== 全サイドゲームリセット開始 ===');
    
    // 1. sideGameコレクションの全ドキュメントを取得
    const sideGamesSnapshot = await db.collection('sideGame').get();
    
    if (sideGamesSnapshot.empty) {
      return {
        success: true,
        message: 'サイドゲームが存在しません',
        count: 0,
      };
    }
    
    // 2. 各ドキュメントを更新
    const batch = db.batch();
    let count = 0;
    
    sideGamesSnapshot.forEach((doc) => {
      const sideGameRef = db.collection('sideGame').doc(doc.id);
      const data = doc.data();
      
      // 更新データを準備
      const updateData: { [key: string]: any } = {
        active: false,
        updatedAt: new Date(),
      };
      
      // seatsフィールドの存在確認
      if (data.seats && typeof data.seats === 'object') {
        const seats = data.seats as { [key: string]: any };
        
        // seatXXPokerNameとseatXXUserIdを検索してnullにする
        for (const key in seats) {
          if (key.includes('PokerName') || key.includes('UserId')) {
            updateData[`seats.${key}`] = null;
          }
        }
      }
      
      // gameNameフィールドをnullにする（存在する場合）
      if (data.gameName !== undefined) {
        updateData.gameName = null;
      }
      
      batch.update(sideGameRef, updateData);
      count++;
    });
    
    await batch.commit();
    
    console.log(`全サイドゲームリセット完了: ${count}件`);
    
    return {
      success: true,
      message: `${count}件のサイドゲームをリセットしました`,
      count,
    };
    
  } catch (error) {
    console.error('resetAllSideGamesエラー:', error);
    throw new HttpsError(
      'internal',
      `全サイドゲームリセットに失敗しました: ${error}`
    );
  }
});

