/**
 * Step 4: enqueue バッチ Callable
 *
 * 手動実行用。enqueueTournamentTasksCore を呼び出す。
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getCallerDeviceByUid, hasRequiredOption, isActive } from '../../../shared/devices';
import { runEnqueueTournamentTasks } from '../services/enqueueTournamentTasksCore';
import { logOpsError } from "../../../shared/logging/logOpsError";
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
    if (!result.success) {
      logOpsError({
        message: '=== enqueue バッチエラー（手動 Callable） ===',
        functionEntry: 'enqueueTournamentTasks',
        operation: 'enqueueBatchPartialErrors',
        context: { errors: result.errors },
      });
    }
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
