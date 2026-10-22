import { logger } from "firebase-functions";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";
import { logOpsError, logOpsSuccess } from "../../../shared/logging/logOpsError";
import { FunctionCustomError, mapFunctionCustomErrorToHttpsCode } from "../../../shared/logging/functionCustomError";
import { resolveAddonLimitPerPlayer } from "../../../shared/tournament/resolveAddonLimitPerPlayer";
import { getStoreConfig } from "../../../shared/config/configLoader";
import { validatePointConfigFromStoreConfig } from "../../../shared/config/validatePointConfig";
import { assertRewardPointTypeForTemplate } from "../../tournament_activeTournament/helpers/rewardPointType";

export const createTournamentTemplate = onCall(async (request) => {
  const logContext: Record<string, unknown> = { callerUid: request.auth?.uid ?? null };
  try {
    const {
      name, entryFee, isReentry, maxReentries, reentryFee, startStack,
      isAddon, addonFee, addonStack, addonLimitPerPlayer: rawAddonLimitPerPlayer,
      blindStructure, prizeRatio,
      color, pointType
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
    if (typeof isAddon !== 'boolean') {
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
    if (!color || typeof color !== 'string') {
      return { success: false, error: '色を選択してください' };
    }

    const addonLimitPerPlayer = resolveAddonLimitPerPlayer({
      isAddon,
      addonLimitPerPlayer: rawAddonLimitPerPlayer,
    });
    if (
      isAddon &&
      rawAddonLimitPerPlayer !== undefined &&
      (!(typeof rawAddonLimitPerPlayer === 'number') ||
        !Number.isInteger(rawAddonLimitPerPlayer) ||
        rawAddonLimitPerPlayer < 1)
    ) {
      logger.warn(
        'createTournamentTemplate: addonLimitPerPlayer は不正または未満のため正規化しました',
      );
    }

    Object.assign(logContext, { name });

    const db = getFirestore();
    const storeConfig = await getStoreConfig(db);
    const validatedConfig = validatePointConfigFromStoreConfig(storeConfig);
    const resolvedPointType = assertRewardPointTypeForTemplate(
      pointType || 'pointA',
      validatedConfig,
    );

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
      addonLimitPerPlayer,
      blindStructure,
      prizeRatio,
      color,
      pointType: resolvedPointType,
      updatedAt: now,
      isArchived: false,
    };

    const docRef = await db.collection('tournamentTemplates').add(tournamentTemplateData);
    logOpsSuccess({
      message: 'createTournamentTemplate 成功',
      functionEntry: 'createTournamentTemplate',
      context: { tournamentTemplateId: docRef.id, name },
    });

    return { 
      success: true, 
      tournamentTemplateId: docRef.id, 
      message: 'トーナメントテンプレートが正常に作成されました' 
    };
  } catch (error) {
    logOpsError({
      message: 'トーナメントテンプレート作成エラー:',
      functionEntry: 'createTournamentTemplate',
      cause: error,
      context: logContext,
    });
    if (error instanceof FunctionCustomError) {
      throw new HttpsError(mapFunctionCustomErrorToHttpsCode(error.errorKey), error.message);
    }
    if (error instanceof HttpsError) {
      throw error;
    }
    return { success: false, error: 'トーナメントテンプレートの作成に失敗しました' };
  }
});
