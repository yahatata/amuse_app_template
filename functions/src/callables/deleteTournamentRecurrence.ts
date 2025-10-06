import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";
import { z } from "zod";

// 入力スキーマの定義
const deleteTournamentRecurrenceSchema = z.object({
  recurrenceId: z.string().min(1, "定期開催IDは必須です"),
});

export const deleteTournamentRecurrence = onCall(async (request) => {
  try {
    console.log('=== 定期開催トーナメント削除開始 ===');
    console.log('受信データ:', JSON.stringify(request.data, null, 2));
    
    // 入力検証
    const validatedData = deleteTournamentRecurrenceSchema.parse(request.data);
    const { recurrenceId } = validatedData;

    const db = getFirestore();

    // 定期開催データの存在確認
    const recurrenceDoc = await db.collection('tournamentRecurrences').doc(recurrenceId).get();
    if (!recurrenceDoc.exists) {
      throw new HttpsError('not-found', '指定された定期開催が見つかりません');
    }

    // 関連するscheduledTournamentsを取得
    const relatedTournaments = await db.collection('scheduledTournaments')
      .where('recurrenceId', '==', recurrenceId)
      .where('status', '==', 'scheduled')
      .get();

    console.log('関連するトーナメント数:', relatedTournaments.docs.length);

    // 関連するトーナメントを削除（またはアーカイブ）
    const batch = db.batch();
    relatedTournaments.docs.forEach(doc => {
      batch.update(doc.ref, {
        isArchived: true,
        updatedAt: new Date()
      });
    });

    // 定期開催データを削除
    batch.delete(recurrenceDoc.ref);

    await batch.commit();

    console.log('定期開催削除完了:', recurrenceId);

    return {
      success: true,
      deletedTournaments: relatedTournaments.docs.length,
      message: `定期開催を削除し、関連する${relatedTournaments.docs.length}件のトーナメントをアーカイブしました`
    };

  } catch (error) {
    console.error('定期開催トーナメント削除エラー:', error);
    if (error instanceof HttpsError) {
      throw error;
    }
    throw new HttpsError('internal', `定期開催トーナメントの削除に失敗しました: ${error}`);
  }
});
