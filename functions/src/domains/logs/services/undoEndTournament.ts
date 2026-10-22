import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';

export interface UndoEndTournamentParams {
  tournamentId: string;
  beforeStatus: string;
  /** 取り消しで endedAt をクリアする場合は null / undefined */
  beforeEndedAt: Timestamp | Date | null | undefined;
  tableNames: string[];
  beforeTableStatuses: Record<string, string>;
}

/**
 * トーナメント終了（通常・強制どちらも）を巻き戻す。
 * scheduledTournaments の status / endedAt と各 tables の status を復元する。
 */
export async function undoEndTournament(params: UndoEndTournamentParams): Promise<void> {
  const db = getFirestore();
  const now = Timestamp.now();

  await db.runTransaction(async (transaction) => {
    const tournamentRef = db.collection('scheduledTournaments').doc(params.tournamentId);

    const tournamentDoc = await transaction.get(tournamentRef);
    if (!tournamentDoc.exists) {
      throw new Error('Tournament not found');
    }

    const updateData: FirebaseFirestore.UpdateData<FirebaseFirestore.DocumentData> = {
      status: params.beforeStatus,
      updatedAt: now,
      endedAt:
        params.beforeEndedAt == null || params.beforeEndedAt === undefined
          ? FieldValue.delete()
          : params.beforeEndedAt instanceof Date
            ? params.beforeEndedAt
            : params.beforeEndedAt,
    };
    transaction.update(tournamentRef, updateData);

    for (const tableName of params.tableNames) {
      const prevStatus = params.beforeTableStatuses[tableName];
      if (prevStatus !== undefined) {
        const tableRef = db.collection('tables').doc(tableName);
        transaction.update(tableRef, {
          status: prevStatus,
          updatedAt: now,
        });
      }
    }
  });

  console.log(`End tournament undone for tournament ${params.tournamentId}`);
}
