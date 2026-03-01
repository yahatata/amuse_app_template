import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { markOperationLogRolledBack } from '../lib/operationLog';

export interface UndoRegisterParticipantsDetail {
  playerUid: string;
  playerName: string;
  billId?: string;
  templateId?: string;
  isReentry?: boolean;
}

export interface UndoRegisterParticipantsParams {
  tournamentId: string;
  playerUids: string[];
  playerNames: string[];
  rollBackBy: string;
  /** 取り消し者表示用。座席割当ログを「取り消し済み」にする際に rollBackByDeviceName として保存 */
  rollBackByDeviceName?: string | null;
  /** 巻き戻し用（bills 復元・reentries 集計・busted 復元に使用）。無い場合は従来どおり main/usersList のみ更新 */
  details?: UndoRegisterParticipantsDetail[];
}

/**
 * 参加者一括登録操作を巻き戻す
 */
export async function undoRegisterParticipants(params: UndoRegisterParticipantsParams): Promise<void> {
  const db = getFirestore();
  const now = Timestamp.now();
  const details: UndoRegisterParticipantsDetail[] = params.details ?? params.playerUids.map((uid, i) => ({
    playerUid: uid,
    playerName: params.playerNames[i] ?? `User_${uid}`,
    isReentry: false,
  }));

  const entryCount = details.filter((d: UndoRegisterParticipantsDetail) => !d.isReentry).length;
  const reentryCount = details.filter((d: UndoRegisterParticipantsDetail) => d.isReentry).length;
  const n = details.length;

  try {
    await db.runTransaction(async (transaction) => {
      const mainViewRef = db
        .collection('scheduledTournaments')
        .doc(params.tournamentId)
        .collection('views')
        .doc('main');
      const waitingRef = db
        .collection('scheduledTournaments')
        .doc(params.tournamentId)
        .collection('tablesSeat')
        .doc('waiting');
      const bustedRef = db
        .collection('scheduledTournaments')
        .doc(params.tournamentId)
        .collection('tablesSeat')
        .doc('busted');
      const usersListRef = db
        .collection('scheduledTournaments')
        .doc(params.tournamentId)
        .collection('views')
        .doc('usersList');
      const tablesSeatRef = db
        .collection('scheduledTournaments')
        .doc(params.tournamentId)
        .collection('tablesSeat');

      const reads: (Promise<FirebaseFirestore.DocumentSnapshot> | Promise<FirebaseFirestore.QuerySnapshot>)[] = [
        transaction.get(mainViewRef),
        transaction.get(waitingRef),
        transaction.get(bustedRef),
        transaction.get(usersListRef),
        transaction.get(tablesSeatRef.limit(200)),
      ];
      const billRefs = details.filter((d: UndoRegisterParticipantsDetail) => d.billId && d.templateId);
      for (const d of billRefs) {
        reads.push(transaction.get(db.collection('bills').doc(d.billId!).collection('tournaments').doc(d.templateId!)));
      }

      const results = await Promise.all(reads);
      const mainViewDoc = results[0] as FirebaseFirestore.DocumentSnapshot;
      const waitingDoc = results[1] as FirebaseFirestore.DocumentSnapshot;
      const bustedDoc = results[2] as FirebaseFirestore.DocumentSnapshot;
      const usersListDoc = results[3] as FirebaseFirestore.DocumentSnapshot;
      const tablesSeatSnap = results[4] as FirebaseFirestore.QuerySnapshot;
      const billDocs = results.slice(5) as FirebaseFirestore.DocumentSnapshot[];

      if (!mainViewDoc.exists) {
        throw new Error('Main view not found');
      }
      const mainViewData = mainViewDoc.data()!;
      const currentEntries = mainViewData.entries || 0;
      const currentPlayersIn = mainViewData.playersIn || 0;
      const currentWaitingCount = mainViewData.waitingCount || 0;
      const currentReentries = mainViewData.reentries || 0;

      // 1. views/main
      transaction.update(mainViewRef, {
        entries: Math.max(0, currentEntries - entryCount),
        reentries: Math.max(0, currentReentries - reentryCount),
        playersIn: Math.max(0, currentPlayersIn - n),
        waitingCount: Math.max(0, currentWaitingCount - n),
        updatedAt: now,
      });

      // 2. waiting から各ユーザーを削除（取り消し後も待機者一覧に残らないように必ず更新）
      const removeUidSet = new Set(details.map((d) => String(d.playerUid).trim()));
      const currentWaitingRaw = waitingDoc.exists ? (waitingDoc.data()!.waiting as Record<string, unknown> | undefined) : undefined;
      const waiting: Record<string, unknown> = {};
      if (currentWaitingRaw && typeof currentWaitingRaw === 'object') {
        for (const [k, v] of Object.entries(currentWaitingRaw)) {
          const keyNorm = String(k).trim();
          if (removeUidSet.has(keyNorm)) continue;
          waiting[k] = v;
        }
      }
      transaction.set(waitingRef, {
        waiting,
        count: Object.keys(waiting).length,
        updatedAt: now,
      }, { merge: true });

      // 3. 各テーブルの着席から対象者を外す（着席処理後に一括登録を取り消した場合は着席状態も解除する）
      const playerUidSet = new Set(details.map((d: UndoRegisterParticipantsDetail) => d.playerUid));
      for (const doc of tablesSeatSnap.docs) {
        if (doc.id === 'waiting' || doc.id === 'busted') continue;
        const data = doc.data();
        const seats = data.seats || {};
        let changed = false;
        const updatedSeats: Record<string, unknown> = { ...seats };
        for (const [k, v] of Object.entries(seats)) {
          if (k.endsWith('UserId') && typeof v === 'string' && playerUidSet.has(v)) {
            const nameKey = k.replace('UserId', 'PokerName');
            updatedSeats[k] = null;
            updatedSeats[nameKey] = null;
            changed = true;
          }
        }
        if (changed) {
          transaction.update(doc.ref, {
            seats: updatedSeats,
            updatedAt: now,
          });
        }
      }

      // 4. リエントリーだったユーザーを busted に戻す
      if (reentryCount > 0 && bustedDoc.exists) {
        const bustedData = bustedDoc.data()!;
        const bustedUser = { ...(bustedData.bustedUser || {}) };
        for (const d of details) {
          if (d.isReentry) {
            bustedUser[d.playerUid] = { pokerName: d.playerName };
          }
        }
        transaction.update(bustedRef, {
          bustedUser,
          updatedAt: now,
        });
      }

      // 5. usersList から削除
      if (usersListDoc.exists) {
        const usersListData = usersListDoc.data()!;
        const users = { ...(usersListData.users || {}) };
        for (const d of details) {
          delete users[d.playerUid];
        }
        transaction.update(usersListRef, {
          users,
          updatedAt: now,
        });
      }

      // 6. bills を巻き戻す
      for (let i = 0; i < billRefs.length; i++) {
        const d = billRefs[i];
        const billTournamentDoc = billDocs[i];
        if (!d.billId || !d.templateId) continue;
        const billRef = db.collection('bills').doc(d.billId);
        const billTournamentRef = billRef.collection('tournaments').doc(d.templateId);
        if (!billTournamentDoc?.exists) continue;
        const data = billTournamentDoc.data()!;
        if (d.isReentry) {
          const current = data.reentryCount ?? 0;
          const newCount = Math.max(0, current - 1);
          transaction.update(billTournamentRef, {
            reentryCount: newCount,
            updatedAt: now,
            ...(newCount === 0 ? { lastReentryAt: null } : {}),
          });
        } else {
          transaction.update(billTournamentRef, {
            entryCount: 0,
            registeredAt: null,
            updatedAt: now,
          });
        }
        transaction.update(billRef, { updatedAt: now });
      }
    });

    // 対象者に紐づく「座席割当」操作ログを「取り消し済み」にする（席は既に解除済みのため、履歴上も取り消し済みにしないとロールバックでエラーになる）
    const playerUidSet = new Set(details.map((d: UndoRegisterParticipantsDetail) => d.playerUid));
    const seatAssignLogsSnap = await db
      .collection('operationLogs')
      .where('tournamentId', '==', params.tournamentId)
      .limit(500)
      .get();
    for (const doc of seatAssignLogsSnap.docs) {
      const d = doc.data();
      if (d.operationName !== '座席割当') continue;
      if (d.rolledBack === true) continue;
      const payload = (d.payload || {}) as Record<string, unknown>;
      const uid = payload.playerUid as string | undefined;
      if (uid && playerUidSet.has(uid)) {
        await markOperationLogRolledBack(doc.id, params.rollBackBy, params.rollBackByDeviceName ?? undefined);
      }
    }

    console.log(`Register participants operation undone for ${params.playerUids.length} players in tournament ${params.tournamentId}`);
  } catch (error) {
    console.error('Error undoing register participants operation:', error);
    throw error;
  }
}
