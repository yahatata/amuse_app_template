import { onCall } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";
import { logOpsError, logOpsSuccess } from "../../../shared/logging/logOpsError";

export const getBlindTemplates = onCall(async (request) => {
  try {
    const db = getFirestore();
    
    const snapshot = await db.collection('blindTemplates')
      .where('isArchive', '==', false)
      .orderBy('createdAt', 'desc')
      .get();

    const blindTemplates = snapshot.docs.map(doc => {
      const data = doc.data();
      // Firestoreのデータを適切な型に変換
      const convertedData: any = {
        id: doc.id,
        blindName: data.blindName || '',
        numberOfBlindLevels: data.numberOfBlindLevels || 0,
        defaultStartingChips: data.defaultStartingChips || 0,
        blindIntervalBeforeRegLev: data.blindIntervalBeforeRegLev || 0,
        blindIntervalAfterRegLev: data.blindIntervalAfterRegLev || 0,
        lateRegUntilLev: data.lateRegUntilLev || 0,
        anteType: data.anteType || '',
        breakDuration: data.breakDuration || 0,
        levels: data.levels || [],
        createdAt: data.createdAt?.toDate?.() || data.createdAt,
        updatedAt: data.updatedAt?.toDate?.() || data.updatedAt,
      };
      return convertedData;
    });
    logOpsSuccess({
      message: 'getBlindTemplates 成功',
      functionEntry: 'getBlindTemplates',
      context: { count: blindTemplates.length },
    });

    return {
      success: true,
      blindTemplates,
      message: 'ブラインドテンプレートを正常に取得しました'
    };

  } catch (error) {
    logOpsError({
      message: 'ブラインドテンプレート取得エラー:',
      functionEntry: 'getBlindTemplates',
      cause: error,
      context: { callerUid: request.auth?.uid ?? null },
    });
    return { success: false, error: 'ブラインドテンプレートの取得に失敗しました' };
  }
});
