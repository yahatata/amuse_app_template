import { onCall } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";
import { z } from "zod";

const getScheduledTournamentsForEditSchema = z.object({
  type: z.enum(['recurrence', 'template']),
  id: z.string(),
});

export const getScheduledTournamentsForEdit = onCall(async (request) => {
  try {
    const { type, id } = getScheduledTournamentsForEditSchema.parse(request.data);

    const db = getFirestore();
    let query;

    if (type === 'recurrence') {
      // recurrenceIdで検索
      query = db.collection('scheduledTournaments')
        .where('recurrenceId', '==', id)
        .where('status', '==', 'scheduled');
    } else {
      // templateIdで検索
      query = db.collection('scheduledTournaments')
        .where('templateId', '==', id)
        .where('status', '==', 'scheduled');
    }

    const snapshot = await query.get();
    const tournaments = snapshot.docs.map(doc => ({
      id: doc.id,
      startAt: doc.data().startAt,
      name: doc.data().snapshot?.name || '',
    }));

    return {
      success: true,
      tournaments,
    };
  } catch (error) {
    console.error('スケジュール済みトーナメント取得エラー:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '不明なエラーが発生しました',
    };
  }
});
