import * as admin from 'firebase-admin';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { z } from 'zod';

import {
  assertTableDeviceRegistrationEnabled,
  buildEmptySeats,
  countOccupiedSeatIds,
  requireTableDeviceCaller,
  resolveSideGameTypes,
  serverTimestamp,
} from '../lib/shared';
import { logOpsError, logOpsSuccess } from '../../shared/logging/logOpsError';

const schema = z.object({
  tableId: z.string().min(1),
  gameName: z.string().min(1),
  allowOverride: z.boolean().optional(),
});

export const registerTableToSideGame = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', '認証が必要です');
  }

  let deviceId: string | undefined;
  try {
    const { tableId, gameName, allowOverride = false } = schema.parse(request.data);
    const db = admin.firestore();
    const { device } = await requireTableDeviceCaller({
      callerUid: request.auth.uid,
      requestedTableId: tableId,
    });
    deviceId = device.id;
    await assertTableDeviceRegistrationEnabled(db, device);

    const sideGameTypes = await resolveSideGameTypes(db);
    if (!sideGameTypes.includes(gameName)) {
      throw new HttpsError('invalid-argument', '無効なサイドゲーム名です');
    }

    const result = await db.runTransaction(async (transaction) => {
      const tableRef = db.collection('tables').doc(tableId);
      const sideGameRef = db.collection('sideGame').doc(tableId);
      const [tableDoc, sideGameDoc] = await Promise.all([
        transaction.get(tableRef),
        transaction.get(sideGameRef),
      ]);

      if (!tableDoc.exists) {
        throw new HttpsError('not-found', '卓が見つかりません');
      }
      const tableData = tableDoc.data() ?? {};
      if (tableData.isEnabled === false) {
        throw new HttpsError('failed-precondition', '無効化された卓は操作できません');
      }

      const tableStatus = (tableData.status as string | undefined) ?? 'open';
      const currentSideGameActive = sideGameDoc.data()?.active === true;
      if (sideGameTypes.includes(tableStatus) && currentSideGameActive) {
        throw new HttpsError(
          'failed-precondition',
          '既にサイドゲームに登録されています。先に登録解除を行ってください。',
        );
      }

      const tournamentDetail =
        tableData.tournamentDetail as Record<string, unknown> | undefined;

      if (tableStatus === 'tournament') {
        const tournamentId =
          typeof tournamentDetail?.tournamentId === 'string'
            ? tournamentDetail.tournamentId
            : null;
        if (tournamentId == null) {
          throw new HttpsError(
            'failed-precondition',
            'トーナメント情報が不正なためサイドゲームを開始できません',
          );
        }
        const tournamentTableDoc = await transaction.get(
          db
            .collection('scheduledTournaments')
            .doc(tournamentId)
            .collection('tablesSeat')
            .doc(tableId),
        );
        const seats =
          (tournamentTableDoc.data()?.seats as Record<string, unknown> | undefined) ?? {};
        const occupiedCount =
          tournamentTableDoc.exists && tournamentTableDoc.data()?.isEnabled !== false
            ? countOccupiedSeatIds(seats)
            : 0;
        if (occupiedCount > 0) {
          throw new HttpsError(
            'failed-precondition',
            'トーナメントで着席中のため、この卓でサイドゲームを開始できません',
          );
        }
        if (!allowOverride) {
          throw new HttpsError(
            'failed-precondition',
            'トーナメント登録中ですが使用しますか？ サイドゲーム終了後に登録されたトーナメントにて使用可能になります。',
          );
        }
      } else if (tableStatus !== 'open') {
        if (!allowOverride) {
          throw new HttpsError(
            'failed-precondition',
            'この卓は現在他の用途で使用中ですが、サイドゲームを開始しますか？',
          );
        }
      }

      const maxSeats = Number(tableData.maxSeats ?? 6);
      const seats = buildEmptySeats(maxSeats);
      const tableName =
        typeof tableData.name === 'string' && tableData.name.length > 0
          ? tableData.name
          : tableId;

      if (sideGameDoc.exists) {
        transaction.update(sideGameRef, {
          tableId,
          name: tableName,
          maxSeats,
          gameName,
          seats,
          active: true,
          isEnabled: true,
          updatedAt: serverTimestamp(),
        });
      } else {
        transaction.set(sideGameRef, {
          tableId,
          name: tableName,
          maxSeats,
          gameName,
          seats,
          active: true,
          isEnabled: true,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }

      transaction.update(tableRef, {
        status: gameName,
        updatedAt: serverTimestamp(),
      });

      return {
        success: true,
        tableId,
        gameName,
      };
    });

    logOpsSuccess({
      message: 'registerTableToSideGame 成功',
      functionEntry: 'registerTableToSideGame',
      context: {
        deviceId,
        tableId,
        gameName,
      },
    });

    return result;
  } catch (error) {
    logOpsError({
      message: 'registerTableToSideGame 失敗',
      functionEntry: 'registerTableToSideGame',
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
      error instanceof Error ? error.message : '卓のサイドゲーム登録に失敗しました',
    );
  }
});
