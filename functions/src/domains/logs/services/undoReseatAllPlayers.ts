import { getFirestore, Timestamp, type UpdateData, type DocumentData, type DocumentSnapshot } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { logOpsError, logOpsSuccess } from "../../../shared/logging/logOpsError";
import type { OkibakeReseatTarget } from '../../tournament_activeTournament/lib/slimOkibakeEntryForReseatLog';
import {
  buildOkibakeReseatUndoEntryPatch,
  buildRestoredSeatsForReseatUndo,
  countOkibakeRegisteredRestoresOnUndo,
  validateOkibakeReseatUndoEntry,
} from '../lib/okibakeReseatRollback';

export interface UndoReseatAllPlayersParams {
  tournamentId: string;
  previousSeatingData: Record<string, any>; // 前の座席配置データ（waiting + 各 table.seats）
  rollBackBy: string;
  okibakeReseatTargets?: OkibakeReseatTarget[];
}

/**
 * 全員再配置操作を巻き戻す
 */
export async function undoReseatAllPlayers(params: UndoReseatAllPlayersParams): Promise<void> {
  const db = getFirestore();
  const now = Timestamp.now();
  const okibakeTargets = params.okibakeReseatTargets ?? [];

  try {
    await db.runTransaction(async (transaction) => {
      const tournamentRef = db.collection('scheduledTournaments').doc(params.tournamentId);
      const mainViewRef = tournamentRef.collection('views').doc('main');
      const tablesSeatRef = tournamentRef.collection('tablesSeat');

      const tablesSeatSnap = await transaction.get(tablesSeatRef);
      const mainViewDoc = await transaction.get(mainViewRef);

      const tableIdsToRestore = new Set<string>();
      for (const tableId of Object.keys(params.previousSeatingData)) {
        if (tableId !== 'waiting') {
          tableIdsToRestore.add(tableId);
        }
      }
      for (const target of okibakeTargets) {
        if (target.okibakeEntryAfter.assignedTableId) {
          tableIdsToRestore.add(target.okibakeEntryAfter.assignedTableId);
        }
        if (target.okibakeEntryBefore.assignedTableId) {
          tableIdsToRestore.add(target.okibakeEntryBefore.assignedTableId);
        }
      }

      const currentSeatsByTable = new Map<string, Record<string, unknown>>();
      for (const doc of tablesSeatSnap.docs) {
        if (doc.id === 'waiting' || doc.id === 'busted') continue;
        currentSeatsByTable.set(doc.id, (doc.data().seats ?? {}) as Record<string, unknown>);
        tableIdsToRestore.add(doc.id);
      }

      const entrySnaps = new Map<string, DocumentSnapshot>();
      for (const target of okibakeTargets) {
        const entryRef = tournamentRef
          .collection('okibakeTemporaryEntries')
          .doc(target.okibakeEntryId);
        entrySnaps.set(target.okibakeEntryId, await transaction.get(entryRef));
      }

      for (const target of okibakeTargets) {
        const entrySnap = entrySnaps.get(target.okibakeEntryId);
        if (!entrySnap?.exists) {
          throw new HttpsError('not-found', `置きバケ一時参加者 ${target.okibakeEntryId} が見つかりません`);
        }
        validateOkibakeReseatUndoEntry(
          (entrySnap.data() ?? {}) as Record<string, unknown>,
          target.okibakeEntryAfter,
        );
      }

      let waitingCount = 0;
      for (const [tableId, tableData] of Object.entries(params.previousSeatingData)) {
        if (tableId === 'waiting') {
          waitingCount = Object.keys((tableData as { waiting?: Record<string, unknown> }).waiting || {}).length;
        }
      }

      const waitingData = params.previousSeatingData.waiting as { waiting?: Record<string, unknown> } | undefined;
      if (waitingData != null) {
        const waiting = waitingData.waiting || {};
        transaction.set(tablesSeatRef.doc('waiting'), {
          waiting,
          count: Object.keys(waiting).length,
          updatedAt: now,
        });
      }

      for (const tableId of tableIdsToRestore) {
        if (tableId === 'waiting' || tableId === 'busted') continue;

        const previousSeats =
          ((params.previousSeatingData[tableId] as { seats?: Record<string, unknown> } | undefined)?.seats ??
            {}) as Record<string, unknown>;
        const currentSeats = currentSeatsByTable.get(tableId) ?? {};

        const restoredSeats =
          okibakeTargets.length > 0
            ? buildRestoredSeatsForReseatUndo(
                previousSeats,
                currentSeats,
                okibakeTargets,
                tableId,
              )
            : previousSeats;

        transaction.set(
          tablesSeatRef.doc(tableId),
          {
            seats: restoredSeats,
            updatedAt: now,
          },
          { merge: true },
        );
      }

      for (const target of okibakeTargets) {
        const entryRef = tournamentRef
          .collection('okibakeTemporaryEntries')
          .doc(target.okibakeEntryId);
        const patch = buildOkibakeReseatUndoEntryPatch(
          target.okibakeEntryBefore,
          params.rollBackBy,
          now,
        );
        transaction.update(entryRef, patch as UpdateData<DocumentData>);
      }

      if (mainViewDoc.exists) {
        const viewsData = mainViewDoc.data() ?? {};
        const okibakeWaitingRestore = countOkibakeRegisteredRestoresOnUndo(okibakeTargets);

        if (okibakeTargets.length > 0 && okibakeWaitingRestore > 0) {
          const currentWaitingCount =
            typeof viewsData.waitingCount === 'number' && Number.isFinite(viewsData.waitingCount)
              ? viewsData.waitingCount
              : 0;
          transaction.update(mainViewRef, {
            waitingCount: currentWaitingCount + okibakeWaitingRestore,
            updatedAt: now,
          });
        } else if (okibakeTargets.length === 0) {
          transaction.update(mainViewRef, {
            waitingCount,
            updatedAt: now,
          });
        }
      }
    });

    logOpsSuccess({
      message: 'undoReseatAllPlayers 成功',
      functionEntry: 'undoReseatAllPlayers',
      context: {
        tournamentId: params.tournamentId,
        okibakeTargetCount: okibakeTargets.length,
      },
    });
  } catch (error) {
    logOpsError({
      message: 'Error undoing reseat all players operation:',
      functionEntry: 'undoReseatAllPlayers',
      cause: error,
      context: { tournamentId: params.tournamentId },
    });
    throw error;
  }
}
