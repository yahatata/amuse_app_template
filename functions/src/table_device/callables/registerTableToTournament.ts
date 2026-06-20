import * as admin from 'firebase-admin';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { z } from 'zod';

import {
  assertTableDeviceRegistrationEnabled,
  buildEmptySeats,
  requireTableDeviceCaller,
  resolveCurrentBusinessDateKey,
  resolveSideGameTypes,
  serverTimestamp,
} from '../lib/shared';
import { logOpsError, logOpsSuccess } from '../../shared/logging/logOpsError';

const schema = z.object({
  tableId: z.string().min(1),
  tournamentId: z.string().min(1),
});

const ALLOWED_TOURNAMENT_STATUSES = new Set([
  'scheduled',
  'running',
  'registered',
  'paused',
]);

export const registerTableToTournament = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', '認証が必要です');
  }

  let deviceId: string | undefined;
  try {
    const { tableId, tournamentId } = schema.parse(request.data);
    const db = admin.firestore();
    const { device } = await requireTableDeviceCaller({
      callerUid: request.auth.uid,
      requestedTableId: tableId,
    });
    deviceId = device.id;
    await assertTableDeviceRegistrationEnabled(db, device);

    const sideGameTypes = await resolveSideGameTypes(db);
    const currentBusinessDateKey = await resolveCurrentBusinessDateKey(db);

    const result = await db.runTransaction(async (transaction) => {
      const tableRef = db.collection('tables').doc(tableId);
      const tournamentRef = db.collection('scheduledTournaments').doc(tournamentId);
      const tournamentTableRef = tournamentRef.collection('tablesSeat').doc(tableId);

      const [tableDoc, tournamentDoc, tournamentTableDoc] = await Promise.all([
        transaction.get(tableRef),
        transaction.get(tournamentRef),
        transaction.get(tournamentTableRef),
      ]);

      if (!tableDoc.exists) {
        throw new HttpsError('not-found', '卓が見つかりません');
      }
      const tableData = tableDoc.data() ?? {};
      if (tableData.isEnabled === false) {
        throw new HttpsError('failed-precondition', '無効化された卓は操作できません');
      }

      const tableStatus = tableData.status as string | undefined;
      if (tableStatus !== 'open') {
        if (tableStatus === 'tournament') {
          const currentTournamentName =
            (tableData.tournamentDetail as Record<string, unknown> | undefined)
              ?.tournamentName;
          const label =
            typeof currentTournamentName === 'string' && currentTournamentName.length > 0
              ? currentTournamentName
              : '別のトーナメント';
          throw new HttpsError(
            'failed-precondition',
            `既に ${label} に登録されています。先に登録解除を行ってください。`,
          );
        }
        if (tableStatus != null && sideGameTypes.includes(tableStatus)) {
          throw new HttpsError(
            'failed-precondition',
            '既にサイドゲームに登録されています。先に登録解除を行ってください。',
          );
        }
        throw new HttpsError(
          'failed-precondition',
          `この卓は現在 ${tableStatus ?? '不明な状態'} のため登録できません`,
        );
      }

      if (!tournamentDoc.exists) {
        throw new HttpsError('not-found', 'トーナメントが見つかりません');
      }
      const tournamentData = tournamentDoc.data() ?? {};
      const tournamentStatus = tournamentData.status as string | undefined;
      if (!ALLOWED_TOURNAMENT_STATUSES.has(tournamentStatus ?? '')) {
        throw new HttpsError(
          'failed-precondition',
          'このトーナメントには現在登録できません',
        );
      }

      const businessDate = tournamentData.businessDate as string | undefined;
      if (businessDate !== currentBusinessDateKey) {
        throw new HttpsError(
          'failed-precondition',
          '当日営業日のトーナメントのみ登録できます',
        );
      }

      const startAt = tournamentData.startAt as admin.firestore.Timestamp | undefined;
      if (!startAt) {
        throw new HttpsError('failed-precondition', '開始時刻が設定されていません');
      }
      const oneHourAgo = Date.now() - 60 * 60 * 1000;
      if (startAt.toDate().getTime() < oneHourAgo) {
        throw new HttpsError(
          'failed-precondition',
          '開始から1時間を超えたトーナメントには登録できません',
        );
      }

      if (tournamentTableDoc.exists && tournamentTableDoc.data()?.isEnabled !== false) {
        throw new HttpsError(
          'failed-precondition',
          'この卓は既にこのトーナメントへ登録済みです',
        );
      }

      const maxSeats = Number(tableData.maxSeats ?? 6);
      const seats = buildEmptySeats(maxSeats);
      const snapshot = tournamentData.snapshot as Record<string, unknown> | undefined;
      const tournamentName =
        typeof snapshot?.name === 'string' && snapshot.name.length > 0
          ? snapshot.name
          : tournamentId;

      transaction.update(tableRef, {
        status: 'tournament',
        tournamentDetail: {
          tournamentId,
          tournamentName,
          startAt,
        },
        updatedAt: serverTimestamp(),
      });

      if (tournamentTableDoc.exists) {
        transaction.update(tournamentTableRef, {
          maxSeats,
          seats,
          isEnabled: true,
          updatedAt: serverTimestamp(),
        });
      } else {
        transaction.set(tournamentTableRef, {
          maxSeats,
          seats,
          isEnabled: true,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }

      return {
        success: true,
        tableId,
        tournamentId,
        tournamentName,
      };
    });

    logOpsSuccess({
      message: 'registerTableToTournament 成功',
      functionEntry: 'registerTableToTournament',
      context: {
        deviceId,
        tableId,
        tournamentId,
      },
    });

    return result;
  } catch (error) {
    logOpsError({
      message: 'registerTableToTournament 失敗',
      functionEntry: 'registerTableToTournament',
      cause: error,
      context: {
        deviceId,
      },
    });

    if (error instanceof HttpsError) {
      throw error;
    }
    if (error instanceof z.ZodError) {
      throw new HttpsError('invalid-argument', error.errors.map((e) => e.message).join(', '));
    }
    throw new HttpsError(
      'internal',
      error instanceof Error ? error.message : '卓のトーナメント登録に失敗しました',
    );
  }
});
