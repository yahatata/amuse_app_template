import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';

export const setRankingData = onCall(async (request) => {
  try {
    const { tournamentId, rankingData } = request.data;
    
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
    
    await mainViewRef.update({
      ...rankingData,
      updatedAt: new Date(),
    });
    
    return {
      success: true,
      message: 'Ranking data saved successfully',
    };
    
  } catch (error) {
    console.error('setRankingData error:', error);
    
    if (error instanceof HttpsError) {
      throw error;
    }
    
    throw new HttpsError('internal', 'Internal server error');
  }
});
