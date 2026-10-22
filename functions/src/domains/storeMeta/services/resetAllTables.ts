import { getFirestore } from 'firebase-admin/firestore';

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
