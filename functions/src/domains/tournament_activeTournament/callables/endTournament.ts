import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import * as crypto from 'crypto';
import { getCallerDeviceByUid, hasRequiredOption, isActive } from '../../../shared/devices';
import { writeSingleOperationLog } from '../../logs/lib/operationLog';
import { logOpsError, logOpsSuccess } from "../../../shared/logging/logOpsError";
import {
  isOkibakeLinkedUserRequiredHttpsError,
  TOURNAMENT_OKIBAKE_LINKED_USER_REQUIRED_ERROR_KEY,
} from '../lib/okibakeLinkedUserRequiredError';
import {
  applyPendingReviewTransitionInTx,
  collectPendingReviewTargetsInTx,
} from '../lib/pendingReview';

type ForceReason = 'not_registered' | 'no_prize' | 'no_ranking';

export const endTournament = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', '認証が必要です');
  }

  const callerUid = request.auth.uid;
  const logContext: Record<string, unknown> = { callerUid };

  try {
    const device = await getCallerDeviceByUid(callerUid);
    if (!device || !isActive(device.status)) {
      throw new HttpsError('permission-denied', 'デバイスが見つからないか、アクティブではありません');
    }

    const hasPermission = device.role === 'admin' || hasRequiredOption(device.options, 'tournament');
    if (!hasPermission) {
      throw new HttpsError('permission-denied', 'トーナメント運営の権限がありません');
    }

    Object.assign(logContext, { deviceId: device.id });

    const data = request.data as { tournamentId?: string; endType?: 'normal' | 'force'; forceReason?: ForceReason };
    const { tournamentId, endType = 'normal', forceReason } = data ?? {};

    if (!tournamentId) {
      throw new HttpsError('invalid-argument', 'tournamentId is required');
    }

    Object.assign(logContext, {
      tournamentId,
      endType,
      ...(forceReason ? { forceReason } : {}),
    });

    const db = getFirestore();
    const operationId = crypto.randomUUID();
    const isForceEnd = endType === 'force';
    Object.assign(logContext, { operationId });

    const rollbackPayload = await db.runTransaction(async (transaction) => {
      const tournamentRef = db.collection('scheduledTournaments').doc(tournamentId);

      // 1. トーナメントの更新前状態を取得
      const tournamentDoc = await transaction.get(tournamentRef);
      if (!tournamentDoc.exists) {
        throw new HttpsError('not-found', 'Tournament not found');
      }
      const tournamentData = tournamentDoc.data()!;
      const beforeStatus = (tournamentData.status as string) ?? 'registered';
      const beforeEndedAt = tournamentData.endedAt ?? null;

      // 2. tablesSeat からテーブル一覧を取得
      const tablesSeatSnapshot = await transaction.get(
        db.collection('scheduledTournaments').doc(tournamentId).collection('tablesSeat')
      );

      const tableNames: string[] = [];
      tablesSeatSnapshot.forEach((doc) => {
        if (doc.id !== 'waiting' && doc.id !== 'busted') {
          tableNames.push(doc.id);
        }
      });

      // 3. 各テーブルの更新前 status を取得
      const beforeTableStatuses: Record<string, string> = {};
      for (const tableName of tableNames) {
        const tableRef = db.collection('tables').doc(tableName);
        const tableDoc = await transaction.get(tableRef);
        if (tableDoc.exists) {
          const d = tableDoc.data();
          beforeTableStatuses[tableName] = (d?.status as string) ?? 'open';
        }
      }

      // ここまでが読み取り。以降は書き込みのみ。
      const pendingReview = await collectPendingReviewTargetsInTx(transaction, db, tournamentId);
      if (pendingReview.blockedCount > 0) {
        throw new HttpsError(
          'failed-precondition',
          '未接続の置きバケに対象ユーザー未設定が残っています。対象ユーザー設定後に終了してください。',
          {
            errorKey: TOURNAMENT_OKIBAKE_LINKED_USER_REQUIRED_ERROR_KEY,
            blockingOkibakeEntries: pendingReview.blockingEntries,
          }
        );
      }

      transaction.update(tournamentRef, {
        status: 'ended',
        endedAt: new Date(),
      });

      for (const tableName of tableNames) {
        if (beforeTableStatuses[tableName] !== undefined) {
          const tableRef = db.collection('tables').doc(tableName);
          transaction.update(tableRef, { status: 'open' });
        }
      }

      const pendingReviewStats = applyPendingReviewTransitionInTx(
        transaction,
        pendingReview.entriesToPendingReview
      );

      return {
        tournamentId,
        beforeStatus,
        beforeEndedAt,
        tableNames,
        beforeTableStatuses,
        pendingReviewStats,
      };
    });

    const payload: Record<string, unknown> = { ...rollbackPayload };
    if (isForceEnd) {
      payload.endType = 'force';
      if (forceReason) payload.forceReason = forceReason;
    }

    await writeSingleOperationLog({
      operationId,
      operationName: isForceEnd ? 'トーナメント強制終了' : 'トーナメント終了',
      deviceId: device.id,
      deviceName: device.name ?? undefined,
      status: 'succeeded',
      payload,
      tournamentId,
    });
    logOpsSuccess({
      message: "endTournament 成功",
      functionEntry: "endTournament",
      context: {
        tournamentId,
        endType: isForceEnd ? "force" : "normal",
        ...(forceReason ? { forceReason } : {}),
        deviceId: device.id,
        operationId,
      },
    });


    return {
      success: true,
      message: 'Tournament ended successfully',
      operationId,
    };
  } catch (error) {
    if (!isOkibakeLinkedUserRequiredHttpsError(error)) {
      logOpsError({
        message: 'endTournament error:',
        functionEntry: 'endTournament',
        cause: error,
        context: logContext,
      });
    }

    if (error instanceof HttpsError) {
      throw error;
    }

    throw new HttpsError('internal', 'Internal server error');
  }
});
