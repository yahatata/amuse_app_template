import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { logOpsError, logOpsSuccess } from "../../../shared/logging/logOpsError";

/** Phase6 Step3: ターミナルから呼ぶ core。共通化用。 */
export async function runResetAllSideGames(
  db: ReturnType<typeof getFirestore>
): Promise<{ count: number }> {
  const sideGamesSnapshot = await db.collection('sideGame').get();

  if (sideGamesSnapshot.empty) {
    return { count: 0 };
  }

  const batch = db.batch();
  let count = 0;

  sideGamesSnapshot.forEach((doc) => {
    const sideGameRef = db.collection('sideGame').doc(doc.id);
    const data = doc.data();

    const updateData: { [key: string]: any } = {
      active: false,
      updatedAt: new Date(),
    };

    if (data.seats && typeof data.seats === 'object') {
      const seats = data.seats as { [key: string]: any };
      for (const key in seats) {
        if (key.includes('PokerName') || key.includes('UserId')) {
          updateData[`seats.${key}`] = null;
        }
      }
    }

    if (data.gameName !== undefined) {
      updateData.gameName = null;
    }

    batch.update(sideGameRef, updateData);
    count++;
  });

  await batch.commit();
  return { count };
}

export const resetAllSideGames = onCall(async (request) => {
  try {
    const db = getFirestore();
    const { count } = await runResetAllSideGames(db);
    logOpsSuccess({
      message: 'resetAllSideGames 成功',
      functionEntry: 'resetAllSideGames',
      context: { sideGamesResetCount: count },
    });

    return {
      success: true,
      message: count === 0 ? 'サイドゲームが存在しません' : `${count}件のサイドゲームをリセットしました`,
      count,
    };
  } catch (error) {
    logOpsError({
      message: 'resetAllSideGamesエラー:',
      functionEntry: 'resetAllSideGames',
      cause: error,
      context: { callerUid: request.auth?.uid ?? null },
    });
    throw new HttpsError(
      'internal',
      `全サイドゲームリセットに失敗しました: ${error}`
    );
  }
});

