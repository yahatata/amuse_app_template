import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { logOpsError, logOpsSuccess } from "../../../shared/logging/logOpsError";

/** Phase6 Step3: ターミナルから呼ぶ core。共通化用。 */
export async function runResetAllTables(
  db: ReturnType<typeof getFirestore>
): Promise<{ count: number }> {
  const tablesSnapshot = await db.collection('tables').get();

  if (tablesSnapshot.empty) {
    return { count: 0 };
  }

  const batch = db.batch();
  let count = 0;

  tablesSnapshot.forEach((doc) => {
    const tableRef = db.collection('tables').doc(doc.id);
    batch.update(tableRef, {
      status: 'open',
      updatedAt: new Date(),
    });
    count++;
  });

  await batch.commit();
  return { count };
}

export const resetAllTables = onCall(async (request) => {
  try {
    const db = getFirestore();
    const { count } = await runResetAllTables(db);
    logOpsSuccess({
      message: 'resetAllTables 成功',
      functionEntry: 'resetAllTables',
      context: { tablesResetCount: count },
    });

    return {
      success: true,
      message: count === 0 ? 'テーブルが存在しません' : `${count}件のテーブルを開店状態にリセットしました`,
      count,
    };
  } catch (error) {
    logOpsError({
      message: 'resetAllTablesエラー:',
      functionEntry: 'resetAllTables',
      cause: error,
      context: { callerUid: request.auth?.uid ?? null },
    });
    throw new HttpsError(
      'internal',
      `全テーブルリセットに失敗しました: ${error}`
    );
  }
});

