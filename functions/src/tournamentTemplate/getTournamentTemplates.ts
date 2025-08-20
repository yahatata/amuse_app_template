import { onCall } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";

export const getTournamentTemplates = onCall(async (request) => {
  try {
    const db = getFirestore();
    
    const snapshot = await db.collection('tournamentTemplates')
      .where('isArchived', '==', false)
      .orderBy('updatedAt', 'desc')
      .get();

    const tournamentTemplates = snapshot.docs.map(doc => {
      const data = doc.data();
      
      // updatedAtの処理
      let updatedAtValue;
      if (data.updatedAt) {
        if (typeof data.updatedAt.toDate === 'function') {
          // Firestore Timestampの場合
          updatedAtValue = data.updatedAt.toDate().toISOString();
        } else if (data.updatedAt instanceof Date) {
          // Date型の場合
          updatedAtValue = data.updatedAt.toISOString();
        } else {
          // その他の場合（文字列など）
          updatedAtValue = data.updatedAt.toString();
        }
      } else {
        updatedAtValue = null;
      }
      
      // Firestoreのデータを適切な型に変換
      const convertedData: any = {
        id: doc.id,
        name: data.name || '',
        entryFee: data.entryFee || 0,
        isReentry: data.isReentry || false,
        maxReentries: data.maxReentries || null,
        reentryFee: data.reentryFee || null,
        startStack: data.startStack || 0,
        isAddon: data.isAddon || false,
        addonFee: data.addonFee || null,
        addonStack: data.addonStack || null,
        blindStructure: data.blindStructure || '',
        prizeRatio: data.prizeRatio || 0,
        tournamentCategory: data.tournamentCategory || '',
        updatedAt: updatedAtValue,
        isArchived: data.isArchived || false,
      };
      return convertedData;
    });

    return {
      success: true,
      tournamentTemplates,
      message: 'トーナメントテンプレートを正常に取得しました'
    };

  } catch (error) {
    console.error('トーナメントテンプレート取得エラー:', error);
    return { success: false, error: 'トーナメントテンプレートの取得に失敗しました' };
  }
});
