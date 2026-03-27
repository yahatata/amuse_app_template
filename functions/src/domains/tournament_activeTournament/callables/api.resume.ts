import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { z } from "zod";
import { getCallerDeviceByUid, hasRequiredOption, isActive } from "../../../shared/devices";
import { logOpsError } from "../../../shared/logging/logOpsError";

// 入力スキーマの定義
const resumeTournamentSchema = z.object({
  tournamentId: z.string().min(1, "トーナメントIDは必須です"),
});

export const resumeTournament = onCall(async (request) => {
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
    const validatedData = resumeTournamentSchema.parse(request.data);
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
      if (tournamentData.status !== 'paused') {
        throw new HttpsError('failed-precondition', `Tournament is not paused. Current status: ${tournamentData.status}`);
      }

      if (runtimeData.status !== 'paused') {
        throw new HttpsError('failed-precondition', `Runtime is not paused. Current status: ${runtimeData.status}`);
      }

      // 一時停止中であることを確認
      if (!runtimeData.pausedAt) {
        throw new HttpsError('failed-precondition', 'Tournament is not currently paused');
      }

      // 一時停止時間を計算
      const pausedAt = runtimeData.pausedAt as Timestamp;
      const pauseDurationSec = Math.floor((now.toMillis() - pausedAt.toMillis()) / 1000);
      
      // 現在のshiftSecに一時停止時間を加算
      const currentShiftSec = runtimeData.shiftSec || 0;
      const newShiftSec = currentShiftSec + pauseDurationSec;

      // トーナメントとruntimeの両方を再開状態に更新
      transaction.update(tournamentRef, {
        status: 'running',
        updatedAt: now
      });

      transaction.update(runtimeRef, {
        status: 'running',
        pausedAt: null,
        shiftSec: newShiftSec,
        updatedAt: now
      });
    });

    return {
      success: true,
      message: 'トーナメントが再開されました',
      tournamentId,
      resumedAt: now.toDate().toISOString()
    };

  } catch (error) {
    logOpsError({
      message: 'resumeTournament error:',
      failureType: 'business',
      functionEntry: 'resumeTournament',
      cause: error,
    });
    
    if (error instanceof HttpsError) {
      throw error;
    }
    
    if (error instanceof z.ZodError) {
      throw new HttpsError('invalid-argument', `Validation error: ${error.errors.map(e => e.message).join(', ')}`);
    }
    
    throw new HttpsError('internal', 'トーナメントの再開に失敗しました');
  }
});
