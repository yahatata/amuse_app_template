import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { z } from 'zod';
import { logOpsError, logOpsSuccess } from "../../../shared/logging/logOpsError";

const getPrizeDataSchema = z.object({
  tournamentId: z.string().min(1, 'tournamentId is required'),
});

export const getPrizeData = onCall(async (request) => {
  try {
    // 入力検証
    const { tournamentId } = getPrizeDataSchema.parse(request.data);
    
    const db = getFirestore();
    
    // トーナメントデータを取得
    const tournamentDoc = await db.collection('scheduledTournaments').doc(tournamentId).get();
    
    if (!tournamentDoc.exists) {
      throw new HttpsError('not-found', 'Tournament not found');
    }
    
    const tournamentData = tournamentDoc.data();
    
    // mainビューデータを取得
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
    
    // tournamentDataから料金情報を取得してmainViewDataに追加
    const snapshot = tournamentData?.snapshot;
    if (snapshot && mainViewData) {
      mainViewData.entryFee = snapshot.entryFee || 0;
      mainViewData.reentryFee = snapshot.reentryFee || 0;
      mainViewData.addonFee = snapshot.addonFee || 0;
      mainViewData.entryStack = snapshot.startStack || 0;
      mainViewData.addonStack = snapshot.addonStack || 0;
    }

    logOpsSuccess({
      message: "getPrizeData 成功",
      functionEntry: "getPrizeData",
      context: { tournamentId },
    });

    return {
      success: true,
      tournamentData,
      mainViewData,
    };
    
  } catch (error) {
    const parsed = getPrizeDataSchema.safeParse(request.data);
    logOpsError({
      message: 'getPrizeData error:',
      functionEntry: 'getPrizeData',
      cause: error,
      context: parsed.success ? { tournamentId: parsed.data.tournamentId } : { inputParseFailed: true as const },
    });
    
    if (error instanceof z.ZodError) {
      throw new HttpsError('invalid-argument', `Input validation error: ${error.errors.map(e => e.message).join(', ')}`);
    }
    
    if (error instanceof HttpsError) {
      throw error;
    }
    
    throw new HttpsError('internal', 'Internal server error');
  }
});
