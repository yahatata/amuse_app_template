import { onCall } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";

export const archiveTournamentTemplate = onCall(async (request) => {
  try {
    const { tournamentTemplateId } = request.data;
    
    if (!tournamentTemplateId || typeof tournamentTemplateId !== 'string') {
      return { success: false, error: 'トーナメントテンプレートIDは必須です' };
    }

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

    return { 
      success: true, 
      message: 'トーナメントテンプレートが正常にアーカイブされました' 
    };
  } catch (error) {
    console.error('トーナメントテンプレートアーカイブエラー:', error);
    return { success: false, error: 'トーナメントテンプレートのアーカイブに失敗しました' };
  }
});
