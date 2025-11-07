import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';

export const validateEndTournament = onCall(async (request) => {
  try {
    const { tournamentId } = request.data;
    
    if (!tournamentId) {
      throw new HttpsError('invalid-argument', 'tournamentId is required');
    }
    
    const db = getFirestore();
    
    // 1. scheduledTournamentsコレクションのstatusをチェック
    const tournamentDoc = await db.collection('scheduledTournaments').doc(tournamentId).get();
    
    if (!tournamentDoc.exists) {
      throw new HttpsError('not-found', 'Tournament not found');
    }
    
    const tournamentData = tournamentDoc.data();
    const status = tournamentData?.status;
    
    let validationResult = {
      isValid: false,
      status,
      requiresPrize: false,
      requiresRanking: false,
      prizeData: null as any,
      rankingData: null as any,
      message: '',
      errorType: '' as 'ended' | 'not_registered' | 'no_prize' | 'no_ranking' | 'complete',
    };
    
    // ステータスチェック
    if (status === 'ended') {
      validationResult.errorType = 'ended';
      validationResult.message = 'このトーナメントは既に終了済みです';
      return { success: false, ...validationResult };
    }
    
    if (status !== 'registered') {
      validationResult.errorType = 'not_registered';
      validationResult.message = `レジスト前であるため終了処理を行うべきではない可能性が高いです。\n現在のステータス: ${status}`;
      validationResult.status = status;
      return { success: false, ...validationResult };
    }
    
    // 2. プライズ確定のチェック
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
    
    // pointTypeを取得（mainViewDataまたはtournamentData.snapshotから）
    const pointType = mainViewData?.pointType || tournamentData?.snapshot?.pointType || 'pointA';
    
    // プライズプールの存在確認（1stPrizeフィールドの存在確認）
    if (!mainViewData?.prizePool || mainViewData['1stPrize'] === undefined) {
      validationResult.errorType = 'no_prize';
      validationResult.message = 'プライズの確定が行われていない状態です。プライズの確定を行ってください';
      validationResult.requiresPrize = true;
      return { success: false, ...validationResult };
    }
    
    // プライズ情報を保存
    validationResult.prizeData = mainViewData;
    
    // 3. 順位確定のチェック
    // XstPlayerUid, XstPlayerName, XstPrize のフィールドを確認
    const rankingFields = {
      playerUids: [] as Array<{ key: string; value: any; rank: number }>,
      playerNames: [] as Array<{ key: string; value: any; rank: number }>,
      prizes: [] as Array<{ key: string; value: any; rank: number }>,
    };
    
    for (const [key, value] of Object.entries(mainViewData || {})) {
      if (key.endsWith('stPlayerUid')) {
        const rank = parseInt(key.replace('stPlayerUid', ''));
        rankingFields.playerUids.push({ key, value, rank });
      } else if (key.endsWith('stPlayerName')) {
        const rank = parseInt(key.replace('stPlayerName', ''));
        rankingFields.playerNames.push({ key, value, rank });
      } else if (key.endsWith('stPrize')) {
        const rank = parseInt(key.replace('stPrize', ''));
        rankingFields.prizes.push({ key, value, rank });
      }
    }
    
    // 各フィールドの個数を確認し、値が入っているかチェック
    const playerUidsCount = rankingFields.playerUids.length;
    const playerNamesCount = rankingFields.playerNames.length;
    const prizesCount = rankingFields.prizes.length;
    
    // いずれかのフィールドが不完全な場合
    if (playerUidsCount === 0 || playerNamesCount === 0 || prizesCount === 0) {
      validationResult.errorType = 'no_ranking';
      validationResult.message = '順位情報が不完全です';
      validationResult.requiresRanking = true;
      validationResult.rankingData = {
        pointType: pointType,
        fields: rankingFields,
      };
      return { success: false, ...validationResult };
    }
    
    // 各順位について、Uid, Name, Prizeが全て存在し、値が入っているか確認
    const missingFields = [];
    const missingRanks: number[] = []; // 未確定の順位リスト
    const existingRankings = [];
    const maxRank = Math.max(playerUidsCount, playerNamesCount, prizesCount);
    
    for (let i = 1; i <= maxRank; i++) {
      const uidKey = `${i}stPlayerUid`;
      const nameKey = `${i}stPlayerName`;
      const prizeKey = `${i}stPrize`;
      
      const uid = mainViewData?.[uidKey];
      const name = mainViewData?.[nameKey];
      const prize = mainViewData?.[prizeKey];
      
      if (uid && name && prize !== undefined && prize !== null) {
        existingRankings.push({
          rank: i,
          playerName: name,
          prize: prize,
        });
      } else {
        // XstPlayerUidまたはXstPlayerNameがnullの場合、その順位を未確定リストに追加
        if (!uid || !name) {
          if (!missingRanks.includes(i)) {
            missingRanks.push(i);
          }
        }
        if (!uid) missingFields.push(`${i}stPlayerUid`);
        if (!name) missingFields.push(`${i}stPlayerName`);
        if (prize === undefined || prize === null) missingFields.push(`${i}stPrize`);
      }
    }
    
    if (missingFields.length > 0) {
      validationResult.errorType = 'no_ranking';
      validationResult.message = '一部の順位情報が未確定です';
      validationResult.requiresRanking = true;
      validationResult.rankingData = {
        pointType: pointType,
        existingRankings,
        missingFields,
        missingRanks: missingRanks.sort((a, b) => a - b), // 順位順にソート
      };
      return { success: false, ...validationResult };
    }
    
    // 4. 全ての確認が完了
    validationResult.isValid = true;
    validationResult.errorType = 'complete';
    validationResult.rankingData = {
      pointType: pointType,
      rankings: existingRankings,
    };
    
    return {
      success: true,
      ...validationResult,
    };
    
  } catch (error) {
    console.error('validateEndTournament error:', error);
    
    if (error instanceof HttpsError) {
      throw error;
    }
    
    throw new HttpsError('internal', 'Internal server error');
  }
});

