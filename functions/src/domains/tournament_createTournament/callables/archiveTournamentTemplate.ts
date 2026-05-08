import { onCall } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";
import { logOpsError, logOpsSuccess } from "../../../shared/logging/logOpsError";

export const archiveTournamentTemplate = onCall(async (request) => {
  const logContext: Record<string, unknown> = { callerUid: request.auth?.uid ?? null };
  try {
    const { tournamentTemplateId } = request.data;
    
    if (!tournamentTemplateId || typeof tournamentTemplateId !== 'string') {
      return { success: false, error: 'トーナメントテンプレートIDは必須です' };
    }
    Object.assign(logContext, { tournamentTemplateId });

    const db = getFirestore();
    const docRef = db.collection('tournamentTemplates').doc(tournamentTemplateId);
    const doc = await docRef.get();
    
    if (!doc.exists) {
      return { success: false, error: '指定されたトーナメントテンプレートが見つかりません' };
    }

    await docRef.update({
      isArchived: true,
      updatedAt: new Date(),
    });
    logOpsSuccess({
      message: 'archiveTournamentTemplate 成功',
      functionEntry: 'archiveTournamentTemplate',
      context: { tournamentTemplateId },
    });

    return { 
      success: true, 
      message: 'トーナメントテンプレートが正常にアーカイブされました' 
    };
  } catch (error) {
    logOpsError({
      message: 'トーナメントテンプレートアーカイブエラー:',
      functionEntry: 'archiveTournamentTemplate',
      cause: error,
      context: logContext,
    });
    return { success: false, error: 'トーナメントテンプレートのアーカイブに失敗しました' };
  }
});
