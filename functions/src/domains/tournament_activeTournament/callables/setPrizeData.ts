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
import {
  convertPrizeReferenceToBalance,
  extractPrizeReferenceEntries,
  resolvePrizeConversionFromConfig,
} from '../helpers/prizeConversion';

const setPrizeDataSchema = z.object({
  tournamentId: z.string().min(1, 'tournamentId is required'),
  prizeData: z.object({
    prizePool: z.number().int().min(0, 'prizePool must be a non-negative integer'),
    prizeReceiverCount: z.number().min(1, 'prizeReceiverCount must be at least 1').max(100, 'prizeReceiverCount cannot exceed 100'),
    pointType: z.string().min(1, 'pointType is required'),
  }).and(z.record(z.string(), z.union([z.string(), z.number(), z.null()]))),
});

export const setPrizeData = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', '認証が必要です');
  }

  const callerUid = request.auth.uid;

  try {
    const device = await getCallerDeviceByUid(callerUid);
    if (!device || !isActive(device.status)) {
      throw new HttpsError('permission-denied', 'デバイスが見つからないか、アクティブではありません');
    }

    const hasPermission = device.role === 'admin' || hasRequiredOption(device.options, 'tournament');
    if (!hasPermission) {
      throw new HttpsError('permission-denied', 'トーナメント運営の権限がありません');
    }

    const { tournamentId, prizeData } = setPrizeDataSchema.parse(request.data);

    const db = getFirestore();
    const storeConfig = await getStoreConfig(db);
    const validatedConfig = validatePointConfigFromStoreConfig(storeConfig);
    const pointType = assertRewardPointTypeForTemplate(prizeData.pointType, validatedConfig);
    const prizeConversion = resolvePrizeConversionFromConfig(pointType, validatedConfig);

    if (typeof prizeData.prizePool !== 'number' || !Number.isInteger(prizeData.prizePool) || prizeData.prizePool < 0) {
      throw new FunctionCustomError({
        errorKey: 'INVALID_ARGUMENT',
        message: 'prizePool は非負整数の基準値量である必要があります',
        context: { tournamentId, pointType },
      });
    }

    const prizeEntries = extractPrizeReferenceEntries(prizeData as Record<string, unknown>);
    for (const entry of prizeEntries) {
      convertPrizeReferenceToBalance(entry.amount, prizeConversion, {
        tournamentId,
        pointType,
        rankKey: entry.rankKey,
      });
    }
    convertPrizeReferenceToBalance(prizeData.prizePool, prizeConversion, {
      tournamentId,
      pointType,
      rankKey: 'prizePool',
    });

    const tournamentDoc = await db.collection('scheduledTournaments').doc(tournamentId).get();
    if (!tournamentDoc.exists) {
      throw new HttpsError('not-found', 'Tournament not found');
    }

    assertTournamentAllowsMutation({
      tournamentId,
      status: tournamentDoc.data()?.status as string | undefined,
    });

    const mainViewRef = db
      .collection('scheduledTournaments')
      .doc(tournamentId)
      .collection('views')
      .doc('main');

    const updatePayload: Record<string, unknown> = {
      ...prizeData,
      pointType,
      prizeConversion,
    };

    await mainViewRef.update(updatePayload);

    const tournamentRef = db.collection('scheduledTournaments').doc(tournamentId);
    await tournamentRef.update({
      SetedPrize: true,
      updatedAt: new Date(),
    });
    logOpsSuccess({
      message: "setPrizeData 成功",
      functionEntry: "setPrizeData",
      context: { tournamentId, deviceId: device.id, pointType },
    });

    return {
      success: true,
      message: 'Prize data saved successfully',
      pointType,
      prizeConversion,
    };

  } catch (error) {
    const parsed = setPrizeDataSchema.safeParse(request.data);
    logOpsError({
      message: 'setPrizeData error:',
      functionEntry: 'setPrizeData',
      cause: error,
      context: parsed.success
        ? {
            tournamentId: parsed.data.tournamentId,
            callerUid: request.auth?.uid,
            pointType: parsed.data.prizeData.pointType,
            ...(error instanceof FunctionCustomError ? { errorKey: error.errorKey } : {}),
          }
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
