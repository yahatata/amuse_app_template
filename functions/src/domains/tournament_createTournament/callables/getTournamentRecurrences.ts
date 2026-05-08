import { onCall } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";
import { logOpsError, logOpsSuccess } from "../../../shared/logging/logOpsError";

export const getTournamentRecurrences = onCall(async (request) => {
  try {
    console.log('=== 定期開催トーナメント一覧取得開始 ===');
    
    const db = getFirestore();
    
    const snapshot = await db.collection('tournamentRecurrences')
      .orderBy('createdAt', 'desc')
      .get();

    const recurrences = snapshot.docs.map(doc => {
      const data = doc.data();
      
      // Firestoreのデータを適切な型に変換
      const convertedData: any = {
        id: doc.id,
        templateId: data.templateId || '',
        storeId: data.storeId || '',
        tenantId: data.tenantId || '',
        startOn: data.startOn?.toDate?.() || data.startOn,
        interval: data.interval || '',
        byWeekday: data.byWeekday || [],
        endsOn: data.endsOn?.toDate?.() || data.endsOn,
        isActive: data.isActive || false,
        templateVersion: data.templateVersion,
        createdAt: data.createdAt?.toDate?.() || data.createdAt,
        updatedAt: data.updatedAt?.toDate?.() || data.updatedAt,
      };
      
      return convertedData;
    });

    console.log('取得した定期開催数:', recurrences.length);
    logOpsSuccess({
      message: 'getTournamentRecurrences 成功',
      functionEntry: 'getTournamentRecurrences',
      context: { count: recurrences.length },
    });

    return {
      success: true,
      recurrences,
      message: '定期開催トーナメント一覧を正常に取得しました'
    };

  } catch (error) {
    logOpsError({
      message: '定期開催トーナメント一覧取得エラー:',
      functionEntry: 'getTournamentRecurrences',
      cause: error,
      context: { callerUid: request.auth?.uid ?? null },
    });
    return { 
      success: false, 
      error: '定期開催トーナメント一覧の取得に失敗しました' 
    };
  }
});
