import * as admin from 'firebase-admin';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { z } from 'zod';

import {
  countOccupiedSeatIds,
  deleteTournamentDetail,
  getTournamentTableSeatDoc,
  requireTableDeviceCaller,
  resolveForceClearPasscode,
  serverTimestamp,
  validateForceClear,
} from '../lib/shared';
import { logOpsError, logOpsSuccess } from '../../shared/logging/logOpsError';

const schema = z.object({
  tableId: z.string().min(1),
  tournamentId: z.string().min(1),
  force: z.boolean().optional(),
  passcode: z.string().optional(),
});

export const unregisterTableFromTournament = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', '認証が必要です');
  }

  let deviceId: string | undefined;
  try {
    const { tableId, tournamentId, force = false, passcode } = schema.parse(
      request.data,
    );
    const db = admin.firestore();
    const { device } = await requireTableDeviceCaller({
      callerUid: request.auth.uid,
      requestedTableId: tableId,
    });
    deviceId = device.id;
    const correctPasscode = await resolveForceClearPasscode(db);

    const result = await db.runTransaction(async (transaction) => {
      const tableRef = db.collection('tables').doc(tableId);
      const tournamentRef = db.collection('scheduledTournaments').doc(tournamentId);
      const { ref: tournamentTableRef, doc: tournamentTableDoc } =
        await getTournamentTableSeatDoc({
          transaction,
          db,
          tournamentId,
          tableId,
        });
      const [tableDoc, tournamentDoc] = await Promise.all([
        transaction.get(tableRef),
        transaction.get(tournamentRef),
      ]);

      if (!tableDoc.exists) {
        throw new HttpsError('not-found', '卓が見つかりません');
      }
      if (!tournamentDoc.exists) {
        throw new HttpsError('not-found', 'トーナメントが見つかりません');
      }
      if (!tournamentTableDoc.exists || tournamentTableDoc.data()?.isEnabled === false) {
        throw new HttpsError(
          'failed-precondition',
          '対象トーナメントにこの卓は登録されていません',
        );
      }

      const tableData = tableDoc.data() ?? {};
      if (tableData.status !== 'tournament') {
        throw new HttpsError(
          'failed-precondition',
          '現在トーナメント状態ではないため解除できません',
        );
      }
      const currentTournamentId =
        (tableData.tournamentDetail as Record<string, unknown> | undefined)
          ?.tournamentId;
      if (currentTournamentId !== tournamentId) {
        throw new HttpsError(
          'failed-precondition',
          '現在このトーナメントには紐付いていません',
        );
      }

      const seats = (tournamentTableDoc.data()?.seats as Record<string, unknown> | undefined) ?? {};
      const occupiedCount = countOccupiedSeatIds(seats);
      validateForceClear({
        occupiedCount,
        force,
        passcode,
        correctPasscode,
      });

      transaction.update(tournamentTableRef, {
        isEnabled: false,
        updatedAt: serverTimestamp(),
      });
      transaction.update(tableRef, {
        status: 'open',
        tournamentDetail: deleteTournamentDetail(),
        updatedAt: serverTimestamp(),
      });

      return {
        success: true,
        tableId,
        tournamentId,
        forced: occupiedCount > 0,
      };
    });

    logOpsSuccess({
      message: 'unregisterTableFromTournament 成功',
      functionEntry: 'unregisterTableFromTournament',
      context: {
        deviceId,
        tableId,
        tournamentId,
      },
    });

    return result;
  } catch (error) {
    logOpsError({
      message: 'unregisterTableFromTournament 失敗',
      functionEntry: 'unregisterTableFromTournament',
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
      error instanceof Error ? error.message : '卓のトーナメント解除に失敗しました',
    );
  }
});
