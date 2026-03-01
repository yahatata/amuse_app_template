import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import * as crypto from 'crypto';
import { getCallerDeviceByUid, hasRequiredOption, isActive } from '../../../shared/devices';
import { writeSingleOperationLog } from '../../logs/lib/operationLog';

type ForceReason = 'not_registered' | 'no_prize' | 'no_ranking';

export const endTournament = onCall(async (request) => {
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

    const data = request.data as { tournamentId?: string; endType?: 'normal' | 'force'; forceReason?: ForceReason };
    const { tournamentId, endType = 'normal', forceReason } = data ?? {};

    if (!tournamentId) {
      throw new HttpsError('invalid-argument', 'tournamentId is required');
    }

    const db = getFirestore();
    const operationId = crypto.randomUUID();
    const isForceEnd = endType === 'force';

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

      return {
        tournamentId,
        beforeStatus,
        beforeEndedAt,
        tableNames,
        beforeTableStatuses,
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

    return {
      success: true,
      message: 'Tournament ended successfully',
      operationId,
    };
  } catch (error) {
    console.error('endTournament error:', error);

    if (error instanceof HttpsError) {
      throw error;
    }

    throw new HttpsError('internal', 'Internal server error');
  }
});
