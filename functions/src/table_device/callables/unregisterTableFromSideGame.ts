import * as admin from 'firebase-admin';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { z } from 'zod';

import {
  buildSeatClearUpdateFromSeats,
  countOccupiedSeatIds,
  requireTableDeviceCaller,
  resolveForceClearPasscode,
  resolveSideGameTypes,
  serverTimestamp,
  validateForceClear,
} from '../lib/shared';
import { logOpsError, logOpsSuccess } from '../../shared/logging/logOpsError';

const schema = z.object({
  tableId: z.string().min(1),
  force: z.boolean().optional(),
  passcode: z.string().optional(),
});

export const unregisterTableFromSideGame = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', '認証が必要です');
  }

  let deviceId: string | undefined;
  try {
    const { tableId, force = false, passcode } = schema.parse(request.data);
    const db = admin.firestore();
    const { device } = await requireTableDeviceCaller({
      callerUid: request.auth.uid,
      requestedTableId: tableId,
    });
    deviceId = device.id;
    const sideGameTypes = await resolveSideGameTypes(db);
    const correctPasscode = await resolveForceClearPasscode(db);

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
      if (!sideGameDoc.exists) {
        throw new HttpsError('not-found', 'サイドゲーム情報が見つかりません');
      }

      const tableData = tableDoc.data() ?? {};
      const tableStatus = tableData.status as string | undefined;
      if (tableStatus == null || !sideGameTypes.includes(tableStatus)) {
        throw new HttpsError(
          'failed-precondition',
          '現在サイドゲーム状態ではないため解除できません',
        );
      }

      const sideGameData = sideGameDoc.data() ?? {};
      if (sideGameData.active !== true) {
        throw new HttpsError(
          'failed-precondition',
          '現在サイドゲーム進行中ではありません',
        );
      }

      const seats = (sideGameData.seats as Record<string, unknown> | undefined) ?? {};
      const occupiedCount = countOccupiedSeatIds(seats);
      validateForceClear({
        occupiedCount,
        force,
        passcode,
        correctPasscode,
      });

      const maxSeats = Number(sideGameData.maxSeats ?? tableData.maxSeats ?? 6);
      const seatClearUpdate = buildSeatClearUpdateFromSeats(seats, maxSeats);
      transaction.update(sideGameRef, {
        ...seatClearUpdate,
        active: false,
        updatedAt: serverTimestamp(),
      });

      const hasTournamentDetail =
        typeof (
          tableData.tournamentDetail as Record<string, unknown> | undefined
        )?.tournamentId === 'string';
      transaction.update(tableRef, {
        status: hasTournamentDetail ? 'tournament' : 'open',
        updatedAt: serverTimestamp(),
      });

      return {
        success: true,
        tableId,
        restoredStatus: hasTournamentDetail ? 'tournament' : 'open',
        forced: occupiedCount > 0,
      };
    });

    logOpsSuccess({
      message: 'unregisterTableFromSideGame 成功',
      functionEntry: 'unregisterTableFromSideGame',
      context: {
        deviceId,
        tableId,
      },
    });

    return result;
  } catch (error) {
    logOpsError({
      message: 'unregisterTableFromSideGame 失敗',
      functionEntry: 'unregisterTableFromSideGame',
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
      error instanceof Error ? error.message : '卓のサイドゲーム解除に失敗しました',
    );
  }
});
