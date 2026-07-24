import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { z } from 'zod';
import { getCallerDeviceByUid, hasRequiredOption, isActive } from '../../../shared/devices';
import { logOpsError, logOpsSuccess } from "../../../shared/logging/logOpsError";
import { FunctionCustomError, mapFunctionCustomErrorToHttpsCode } from '../../../shared/logging/functionCustomError';
import { assertTournamentAllowsMutation } from '../lib/assertTournamentAllowsMutation';
import { getStoreConfig } from '../../../shared/config/configLoader';
import { validatePointConfigFromStoreConfig } from '../../../shared/config/validatePointConfig';
import { assertRewardPointTypeForTemplate } from '../helpers/rewardPointType';

const setPrizeDataSchema = z.object({
  tournamentId: z.string().min(1, 'tournamentId is required'),
  prizeData: z.object({
    prizePool: z.number().min(0, 'prizePool must be non-negative'),
    prizeReceiverCount: z.number().min(1, 'prizeReceiverCount must be at least 1').max(100, 'prizeReceiverCount cannot exceed 100'),
    pointType: z.string().optional(), // ポイントタイプ（オプション）
  }).and(z.record(z.string(), z.union([z.string(), z.number(), z.null()]))), // 追加のプライズフィールドを許可（nullも許可）
});

export const setPrizeData = onCall(async (request) => {
  // 認証チェック
  if (!request.auth) {
    throw new HttpsError('unauthenticated', '認証が必要です');
  }

  const callerUid = request.auth.uid;

  try {
    // デバイス権限の確認（role: admin または options.tournament: true）
    const device = await getCallerDeviceByUid(callerUid);
    if (!device || !isActive(device.status)) {
      throw new HttpsError('permission-denied', 'デバイスが見つからないか、アクティブではありません');
    }

    const hasPermission = device.role === 'admin' || hasRequiredOption(device.options, 'tournament');
    if (!hasPermission) {
      throw new HttpsError('permission-denied', 'トーナメント運営の権限がありません');
    }

    // 入力検証
    const { tournamentId, prizeData } = setPrizeDataSchema.parse(request.data);

    const db = getFirestore();

    if (prizeData.pointType !== undefined && prizeData.pointType !== null) {
      const storeConfig = await getStoreConfig(db);
      const validatedConfig = validatePointConfigFromStoreConfig(storeConfig);
      prizeData.pointType = assertRewardPointTypeForTemplate(
        prizeData.pointType,
        validatedConfig,
      );
    }
    
    // トーナメントが存在するかチェック
    const tournamentDoc = await db.collection('scheduledTournaments').doc(tournamentId).get();
    
    if (!tournamentDoc.exists) {
      throw new HttpsError('not-found', 'Tournament not found');
    }

    assertTournamentAllowsMutation({
      tournamentId,
      status: tournamentDoc.data()?.status as string | undefined,
    });
    
    // mainビューデータを更新
    const mainViewRef = db
      .collection('scheduledTournaments')
      .doc(tournamentId)
      .collection('views')
      .doc('main');
    
    await mainViewRef.update(prizeData);
    
    // scheduledTournamentsの親DocにSetedPrize: trueを格納
    const tournamentRef = db.collection('scheduledTournaments').doc(tournamentId);
    await tournamentRef.update({
      SetedPrize: true,
      updatedAt: new Date(),
    });
    logOpsSuccess({
      message: "setPrizeData 成功",
      functionEntry: "setPrizeData",
      context: { tournamentId, deviceId: device.id },
    });

    
    return {
      success: true,
      message: 'Prize data saved successfully',
    };
    
  } catch (error) {
    const parsed = setPrizeDataSchema.safeParse(request.data);
    logOpsError({
      message: 'setPrizeData error:',
      functionEntry: 'setPrizeData',
      cause: error,
      context: parsed.success
        ? { tournamentId: parsed.data.tournamentId, callerUid: request.auth?.uid }
        : { callerUid: request.auth?.uid, inputParseFailed: true as const },
    });
    
    if (error instanceof z.ZodError) {
      throw new HttpsError('invalid-argument', `Input validation error: ${error.errors.map(e => e.message).join(', ')}`);
    }
    
    if (error instanceof HttpsError) {
      throw error;
    }

    if (error instanceof FunctionCustomError) {
      throw new HttpsError(mapFunctionCustomErrorToHttpsCode(error.errorKey), error.message);
    }
    
    throw new HttpsError('internal', 'Internal server error');
  }
});
