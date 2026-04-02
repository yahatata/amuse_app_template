import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { logOpsError } from "../../../shared/logging/logOpsError";

export interface UndoBulkAddonDetail {
  playerUid: string;
  playerName: string;
  billId: string;
  templateId: string;
}

export interface UndoBulkAddonParams {
  tournamentId: string;
  playerUids: string[];
  playerNames: string[];
  tableId: string;
  rollBackBy: string;
  /** 巻き戻し用（bills の addonCount を戻す）。ある場合は bills を更新し、todaysBills は使わない */
  details?: UndoBulkAddonDetail[];
}

/**
 * 複数アドオン操作を巻き戻す
 */
export async function undoBulkAddon(params: UndoBulkAddonParams): Promise<void> {
  const db = getFirestore();
  const now = Timestamp.now();
  const useBills = params.details != null && params.details.length > 0;
  const n = useBills ? params.details!.length : params.playerUids.length;

  try {
    await db.runTransaction(async (transaction) => {
      const mainViewRef = db
        .collection('scheduledTournaments')
        .doc(params.tournamentId)
        .collection('views')
        .doc('main');

      // トランザクション: すべての読み取りを先に実行
      const reads: Promise<FirebaseFirestore.DocumentSnapshot>[] = [
        transaction.get(mainViewRef),
      ];
      if (useBills && params.details) {
        for (const d of params.details) {
          reads.push(transaction.get(db.collection('bills').doc(d.billId).collection('tournaments').doc(d.templateId)));
        }
      } else {
        const billRefs = params.playerUids.map((uid) =>
          db
            .collection('scheduledTournaments')
            .doc(params.tournamentId)
            .collection('todaysBills')
            .doc(uid)
        );
        for (const ref of billRefs) reads.push(transaction.get(ref));
      }

      const results = await Promise.all(reads);
      const mainViewDoc = results[0];
      if (!mainViewDoc.exists) {
        throw new Error('Main view not found');
      }
      const mainViewData = mainViewDoc.data()!;
      const currentAddons = mainViewData.addons || 0;

      // ここから書き込みのみ
      transaction.update(mainViewRef, {
        addons: Math.max(0, currentAddons - n),
        updatedAt: now,
      });

      if (useBills && params.details) {
        for (let i = 0; i < params.details.length; i++) {
          const d = params.details[i];
          const billTournamentDoc = results[1 + i];
          if (!billTournamentDoc?.exists) continue;
          const billRef = db.collection('bills').doc(d.billId);
          const billTournamentRef = billRef.collection('tournaments').doc(d.templateId);
          const data = billTournamentDoc.data()!;
          const current = data.addonCount ?? 0;
          const newCount = Math.max(0, current - 1);
          transaction.update(billTournamentRef, {
            addonCount: newCount,
            updatedAt: now,
            ...(newCount === 0 ? { lastAddonAt: null } : {}),
          });
          transaction.update(billRef, { updatedAt: now });
        }
      } else {
        const billRefs = params.playerUids.map((uid) =>
          db
            .collection('scheduledTournaments')
            .doc(params.tournamentId)
            .collection('todaysBills')
            .doc(uid)
        );
        for (let i = 0; i < billRefs.length; i++) {
          const billsDoc = results[1 + i];
          if (billsDoc.exists && billRefs[i]) {
            const billsData = billsDoc.data()!;
            const currentAddons = billsData.addons || 0;
            transaction.update(billRefs[i], {
              addons: Math.max(0, currentAddons - 1),
              updatedAt: now,
            });
          }
        }
      }
    });

    console.log(`Bulk addon operation undone for ${n} players in tournament ${params.tournamentId}`);
  } catch (error) {
    logOpsError({
      message: 'Error undoing bulk addon operation:',
      failureType: 'business',
      functionEntry: 'undoBulkAddon',
      cause: error,
    });
    throw error;
  }
}
