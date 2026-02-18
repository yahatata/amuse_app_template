import { onCall } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";

export const archiveBlindTemplate = onCall(async (request) => {
  try {
    const { blindTemplateId } = request.data;
    
    if (!blindTemplateId || typeof blindTemplateId !== 'string') {
      return { success: false, error: 'ブラインドテンプレートIDは必須です' };
    }

    const db = getFirestore();
    const docRef = db.collection('blindTemplates').doc(blindTemplateId);
    const doc = await docRef.get();
    
    if (!doc.exists) {
      return { success: false, error: '指定されたブラインドテンプレートが見つかりません' };
    }

    await docRef.update({
      isArchive: true,
      updatedAt: new Date(),
    });

    return { success: true, message: 'ブラインドテンプレートが正常にアーカイブされました' };
  } catch (error) {
    console.error('ブラインドテンプレートアーカイブエラー:', error);
    return { success: false, error: 'ブラインドテンプレートのアーカイブに失敗しました' };
  }
});
