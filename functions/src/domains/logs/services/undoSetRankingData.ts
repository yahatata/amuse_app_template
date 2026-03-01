import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';

export interface RankingEntryForUndo {
  playerUid: string;
  prizeAmount: number;
  entryId: string;
  pointType: 'pointA' | 'pointB';
  logDate: string;
}

export interface UndoSetRankingDataParams {
  tournamentId: string;
  grantIdempotencyKey: string;
  beforeMainView: Record<string, unknown>;
  rankingEntries: RankingEntryForUndo[];
}

/**
 * ランキングデータ設定を巻き戻す。
 * main を beforeMainView に復元し、付与した賞金を users から減算し、
 * pointALogs/pointBLogs の該当 entry を削除、grantRecord を削除、SetedRanking を false に戻す。
 */
export async function undoSetRankingData(params: UndoSetRankingDataParams): Promise<void> {
  const db = getFirestore();
  const now = Timestamp.now();

  await db.runTransaction(async (transaction) => {
    const mainViewRef = db
      .collection('scheduledTournaments')
      .doc(params.tournamentId)
      .collection('views')
      .doc('main');
    const tournamentRef = db.collection('scheduledTournaments').doc(params.tournamentId);
    const grantRecordRef = db
      .collection('scheduledTournaments')
      .doc(params.tournamentId)
      .collection('grantRecords')
      .doc(params.grantIdempotencyKey);

    const reads: Promise<FirebaseFirestore.DocumentSnapshot>[] = [
      transaction.get(mainViewRef),
      transaction.get(tournamentRef),
      transaction.get(grantRecordRef),
    ];
    for (const entry of params.rankingEntries) {
      reads.push(transaction.get(db.collection('users').doc(entry.playerUid)));
      reads.push(
        transaction.get(
          db.collection('users').doc(entry.playerUid).collection(entry.pointType === 'pointA' ? 'pointALogs' : 'pointBLogs').doc(entry.logDate)
        )
      );
    }

    const results = await Promise.all(reads);
    let idx = 0;
    const mainDoc = results[idx++] as FirebaseFirestore.DocumentSnapshot;
    const tournamentDoc = results[idx++] as FirebaseFirestore.DocumentSnapshot;
    const grantRecordDoc = results[idx++] as FirebaseFirestore.DocumentSnapshot;

    const userDocs: FirebaseFirestore.DocumentSnapshot[] = [];
    const pointLogDocs: FirebaseFirestore.DocumentSnapshot[] = [];
    for (const _ of params.rankingEntries) {
      userDocs.push(results[idx++] as FirebaseFirestore.DocumentSnapshot);
      pointLogDocs.push(results[idx++] as FirebaseFirestore.DocumentSnapshot);
    }

    if (!mainDoc.exists) {
      throw new Error('Main view not found');
    }
    if (!tournamentDoc.exists) {
      throw new Error('Tournament not found');
    }

    const mainData = { ...params.beforeMainView, updatedAt: now };
    transaction.set(mainViewRef, mainData);

    for (let i = 0; i < params.rankingEntries.length; i++) {
      const entry = params.rankingEntries[i];
      const userDoc = userDocs[i];
      const pointLogDoc = pointLogDocs[i];

      if (userDoc.exists) {
        const userData = userDoc.data()!;
        const current = (userData[entry.pointType] as number) ?? 0;
        const newValue = Math.max(0, current - entry.prizeAmount);
        transaction.update(db.collection('users').doc(entry.playerUid), {
          [entry.pointType]: newValue,
          updatedAt: now,
        });
      }

      if (pointLogDoc.exists) {
        const logRef = db
          .collection('users')
          .doc(entry.playerUid)
          .collection(entry.pointType === 'pointA' ? 'pointALogs' : 'pointBLogs')
          .doc(entry.logDate);
        transaction.update(logRef, {
          [`logs.${entry.entryId}`]: FieldValue.delete(),
          updatedAt: now,
        });
      }
    }

    if (grantRecordDoc.exists) {
      transaction.delete(grantRecordRef);
    }

    transaction.update(tournamentRef, {
      SetedRanking: false,
      updatedAt: now,
    });
  });

  console.log(`SetRankingData undone for tournament ${params.tournamentId}`);
}
