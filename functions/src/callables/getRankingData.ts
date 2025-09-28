import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';

export const getRankingData = onCall(async (request) => {
  try {
    const { tournamentId } = request.data;
    
    if (!tournamentId) {
      throw new HttpsError('invalid-argument', 'tournamentId is required');
    }
    
    const db = getFirestore();
    
    // メインビューデータを取得
    const mainViewDoc = await db
      .collection('scheduledTournaments')
      .doc(tournamentId)
      .collection('views')
      .doc('main')
      .get();
    
    if (!mainViewDoc.exists) {
      throw new HttpsError('not-found', 'Main view data not found');
    }
    
    const mainViewData = mainViewDoc.data();
    
    // プライズプールの存在確認
    if (!mainViewData?.prizePool) {
      throw new HttpsError('failed-precondition', 'プライズの確定が行われていないため、先にプライズ確定を行ってください');
    }
    
    // バストプレイヤーデータを取得
    const bustedDoc = await db
      .collection('scheduledTournaments')
      .doc(tournamentId)
      .collection('tablesSeat')
      .doc('busted')
      .get();
    
    let bustedPlayers: any[] = [];
    
    if (bustedDoc.exists) {
      const bustedData = bustedDoc.data();
      const bustedUser = bustedData?.bustedUser || {};
      
      // bustedUserを配列に変換し、bustAtでソート
      bustedPlayers = Object.entries(bustedUser).map(([uid, playerData]: [string, any]) => ({
        uid,
        pokerName: playerData.pokerName,
        bustAt: playerData.bustAt,
      })).sort((a, b) => {
        // bustAtでソート（新しい順）
        const aTime = a.bustAt?._seconds || 0;
        const bTime = b.bustAt?._seconds || 0;
        return bTime - aTime;
      });
    }
    
    return {
      success: true,
      mainViewData,
      bustedPlayers,
    };
    
  } catch (error) {
    console.error('getRankingData error:', error);
    
    if (error instanceof HttpsError) {
      throw error;
    }
    
    throw new HttpsError('internal', 'Internal server error');
  }
});
