import { getFirestore, Timestamp, type UpdateData, type DocumentData } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { logOpsError, logOpsSuccess } from '../../../shared/logging/logOpsError';

type AssignSeatLogPayload = Record<string, unknown>;

function parseSeatSuffix(seatKey: string): string | null {
  const m = seatKey.match(/^seat(\d{1,2})$/);
  if (!m) return null;
  return m[1].padStart(2, '0');
}

export interface UndoOkibakeAssignSeatParams {
  tournamentId: string;
  okibakeEntryId: string;
  payload: AssignSeatLogPayload;
}

export async function undoOkibakeAssignSeat(
  params: UndoOkibakeAssignSeatParams
): Promise<void> {
  const db = getFirestore();
  const now = Timestamp.now();
  const tournamentRef = db.collection('scheduledTournaments').doc(params.tournamentId);
  const entryRef = tournamentRef
    .collection('okibakeTemporaryEntries')
    .doc(params.okibakeEntryId);
  const viewsMainRef = tournamentRef.collection('views').doc('main');

  try {
    await db.runTransaction(async (tx) => {
      const tableId =
        typeof params.payload.tableId === 'string' ? params.payload.tableId : null;
      const seatKey =
        typeof params.payload.seatKey === 'string' ? params.payload.seatKey : null;
      const seatBefore =
        typeof params.payload.seatBefore === 'object' && params.payload.seatBefore != null
          ? (params.payload.seatBefore as Record<string, unknown>)
          : null;
      const entryBefore =
        typeof params.payload.okibakeEntryBefore === 'object' &&
        params.payload.okibakeEntryBefore != null
          ? (params.payload.okibakeEntryBefore as Record<string, unknown>)
          : null;

      if (!tableId || !seatKey || seatBefore == null || entryBefore == null) {
        throw new HttpsError('failed-precondition', '操作履歴の復元情報が不足しています');
      }

      const seatSuffix = parseSeatSuffix(seatKey);
      if (seatSuffix == null) {
        throw new HttpsError('failed-precondition', '操作履歴の seatKey が不正です');
      }

      const tableRef = tournamentRef.collection('tablesSeat').doc(tableId);

      const [entrySnap, viewsMainSnap, tableSnap] = await Promise.all([
        tx.get(entryRef),
        tx.get(viewsMainRef),
        tx.get(tableRef),
      ]);
      if (!entrySnap.exists) {
        throw new HttpsError('not-found', '置きバケ一時参加者が見つかりません');
      }
      if (!viewsMainSnap.exists) {
        throw new HttpsError('failed-precondition', 'トーナメントの views/main が存在しません');
      }
      if (!tableSnap.exists) {
        throw new HttpsError('failed-precondition', '席テーブルが存在しません');
      }

      const entryData = (entrySnap.data() ?? {}) as Record<string, unknown>;
      const entryStatus =
        typeof entryData.entryStatus === 'string' ? entryData.entryStatus : '';
      const billLinkStatus =
        typeof entryData.billLinkStatus === 'string' ? entryData.billLinkStatus : '';
      const linkedBillId =
        typeof entryData.linkedBillId === 'string' ? entryData.linkedBillId : null;
      const okibakeAddonCountRaw =
        typeof entryData.okibakeAddonCount === 'number'
          ? entryData.okibakeAddonCount
          : 0;
      const okibakeAddonCount = Number.isFinite(okibakeAddonCountRaw)
        ? okibakeAddonCountRaw
        : 0;

      if (entryStatus !== 'seated') {
        throw new HttpsError('failed-precondition', '現在の置きバケ状態では着席取り消しできません');
      }
      if (billLinkStatus !== 'unlinked') {
        throw new HttpsError('failed-precondition', '現在の置きバケ状態では着席取り消しできません');
      }
      if (linkedBillId != null) {
        throw new HttpsError('failed-precondition', '伝票紐付け済みのため着席取り消しできません');
      }
      if (okibakeAddonCount > 0) {
        throw new HttpsError('failed-precondition', 'Addon 済みの置きバケは着席取り消しできません');
      }

      const tableData = (tableSnap.data() ?? {}) as Record<string, unknown>;
      const seats =
        typeof tableData.seats === 'object' && tableData.seats != null
          ? { ...(tableData.seats as Record<string, unknown>) }
          : {};
      seats[`seat${seatSuffix}UserId`] = seatBefore.userId ?? null;
      seats[`seat${seatSuffix}PokerName`] = seatBefore.pokerName ?? null;
      seats[`seat${seatSuffix}OkibakeEntryId`] = seatBefore.okibakeEntryId ?? null;

      const entryPatch: Record<string, unknown> = {
        entryStatus:
          typeof entryBefore.entryStatus === 'string' ? entryBefore.entryStatus : 'registered',
        billLinkStatus:
          typeof entryBefore.billLinkStatus === 'string' ? entryBefore.billLinkStatus : 'unlinked',
        assignedTableId:
          typeof entryBefore.assignedTableId === 'string' ? entryBefore.assignedTableId : null,
        assignedSeatKey:
          typeof entryBefore.assignedSeatKey === 'string' ? entryBefore.assignedSeatKey : null,
        updatedAt: now,
      };
      if (Object.prototype.hasOwnProperty.call(entryBefore, 'seatedAt')) {
        entryPatch.seatedAt = entryBefore.seatedAt ?? null;
      } else {
        entryPatch.seatedAt = null;
      }

      const viewsMainData = (viewsMainSnap.data() ?? {}) as Record<string, unknown>;
      const waitingCount =
        typeof viewsMainData.waitingCount === 'number' &&
        Number.isFinite(viewsMainData.waitingCount)
          ? viewsMainData.waitingCount
          : 0;

      tx.update(tableRef, {
        seats,
        updatedAt: now,
      });
      tx.update(entryRef, entryPatch as UpdateData<DocumentData>);
      tx.update(viewsMainRef, {
        waitingCount: waitingCount + 1,
        updatedAt: now,
      });
    });

    logOpsSuccess({
      message: 'undoOkibakeAssignSeat 成功',
      functionEntry: 'undoOkibakeAssignSeat',
      context: {
        tournamentId: params.tournamentId,
        okibakeEntryId: params.okibakeEntryId,
      },
    });
  } catch (error) {
    logOpsError({
      message: 'undoOkibakeAssignSeat 失敗',
      functionEntry: 'undoOkibakeAssignSeat',
      cause: error,
      context: {
        tournamentId: params.tournamentId,
        okibakeEntryId: params.okibakeEntryId,
      },
    });
    throw error;
  }
}
