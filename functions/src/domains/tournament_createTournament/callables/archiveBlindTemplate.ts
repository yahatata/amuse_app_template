import { onCall } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";
import { logOpsError, logOpsSuccess } from "../../../shared/logging/logOpsError";

export const archiveBlindTemplate = onCall(async (request) => {
  const logContext: Record<string, unknown> = { callerUid: request.auth?.uid ?? null };
  try {
    const { blindTemplateId } = request.data;
    
    if (!blindTemplateId || typeof blindTemplateId !== 'string') {
      return { success: false, error: 'ブラインドテンプレートIDは必須です' };
    }
    Object.assign(logContext, { blindTemplateId });

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
    logOpsSuccess({
      message: 'archiveBlindTemplate 成功',
      functionEntry: 'archiveBlindTemplate',
      context: { blindTemplateId },
    });

    return { success: true, message: 'ブラインドテンプレートが正常にアーカイブされました' };
  } catch (error) {
    logOpsError({
      message: 'ブラインドテンプレートアーカイブエラー:',
      functionEntry: 'archiveBlindTemplate',
      cause: error,
      context: logContext,
    });
    return { success: false, error: 'ブラインドテンプレートのアーカイブに失敗しました' };
  }
});
