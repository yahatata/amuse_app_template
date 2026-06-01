import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { logOpsError, logOpsSuccess } from "../../../shared/logging/logOpsError";
import { FunctionCustomError, mapFunctionCustomErrorToHttpsCode } from '../../../shared/logging/functionCustomError';
import {
  mergeLinkedOkibakeBustedPlayers,
  sortBustedPlayersByBustAtDesc,
  type BustedPlayerRow,
} from '../lib/mergeLinkedOkibakeBustedPlayers';

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
      throw new FunctionCustomError({
        errorKey: 'TOURNAMENT_PRIZE_NOT_CONFIRMED',
        message: 'プライズの確定が行われていないため、先にプライズ確定を行ってください',
        context: { tournamentId },
      });
    }
    
    // バストプレイヤーデータを取得
    const bustedDoc = await db
      .collection('scheduledTournaments')
      .doc(tournamentId)
      .collection('tablesSeat')
      .doc('busted')
      .get();
    
    let bustedPlayers: BustedPlayerRow[] = [];

    if (bustedDoc.exists) {
      const bustedData = bustedDoc.data();
      const bustedUser = bustedData?.bustedUser || {};

      bustedPlayers = sortBustedPlayersByBustAtDesc(
        Object.entries(bustedUser).map(([uid, playerData]) => {
          const row = (playerData ?? {}) as Record<string, unknown>;
          return {
            uid,
            pokerName: row.pokerName as string,
            bustAt: row.bustAt,
          };
        })
      );
    }

    // linked + busted の元置きバケを脱落者候補に補完（永続データは変更しない）
    const okibakeLinkedSnap = await db
      .collection('scheduledTournaments')
      .doc(tournamentId)
      .collection('okibakeTemporaryEntries')
      .where('billLinkStatus', '==', 'linked')
      .get();

    const okibakeEntries = okibakeLinkedSnap.docs.map((doc) => doc.data() as Record<string, unknown>);
    bustedPlayers = mergeLinkedOkibakeBustedPlayers(bustedPlayers, okibakeEntries);

    logOpsSuccess({
      message: 'ランキングデータの取得に成功しました',
      functionEntry: 'getRankingData',
      context: {
        tournamentId,
        bustedPlayerCount: bustedPlayers.length,
      },
    });

    return {
      success: true,
      mainViewData,
      bustedPlayers,
    };
    
  } catch (error) {
    if (error instanceof HttpsError) {
      throw error;
    }

    if (error instanceof FunctionCustomError) {
      logOpsError({
        message: 'getRankingData error:',
        functionEntry: 'getRankingData',
        operation: 'getRankingDataCatch',
        cause: error,
      });
      throw new HttpsError(mapFunctionCustomErrorToHttpsCode(error.errorKey), error.message);
    }

    logOpsError({
      message: 'getRankingData error:',
      functionEntry: 'getRankingData',
      operation: 'getRankingDataGenericCatch',
      cause: error,
    });

    throw new HttpsError('internal', 'Internal server error');
  }
});
