import { onCall } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";

export const updateBlindTemplate = onCall(async (request) => {
  try {
    const {
      blindTemplateId,
      blindName,
      numberOfBlindLevels,
      defaultStartingChips,
      blindIntervalBeforeReg,
      blindIntervalAfterReg,
      anteType,
      lateRegUntilLevel,
      breakTime,
      levels,
    } = request.data;

    // バリデーション
    if (!blindTemplateId || typeof blindTemplateId !== 'string') {
      return { success: false, error: 'ブラインドテンプレートIDは必須です' };
    }
    if (!blindName || typeof blindName !== 'string') {
      return { success: false, error: 'ブラインドテンプレート名は必須です' };
    }
    if (!numberOfBlindLevels || typeof numberOfBlindLevels !== 'number' || numberOfBlindLevels <= 0) {
      return { success: false, error: 'ブラインドレベル数は正の数値で入力してください' };
    }
    if (!defaultStartingChips || typeof defaultStartingChips !== 'number' || defaultStartingChips <= 0) {
      return { success: false, error: '開始チップ数は正の数値で入力してください' };
    }
    if (!blindIntervalBeforeReg || typeof blindIntervalBeforeReg !== 'number' || blindIntervalBeforeReg <= 0) {
      return { success: false, error: 'レジスト前ブラインド間隔は正の数値で入力してください' };
    }
    if (!blindIntervalAfterReg || typeof blindIntervalAfterReg !== 'number' || blindIntervalAfterReg <= 0) {
      return { success: false, error: 'レジスト後ブラインド間隔は正の数値で入力してください' };
    }
    if (!anteType || !['BBA', 'None'].includes(anteType)) {
      return { success: false, error: 'アンティタイプはBBAまたはNoneで入力してください' };
    }
    if (!lateRegUntilLevel || typeof lateRegUntilLevel !== 'number' || lateRegUntilLevel <= 0) {
      return { success: false, error: 'レイトレジ終了レベルは正の数値で入力してください' };
    }
    if (!breakTime || typeof breakTime !== 'number' || breakTime < 0) {
      return { success: false, error: 'ブレイク時間は0以上の数値で入力してください' };
    }
    if (!levels || !Array.isArray(levels) || levels.length === 0) {
      return { success: false, error: 'ブラインドレベル情報は必須です' };
    }

    const db = getFirestore();
    const now = new Date();

    // ドキュメントの存在確認
    const docRef = db.collection('blindTemplates').doc(blindTemplateId);
    const doc = await docRef.get();
    
    if (!doc.exists) {
      return { success: false, error: '指定されたブラインドテンプレートが見つかりません' };
    }

    // 更新データを構築
    const updateData = {
      anteType,
      blindIntervalAfterRegLev: blindIntervalAfterReg,
      blindIntervalBeforeRegLev: blindIntervalBeforeReg,
      blindName,
      defaultStartingChips,
      lateRegUntilLev: lateRegUntilLevel,
      levels: levels.map((level: any) => ({
        ante: level.ante || 0,
        bigBlind: level.bigBlind,
        duration: level.duration,
        level: level.level,
        smallBlind: level.smallBlind,
        hasBreakAfter: level.hasBreakAfter || false,
        endTime: level.endTime || 0,
        timeFromLastBreak: level.timeFromLastBreak || 0,
      })),
      numberOfBlindLevels,
      breakDuration: breakTime,
      updatedAt: now,
      isArchive: false,
    };

    await docRef.update(updateData);

    return {
      success: true,
      message: 'ブラインドテンプレートが正常に更新されました'
    };

  } catch (error) {
    console.error('ブラインドテンプレート更新エラー:', error);
    return { success: false, error: 'ブラインドテンプレートの更新に失敗しました' };
  }
});
