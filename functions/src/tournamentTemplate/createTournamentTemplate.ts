import { onCall } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";

export const createTournamentTemplate = onCall(async (request) => {
  try {
    const {
      name, entryFee, isReentry, maxReentries, reentryFee, startStack,
      isAddon, addonFee, addonStack, blindStructure, prizeRatio,
      tournamentCategory
    } = request.data;

    // 必須フィールドのバリデーション
    if (!name || typeof name !== 'string') {
      return { success: false, error: 'トーナメント名は必須です' };
    }
    if (!entryFee || typeof entryFee !== 'number' || entryFee <= 0) {
      return { success: false, error: '有効なエントリーフィーを入力してください' };
    }
    if (!startStack || typeof startStack !== 'number' || startStack <= 0) {
      return { success: false, error: '有効な開始スタックを入力してください' };
    }
    if (!isAddon || typeof isAddon !== 'boolean') {
      return { success: false, error: 'アドオンの有無を選択してください' };
    }
    if (isAddon) {
      if (!addonFee || typeof addonFee !== 'number' || addonFee <= 0) {
        return { success: false, error: '有効なアドオンフィーを入力してください' };
      }
      if (!addonStack || typeof addonStack !== 'number' || addonStack <= 0) {
        return { success: false, error: '有効なアドオンスタックを入力してください' };
      }
    }
    if (!blindStructure || typeof blindStructure !== 'string') {
      return { success: false, error: 'ブラインド構造を選択してください' };
    }
    if (!prizeRatio || typeof prizeRatio !== 'number' || prizeRatio <= 0) {
      return { success: false, error: '有効なプライズ割合を入力してください' };
    }
    if (!tournamentCategory || typeof tournamentCategory !== 'string') {
      return { success: false, error: 'トーナメントカテゴリを選択してください' };
    }

    const db = getFirestore();
    const now = new Date();

    const tournamentTemplateData = {
      name,
      entryFee,
      isReentry: isReentry || false,
      maxReentries: maxReentries || null,
      reentryFee: reentryFee || null,
      startStack,
      isAddon,
      addonFee: isAddon ? addonFee : null,
      addonStack: isAddon ? addonStack : null,
      blindStructure,
      prizeRatio,
      tournamentCategory,
      updatedAt: now,
      isArchived: false,
    };

    const docRef = await db.collection('tournamentTemplates').add(tournamentTemplateData);
    
    return { 
      success: true, 
      tournamentTemplateId: docRef.id, 
      message: 'トーナメントテンプレートが正常に作成されました' 
    };
  } catch (error) {
    console.error('トーナメントテンプレート作成エラー:', error);
    return { success: false, error: 'トーナメントテンプレートの作成に失敗しました' };
  }
});
