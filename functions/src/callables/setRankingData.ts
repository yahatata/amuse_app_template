import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { addLogEntry } from '../utils/logUtils';

export const setRankingData = onCall(async (request) => {
  try {
    const { tournamentId, rankingData } = request.data;
    
    console.log('=== setRankingData 開始 ===');
    console.log('tournamentId:', tournamentId);
    console.log('rankingData:', JSON.stringify(rankingData, null, 2));
    
    if (!tournamentId) {
      throw new HttpsError('invalid-argument', 'tournamentId is required');
    }
    
    if (!rankingData || typeof rankingData !== 'object') {
      throw new HttpsError('invalid-argument', 'rankingData is required');
    }
    
    const db = getFirestore();
    
    // メインビューデータを更新
    const mainViewRef = db
      .collection('scheduledTournaments')
      .doc(tournamentId)
      .collection('views')
      .doc('main');
    
    // nullやundefinedの値を除外してクリーンなデータを作成
    const cleanRankingData: Record<string, any> = {};
    for (const [key, value] of Object.entries(rankingData)) {
      if (value !== null && value !== undefined) {
        cleanRankingData[key] = value;
      }
    }
    
    console.log('cleanRankingData:', JSON.stringify(cleanRankingData, null, 2));
    
    const updateData = {
      ...cleanRankingData,
      updatedAt: new Date(),
    };
    
    console.log('updateData:', JSON.stringify(updateData, null, 2));
    
    await mainViewRef.update(updateData);
    
    // プライズ付与処理
    await _awardPrizes(db, tournamentId, cleanRankingData);
    
    console.log('=== setRankingData 成功 ===');
    
    return {
      success: true,
      message: 'Ranking data saved successfully',
    };
    
  } catch (error) {
    console.error('=== setRankingData エラー ===');
    console.error('setRankingData error:', error);
    
    if (error instanceof HttpsError) {
      throw error;
    }
    
    throw new HttpsError('internal', 'Internal server error');
  }
});

// プライズ付与処理
async function _awardPrizes(db: any, tournamentId: string, rankingData: Record<string, any>) {
  try {
    console.log('=== プライズ付与処理開始 ===');
    
    // メインビューデータからpointTypeを取得
    const mainViewRef = db
      .collection('scheduledTournaments')
      .doc(tournamentId)
      .collection('views')
      .doc('main');
    
    const mainViewDoc = await mainViewRef.get();
    const mainViewData = mainViewDoc.data();
    const pointType = mainViewData?.pointType || 'pointA';
    
    console.log('pointType:', pointType);
    
    // 順位データを処理
    const prizeAwards = [];
    
    for (const [key, value] of Object.entries(rankingData)) {
      if (key.endsWith('stPlayerUid') && value) {
        const rank = key.replace('stPlayerUid', '');
        const prizeKey = `${rank}stPrize`;
        
        // メインビューデータからプライズ金額を取得
        const prizeAmount = mainViewData?.[prizeKey];
        
        console.log(`順位 ${rank}: playerUid=${value}, prizeKey=${prizeKey}, prizeAmount=${prizeAmount}`);
        
        if (prizeAmount && prizeAmount > 0) {
          prizeAwards.push({
            playerUid: value,
            rank: rank,
            prizeAmount: prizeAmount
          });
        }
      }
    }
    
    console.log('prizeAwards:', JSON.stringify(prizeAwards, null, 2));
    
    // 各プレイヤーにプライズを付与
    for (const award of prizeAwards) {
      const userRef = db.collection('users').doc(award.playerUid);
      const userDoc = await userRef.get();
      
      if (userDoc.exists) {
        const userData = userDoc.data();
        const currentPoints = (userData as any)[pointType] || 0;
        const newPoints = currentPoints + award.prizeAmount;
        
        await userRef.update({
          [pointType]: newPoints,
          updatedAt: new Date()
        });
        
        // ログ記録を追加
        const logType = pointType === 'pointA' ? 'pointALogs' : 'pointBLogs';
        await addLogEntry(award.playerUid, logType, {
          appliedAt: new Date(),
          category: 'income',
          amountDelta: award.prizeAmount,
          reasonType: 'tournamentId',
          actor: 'tablet_front', // 実際の端末IDに置き換え可能
        });
        
        console.log(`プレイヤー ${award.playerUid} に ${award.prizeAmount} ポイント付与 (${pointType}: ${currentPoints} -> ${newPoints})`);
      } else {
        console.warn(`ユーザー ${award.playerUid} が見つかりません`);
      }
    }
    
    console.log('=== プライズ付与処理完了 ===');
    
  } catch (error) {
    console.error('=== プライズ付与処理エラー ===');
    console.error('_awardPrizes error:', error);
    throw error;
  }
}
