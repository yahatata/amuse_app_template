import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { z } from "zod";
import { getCallerDeviceByUid, hasRequiredOption, isActive } from "../../../shared/devices";
import { logOpsError } from "../../../shared/logging/logOpsError";
import { FunctionCustomError, mapFunctionCustomErrorToHttpsCode } from '../../../shared/logging/functionCustomError';

// 入力スキーマの定義
const pauseTournamentSchema = z.object({
  tournamentId: z.string().min(1, "トーナメントIDは必須です"),
});

export const pauseTournament = onCall(async (request) => {
  // 認証チェック
  if (!request.auth) {
    throw new HttpsError('unauthenticated', '認証が必要です');
  }

  const callerUid = request.auth.uid;

  try {
    // デバイス権限の確認（role: admin または options.tournament: true）
    const device = await getCallerDeviceByUid(callerUid);
    if (!device || !isActive(device.status)) {
      throw new HttpsError('permission-denied', 'デバイスが見つからないか、アクティブではありません');
    }

    const hasPermission = device.role === 'admin' || hasRequiredOption(device.options, 'tournament');
    if (!hasPermission) {
      throw new HttpsError('permission-denied', 'トーナメント運営の権限がありません');
    }

    // 入力データの検証
    const validatedData = pauseTournamentSchema.parse(request.data);
    const { tournamentId } = validatedData;

    const db = getFirestore();
    const now = Timestamp.now();

    // トランザクションで処理
    await db.runTransaction(async (transaction) => {
      const tournamentRef = db.collection('scheduledTournaments').doc(tournamentId);
      const runtimeRef = db.collection('scheduledTournaments').doc(tournamentId).collection('views').doc('runtime');

      // 現在の状態を取得
      const [tournamentDoc, runtimeDoc] = await Promise.all([
        transaction.get(tournamentRef),
        transaction.get(runtimeRef)
      ]);

      if (!tournamentDoc.exists) {
        throw new HttpsError('not-found', `Tournament not found: ${tournamentId}`);
      }

      if (!runtimeDoc.exists) {
        throw new HttpsError('not-found', `Runtime document not found: ${tournamentId}`);
      }

      const tournamentData = tournamentDoc.data()!;
      const runtimeData = runtimeDoc.data()!;

      // 現在のステータスをチェック
      if (tournamentData.status !== 'running') {
        throw new FunctionCustomError({
          errorKey: 'TOURNAMENT_INVALID_STATE',
          message: `Tournament is not running. Current status: ${tournamentData.status}`,
          context: { tournamentId, phase: 'pause', field: 'tournament.status' },
        });
      }

      if (runtimeData.status !== 'running') {
        throw new FunctionCustomError({
          errorKey: 'TOURNAMENT_INVALID_STATE',
          message: `Runtime is not running. Current status: ${runtimeData.status}`,
          context: { tournamentId, phase: 'pause', field: 'runtime.status' },
        });
      }

      // 既に一時停止中でないことを確認
      if (runtimeData.pausedAt) {
        throw new FunctionCustomError({
          errorKey: 'TOURNAMENT_ALREADY_PAUSED',
          message: 'Tournament is already paused',
          context: { tournamentId },
        });
      }

      // トーナメントとruntimeの両方を一時停止状態に更新
      transaction.update(tournamentRef, {
        status: 'paused',
        updatedAt: now
      });

      transaction.update(runtimeRef, {
        status: 'paused',
        pausedAt: now,
        updatedAt: now
      });
    });

    return {
      success: true,
      message: 'トーナメントが一時停止されました',
      tournamentId,
      pausedAt: now.toDate().toISOString()
    };

  } catch (error) {
    if (error instanceof HttpsError) {
      throw error;
    }

    if (error instanceof z.ZodError) {
      throw new HttpsError('invalid-argument', `Validation error: ${error.errors.map(e => e.message).join(', ')}`);
    }

    if (error instanceof FunctionCustomError) {
      logOpsError({
        message: 'pauseTournament error:',
        functionEntry: 'pauseTournament',
        operation: 'pauseTournamentCatch',
        cause: error,
      });
      throw new HttpsError(mapFunctionCustomErrorToHttpsCode(error.errorKey), error.message);
    }

    logOpsError({
      message: 'pauseTournament error:',
      functionEntry: 'pauseTournament',
      operation: 'pauseTournamentGenericCatch',
      cause: error,
    });

    throw new HttpsError('internal', 'トーナメントの一時停止に失敗しました');
  }
});
