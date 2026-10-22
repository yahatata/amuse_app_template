/**
 * registerForTournament
 *
 * LIFF ユーザー本人のトーナメント参加登録（atomic）
 *
 * - request.auth.uid 固定
 * - clientNonce 必須
 * - waiting / usersList / 集計 / bill tournaments を 1 transaction
 * - errorKey は HttpsError details で伝達（soft-fail message 廃止）
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as crypto from 'crypto';
import { writeSingleOperationLog, toErrorSummary } from '../../logs/lib/operationLog';
import { logOpsError, logOpsSuccess } from '../../../shared/logging/logOpsError';
import {
  FunctionCustomError,
  mapFunctionCustomErrorToHttpsCode,
} from '../../../shared/logging/functionCustomError';
import {
  getTournamentErrorKeyFromUnknown,
  throwTournamentHttpsError,
} from '../lib/tournamentHttpsError';
import {
  validateTournamentClientNonce,
  validateTournamentId,
} from '../lib/registerForTournamentNonce';
import { executeRegisterForTournamentAtomic } from '../lib/registerForTournamentAtomic';

export const registerForTournament = onCall(async (request) => {
  try {
    if (!request.auth) {
      throwTournamentHttpsError(
        'unauthenticated',
        'TOURNAMENT_UNAUTHENTICATED',
        'Authentication required',
      );
    }

    const userId = request.auth.uid;
    const tournamentId = validateTournamentId(request.data?.tournamentId);
    const clientNonce = validateTournamentClientNonce(request.data?.clientNonce);

    const data = await executeRegisterForTournamentAtomic({
      userId,
      tournamentId,
      clientNonce,
    });

    // operationLog は post-commit ベストエフォート（失敗しても登録成功は維持）
    try {
      await writeSingleOperationLog({
        operationId: crypto.randomUUID(),
        operationName: 'トーナメント登録',
        deviceId: 'liff',
        deviceName: 'LIFF（本人）',
        status: 'succeeded',
        startedAt: null,
        payload: {
          tournamentId: data.tournamentId,
          templateId: data.templateId,
          billId: data.billId,
          reused: data.reused,
          // UID / nonce は載せない
        },
        tournamentId: data.tournamentId,
      });
    } catch (logErr) {
      logOpsError({
        message: 'operationLog 書き込み失敗',
        functionEntry: 'registerForTournament',
        operation: 'recordSuccessOperationLog',
        cause: logErr,
      });
    }

    logOpsSuccess({
      message: 'LIFF用トーナメント参加登録が完了しました',
      functionEntry: 'registerForTournament',
      operation: 'registerForTournamentCallable',
      context: {
        tournamentId: data.tournamentId,
        billId: data.billId,
        templateId: data.templateId,
        reused: data.reused,
      },
    });

    return {
      success: true,
      data,
    };
  } catch (error) {
    if (error instanceof HttpsError) {
      const errorKey = getTournamentErrorKeyFromUnknown(error);
      if (
        errorKey &&
        errorKey !== 'TOURNAMENT_INTERNAL_ERROR' &&
        error.code !== 'internal'
      ) {
        // 想定内業務エラーは top-level で二重計上しない
        throw error;
      }
      logOpsError({
        message: 'registerForTournament failed',
        functionEntry: 'registerForTournament',
        operation: 'registerHttpsError',
        cause: error,
        context: { errorKey: errorKey || null, code: error.code },
      });
      throw error;
    }

    if (error instanceof FunctionCustomError) {
      logOpsError({
        message: 'registerForTournament failed',
        functionEntry: 'registerForTournament',
        operation: 'registerCatch',
        cause: error,
        context: { errorKey: error.errorKey },
      });
      throw new HttpsError(
        mapFunctionCustomErrorToHttpsCode(error.errorKey),
        'Registration failed',
        { errorKey: error.errorKey },
      );
    }

    logOpsError({
      message: 'registerForTournament failed',
      functionEntry: 'registerForTournament',
      operation: 'registerGenericCatch',
      cause: error,
      sourceProductHint: 'firestore',
    });

    const rawData = request.data as Record<string, unknown> | undefined;
    try {
      await writeSingleOperationLog({
        operationId: crypto.randomUUID(),
        operationName: 'トーナメント登録',
        deviceId: 'liff',
        deviceName: 'LIFF（本人）',
        status: 'failed',
        errorSummary: toErrorSummary(error),
        payload: {},
        tournamentId:
          typeof rawData?.tournamentId === 'string' ? rawData.tournamentId : undefined,
      });
    } catch (logErr) {
      logOpsError({
        message: 'operationLog 書き込み失敗',
        functionEntry: 'registerForTournament',
        operation: 'recordFailureOperationLog',
        cause: logErr,
      });
    }

    throw new HttpsError('internal', 'Registration failed', {
      errorKey: 'TOURNAMENT_INTERNAL_ERROR',
    });
  }
});
