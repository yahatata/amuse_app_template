import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { z } from 'zod';
import { getCallerDeviceByUid, hasRequiredOption, isActive } from '../../../shared/devices';
import { logOpsError, logOpsSuccess } from "../../../shared/logging/logOpsError";
import { FunctionCustomError, mapFunctionCustomErrorToHttpsCode } from '../../../shared/logging/functionCustomError';
import { assertTournamentAllowsMutation } from '../lib/assertTournamentAllowsMutation';

// 入力スキーマ
const removeTableFromTournamentSchema = z.object({
  tournamentId: z.string(),
  tableId: z.string(),
});

export const removeTableFromTournament = onCall(async (request) => {
  // 認証チェック
  if (!request.auth) {
    throw new HttpsError('unauthenticated', '認証が必要です');
  }

  const callerUid = request.auth.uid;

  // デバイス権限の確認（role: admin または options.tournament: true）
  const device = await getCallerDeviceByUid(callerUid);
  if (!device || !isActive(device.status)) {
    throw new HttpsError('permission-denied', 'デバイスが見つからないか、アクティブではありません');
  }

  const hasPermission = device.role === 'admin' || hasRequiredOption(device.options, 'tournament');
  if (!hasPermission) {
    throw new HttpsError('permission-denied', 'トーナメント運営の権限がありません');
  }

  try {
    console.log('=== 卓削除: 受信データ ===');
    const { data } = request;
    
    // 入力検証
    const { tournamentId, tableId } = removeTableFromTournamentSchema.parse(data);
    
    console.log(`=== 卓削除開始 ===`);
    console.log(`tournamentId: ${tournamentId}`);
    console.log(`tableId: ${tableId}`);
    
    const db = admin.firestore();
    
    // トランザクション開始（Firestore: 全読み取り → 全書き込みの順で実行すること）
    await db.runTransaction(async (transaction) => {
      const tournamentRef = db.collection('scheduledTournaments').doc(tournamentId);
      const tournamentDoc = await transaction.get(tournamentRef);
      if (!tournamentDoc.exists) {
        throw new FunctionCustomError({
          errorKey: 'TOURNAMENT_INVALID_STATE',
          message: 'トーナメントが存在しません',
          context: { tournamentId, reason: 'tournament_not_found' },
        });
      }
      assertTournamentAllowsMutation({
        tournamentId,
        status: tournamentDoc.data()?.status as string | undefined,
      });

      const tournamentTableRef = db
        .collection('scheduledTournaments')
        .doc(tournamentId)
        .collection('tablesSeat')
        .doc(tableId);
      const tableRef = db.collection('tables').doc(tableId);

      // 1. すべての読み取りを先に実行
      const [tournamentTableDoc, tableDoc] = await Promise.all([
        transaction.get(tournamentTableRef),
        transaction.get(tableRef),
      ]);

      if (!tournamentTableDoc.exists) {
        throw new FunctionCustomError({
          errorKey: 'TOURNAMENT_INVALID_STATE',
          message: 'トーナメントに該当する卓が見つかりません',
          context: { tournamentId, tableId, reason: 'tournament_table_not_found' },
        });
      }
      if (tournamentTableDoc.data()?.isEnabled === false) {
        throw new FunctionCustomError({
          errorKey: 'TOURNAMENT_INVALID_STATE',
          message: 'トーナメントに該当する卓が見つかりません',
          context: {
            tournamentId,
            tableId,
            reason: 'tournament_table_disabled',
          },
        });
      }
      const tableData = tournamentTableDoc.data()!;
      const seats = (tableData.seats as { [key: string]: string | null } | undefined) ?? {};

      const hasOccupiedSeats = Object.entries(seats).some(
        ([key, value]) => {
          if (!key.endsWith('UserId') && !key.endsWith('OkibakeEntryId')) return false;
          return value != null && typeof value === 'string' && value.trim().length > 0;
        }
      );
      if (hasOccupiedSeats) {
        throw new FunctionCustomError({
          errorKey: 'TOURNAMENT_INVALID_STATE',
          message: '着席しているユーザーがいるため、卓を削除できません',
          context: { tournamentId, tableId, reason: 'seats_occupied' },
        });
      }

      if (!tableDoc.exists) {
        throw new FunctionCustomError({
          errorKey: 'TOURNAMENT_INVALID_STATE',
          message: 'テーブルが存在しません',
          context: { tournamentId, tableId, reason: 'table_doc_missing' },
        });
      }

      // 2. 読み取りの後に書き込み
      transaction.update(tournamentTableRef, {
        isEnabled: false,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      transaction.update(tableRef, {
        status: 'open',
        tournamentDetail: admin.firestore.FieldValue.delete(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    });

    logOpsSuccess({
      message: '卓の削除が完了しました',
      functionEntry: 'removeTableFromTournament',
      context: {
        tournamentId,
        tableId,
        callerUid,
        deviceId: device.id,
      },
    });

    return {
      success: true,
      message: '卓を削除しました',
    };
    
  } catch (error) {
    if (error instanceof FunctionCustomError) {
      logOpsError({
        message: '=== 卓削除エラー ===',
        functionEntry: 'removeTableFromTournament',
        operation: 'removeTableFromTournamentCatch',
        cause: error,
      });
      throw new HttpsError(mapFunctionCustomErrorToHttpsCode(error.errorKey), error.message);
    }

    if (error instanceof z.ZodError) {
      throw new HttpsError('invalid-argument', error.errors.map((e) => e.message).join(', '));
    }

    logOpsError({
      message: '=== 卓削除エラー ===',
      functionEntry: 'removeTableFromTournament',
      operation: 'removeTableFromTournamentGenericCatch',
      cause: error,
    });

    if (error instanceof Error) {
      throw new HttpsError('internal', error.message);
    }
    throw new HttpsError('internal', '卓削除に失敗しました');
  }
});
