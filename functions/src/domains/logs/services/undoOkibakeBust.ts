import { getFirestore, Timestamp, type UpdateData, type DocumentData } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { logOpsError, logOpsSuccess } from '../../../shared/logging/logOpsError';
import { appendAvgStackToMainViewUpdate } from '../../../shared/tournament/calculateAvgStack';
import {
  type FallbackSeatInput,
  resolveBustUndoRestorePlan,
  seatSlotMatches,
  parseSeatSuffix,
} from '../lib/bustUndoSeat';

type BustLogPayload = Record<string, unknown>;

function entryFieldMatches(
  entryData: Record<string, unknown>,
  field: string,
  expected: unknown
): boolean {
  const actual = Object.prototype.hasOwnProperty.call(entryData, field)
    ? entryData[field]
    : null;
  return actual === expected || (actual == null && expected == null);
}

export interface UndoOkibakeBustParams {
  tournamentId: string;
  okibakeEntryId: string;
  payload: BustLogPayload;
  operationLogId: string;
  fallbackSeat?: FallbackSeatInput;
}

export async function undoOkibakeBust(params: UndoOkibakeBustParams): Promise<void> {
  const db = getFirestore();
  const now = Timestamp.now();
  const tournamentRef = db.collection('scheduledTournaments').doc(params.tournamentId);
  const entryRef = tournamentRef
    .collection('okibakeTemporaryEntries')
    .doc(params.okibakeEntryId);
  const viewsMainRef = tournamentRef.collection('views').doc('main');
  const tournamentSnap = await tournamentRef.get();
  const snapshot = tournamentSnap.data()?.snapshot ?? {};

  const tableId =
    typeof params.payload.tableId === 'string' ? params.payload.tableId : null;
  const seatKey =
    typeof params.payload.seatKey === 'string' ? params.payload.seatKey : null;
  const seatBefore =
    typeof params.payload.seatBefore === 'object' && params.payload.seatBefore != null
      ? (params.payload.seatBefore as Record<string, unknown>)
      : null;
  const seatAfter =
    typeof params.payload.seatAfter === 'object' && params.payload.seatAfter != null
      ? (params.payload.seatAfter as Record<string, unknown>)
      : null;
  const entryBefore =
    typeof params.payload.okibakeEntryBefore === 'object' &&
    params.payload.okibakeEntryBefore != null
      ? (params.payload.okibakeEntryBefore as Record<string, unknown>)
      : null;
  const entryAfter =
    typeof params.payload.okibakeEntryAfter === 'object' &&
    params.payload.okibakeEntryAfter != null
      ? (params.payload.okibakeEntryAfter as Record<string, unknown>)
      : null;

  if (!tableId || !seatKey || seatBefore == null || seatAfter == null) {
    throw new HttpsError('failed-precondition', '操作履歴の復元情報が不足しています');
  }
  if (entryBefore == null || entryAfter == null) {
    throw new HttpsError('failed-precondition', '操作履歴の置きバケ復元情報が不足しています');
  }

  const seatSuffix = parseSeatSuffix(seatKey);
  if (seatSuffix == null) {
    throw new HttpsError('failed-precondition', '操作履歴の seatKey が不正です');
  }

  try {
    const entrySnap = await entryRef.get();
    if (!entrySnap.exists) {
      throw new HttpsError('not-found', '置きバケ一時参加者が見つかりません');
    }

    const entryData = (entrySnap.data() ?? {}) as Record<string, unknown>;
    validateOkibakeBustUndoEntry(entryData, entryAfter);

    const originalTableSnap = await tournamentRef.collection('tablesSeat').doc(tableId).get();
    if (!originalTableSnap.exists) {
      throw new HttpsError('failed-precondition', '席テーブルが存在しません');
    }
    const originalSeats =
      typeof originalTableSnap.data()?.seats === 'object' &&
      originalTableSnap.data()?.seats != null
        ? (originalTableSnap.data()!.seats as Record<string, unknown>)
        : {};
    const originalSeatEmpty = seatSlotMatches(originalSeats, seatSuffix, seatAfter);

    const restorePlan = await resolveBustUndoRestorePlan({
      db,
      tournamentId: params.tournamentId,
      operationLogId: params.operationLogId,
      participantType: 'okibake',
      originalTableId: tableId,
      originalSeatKey: seatKey,
      originalSeatEmpty,
      fallbackSeat: params.fallbackSeat,
    });

    await db.runTransaction(async (tx) => {
      const restoreTableRef = tournamentRef.collection('tablesSeat').doc(restorePlan.tableId);

      const [entryTxSnap, viewsMainSnap, restoreTableSnap] = await Promise.all([
        tx.get(entryRef),
        tx.get(viewsMainRef),
        tx.get(restoreTableRef),
      ]);

      if (!entryTxSnap.exists) {
        throw new HttpsError('not-found', '置きバケ一時参加者が見つかりません');
      }
      if (!viewsMainSnap.exists) {
        throw new HttpsError('failed-precondition', 'トーナメントの views/main が存在しません');
      }
      if (!restoreTableSnap.exists) {
        throw new HttpsError('failed-precondition', '戻し先テーブルが存在しません');
      }

      const entryTxData = (entryTxSnap.data() ?? {}) as Record<string, unknown>;
      validateOkibakeBustUndoEntry(entryTxData, entryAfter);

      if (!restorePlan.usedFallback) {
        const originalTableRef = tournamentRef.collection('tablesSeat').doc(tableId);
        const originalTableTxSnap = await tx.get(originalTableRef);
        if (!originalTableTxSnap.exists) {
          throw new HttpsError('failed-precondition', '席テーブルが存在しません');
        }
        const seats =
          typeof originalTableTxSnap.data()?.seats === 'object' &&
          originalTableTxSnap.data()?.seats != null
            ? (originalTableTxSnap.data()!.seats as Record<string, unknown>)
            : {};
        if (!seatSlotMatches(seats, seatSuffix, seatAfter)) {
          throw new HttpsError(
            'failed-precondition',
            '元席の状態が変わったため Bust 取り消しできません。再度お試しください。'
          );
        }
      }

      const restoreTableData = (restoreTableSnap.data() ?? {}) as Record<string, unknown>;
      const restoreSeats =
        typeof restoreTableData.seats === 'object' && restoreTableData.seats != null
          ? { ...(restoreTableData.seats as Record<string, unknown>) }
          : {};

      restoreSeats[`seat${restorePlan.seatSuffix}UserId`] = seatBefore.userId ?? null;
      restoreSeats[`seat${restorePlan.seatSuffix}PokerName`] = seatBefore.pokerName ?? null;
      restoreSeats[`seat${restorePlan.seatSuffix}OkibakeEntryId`] =
        seatBefore.okibakeEntryId ?? null;

      const entryPatch: Record<string, unknown> = {
        entryStatus:
          typeof entryBefore.entryStatus === 'string' ? entryBefore.entryStatus : 'seated',
        billLinkStatus:
          typeof entryBefore.billLinkStatus === 'string' ? entryBefore.billLinkStatus : 'unlinked',
        assignedTableId: restorePlan.usedFallback
          ? restorePlan.tableId
          : typeof entryBefore.assignedTableId === 'string'
            ? entryBefore.assignedTableId
            : null,
        assignedSeatKey: restorePlan.usedFallback
          ? restorePlan.seatKey
          : typeof entryBefore.assignedSeatKey === 'string'
            ? entryBefore.assignedSeatKey
            : null,
        bustedAt: null,
        bustedTableId: null,
        bustedSeatKey: null,
        updatedAt: now,
      };

      const viewsMainData = (viewsMainSnap.data() ?? {}) as Record<string, unknown>;
      const currentPlayersBusted =
        typeof viewsMainData.playersBusted === 'number' &&
        Number.isFinite(viewsMainData.playersBusted)
          ? viewsMainData.playersBusted
          : 0;

      tx.update(restoreTableRef, {
        seats: restoreSeats,
        updatedAt: now,
      });
      tx.update(entryRef, entryPatch as UpdateData<DocumentData>);
      tx.update(
        viewsMainRef,
        appendAvgStackToMainViewUpdate(
          {
            playersBusted: Math.max(0, currentPlayersBusted - 1),
            updatedAt: now,
          },
          viewsMainData,
          snapshot,
        ),
      );
    });

    logOpsSuccess({
      message: 'undoOkibakeBust 成功',
      functionEntry: 'undoOkibakeBust',
      context: {
        tournamentId: params.tournamentId,
        okibakeEntryId: params.okibakeEntryId,
        usedFallback: restorePlan.usedFallback,
      },
    });
  } catch (error) {
    logOpsError({
      message: 'undoOkibakeBust 失敗',
      functionEntry: 'undoOkibakeBust',
      cause: error,
      context: {
        tournamentId: params.tournamentId,
        okibakeEntryId: params.okibakeEntryId,
      },
    });
    throw error;
  }
}

function validateOkibakeBustUndoEntry(
  entryData: Record<string, unknown>,
  entryAfter: Record<string, unknown>
): void {
  const entryStatus =
    typeof entryData.entryStatus === 'string' ? entryData.entryStatus : '';
  const billLinkStatus =
    typeof entryData.billLinkStatus === 'string' ? entryData.billLinkStatus : '';
  const linkedBillId =
    typeof entryData.linkedBillId === 'string' && entryData.linkedBillId.trim().length > 0
      ? entryData.linkedBillId.trim()
      : null;

  if (entryStatus !== 'busted') {
    throw new HttpsError('failed-precondition', '現在の置きバケ状態では Bust 取り消しできません');
  }
  if (billLinkStatus !== 'unlinked') {
    throw new HttpsError('failed-precondition', '現在の置きバケ状態では Bust 取り消しできません');
  }
  if (linkedBillId != null) {
    throw new HttpsError('failed-precondition', '伝票紐付け済みのため Bust 取り消しできません');
  }

  const expectedEntryStatus =
    typeof entryAfter.entryStatus === 'string' ? entryAfter.entryStatus : 'busted';
  const expectedBillLinkStatus =
    typeof entryAfter.billLinkStatus === 'string' ? entryAfter.billLinkStatus : 'unlinked';

  if (entryStatus !== expectedEntryStatus || billLinkStatus !== expectedBillLinkStatus) {
    throw new HttpsError(
      'failed-precondition',
      '操作履歴の after 状態と現在の置きバケ状態が一致しません'
    );
  }
  if (
    !entryFieldMatches(entryData, 'assignedTableId', entryAfter.assignedTableId ?? null) ||
    !entryFieldMatches(entryData, 'assignedSeatKey', entryAfter.assignedSeatKey ?? null)
  ) {
    throw new HttpsError(
      'failed-precondition',
      '操作履歴の after 状態と現在の置きバケ状態が一致しません'
    );
  }
}
