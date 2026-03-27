/**
 * Step 4: enqueue バッチ Callable
 *
 * 手動実行用。enqueueTournamentTasksCore を呼び出す。
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getCallerDeviceByUid, hasRequiredOption, isActive } from '../../../shared/devices';
import { runEnqueueTournamentTasks } from '../services/enqueueTournamentTasksCore';
import { logOpsError } from "../../../shared/logging/logOpsError";

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
    return result;
  } catch (error) {
    logOpsError({
      message: 'enqueueTournamentTasks エラー:',
      failureType: 'business',
      functionEntry: 'enqueueTournamentTasks',
      cause: error,
    });
    throw new HttpsError(
      'internal',
      error instanceof Error ? error.message : 'enqueue に失敗しました'
    );
  }
});
