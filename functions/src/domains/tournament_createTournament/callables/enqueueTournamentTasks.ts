/**
 * Step 4: enqueue バッチ Callable
 *
 * 手動実行用。enqueueTournamentTasksCore を呼び出す。
 */

import { logger } from 'firebase-functions';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getCallerDeviceByUid, hasRequiredOption, isActive } from '../../../shared/devices';
import { runEnqueueTournamentTasks } from '../services/enqueueTournamentTasksCore';
import { logOpsError, logOpsSuccess } from "../../../shared/logging/logOpsError";
import { FunctionCustomError, mapFunctionCustomErrorToHttpsCode } from '../../../shared/logging/functionCustomError';

export const enqueueTournamentTasks = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', '認証が必要です');
  }

  const device = await getCallerDeviceByUid(request.auth.uid);
  if (!device || !isActive(device.status)) {
    throw new HttpsError('permission-denied', 'デバイスが見つからないか、アクティブではありません');
  }

  const hasPermission = device.role === 'admin' || hasRequiredOption(device.options, 'tournament');
  if (!hasPermission) {
    throw new HttpsError('permission-denied', 'トーナメント運営の権限がありません');
  }

  try {
    const result = await runEnqueueTournamentTasks({});
    // storeMeta/config 欠落・読取失敗時はコア側で logOpsError + skippedReason。成功ログは出さず warn のみ（scheduler 経路と整合）。
    if (result.skippedReason) {
      logger.warn('enqueueTournamentTasks callable: skipped tournament enqueue (store config)', {
        skippedReason: result.skippedReason,
        callerUid: request.auth.uid,
        deviceId: device.id,
      });
      return result;
    }
    if (!result.success) {
      logOpsError({
        message: '=== enqueue バッチエラー（手動 Callable） ===',
        functionEntry: 'enqueueTournamentTasks',
        operation: 'enqueueBatchPartialErrors',
        context: { errors: result.errors },
      });
    }
    logOpsSuccess({
      message: result.success
        ? 'enqueue バッチ（手動 Callable）が正常完了しました'
        : 'enqueue バッチ（手動 Callable）が完了しました（一部エラーあり）',
      functionEntry: 'enqueueTournamentTasks',
      context: {
        processedCount: result.processedCount,
        enqueuedCount: result.enqueuedCount,
        batchSuccess: result.success,
        callerUid: request.auth.uid,
        deviceId: device.id,
        ...(result.errors && result.errors.length > 0 ? { errorCount: result.errors.length } : {}),
      },
    });
    return result;
  } catch (error) {
    if (error instanceof FunctionCustomError) {
      logOpsError({
        message: 'enqueueTournamentTasks エラー:',
        functionEntry: 'enqueueTournamentTasks',
        operation: 'enqueueTournamentTasksCatch',
        cause: error,
      });
      throw new HttpsError(mapFunctionCustomErrorToHttpsCode(error.errorKey), error.message);
    }
    logOpsError({
      message: 'enqueueTournamentTasks エラー:',
      functionEntry: 'enqueueTournamentTasks',
      operation: 'enqueueTournamentTasksGenericCatch',
      cause: error,
    });
    throw new HttpsError(
      'internal',
      error instanceof Error ? error.message : 'enqueue に失敗しました'
    );
  }
});
