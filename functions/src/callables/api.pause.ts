import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { z } from "zod";

// 入力スキーマの定義
const pauseTournamentSchema = z.object({
  tournamentId: z.string().min(1, "トーナメントIDは必須です"),
});

export const pauseTournament = onCall(async (request) => {
  try {
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
        throw new HttpsError('failed-precondition', `Tournament is not running. Current status: ${tournamentData.status}`);
      }

      if (runtimeData.status !== 'running') {
        throw new HttpsError('failed-precondition', `Runtime is not running. Current status: ${runtimeData.status}`);
      }

      // 既に一時停止中でないことを確認
      if (runtimeData.pausedAt) {
        throw new HttpsError('failed-precondition', 'Tournament is already paused');
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
    console.error('pauseTournament error:', error);
    
    if (error instanceof HttpsError) {
      throw error;
    }
    
    if (error instanceof z.ZodError) {
      throw new HttpsError('invalid-argument', `Validation error: ${error.errors.map(e => e.message).join(', ')}`);
    }
    
    throw new HttpsError('internal', 'トーナメントの一時停止に失敗しました');
  }
});
