import { getFirestore, Timestamp, type UpdateData, type DocumentData } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { logOpsError, logOpsSuccess } from '../../../shared/logging/logOpsError';

const ALLOWED_BILL_STATUSES = new Set(['open', 'in_progress']);

type LinkLogPayload = Record<string, unknown>;

function parseSeatSuffix(seatKey: string): string | null {
  const m = seatKey.match(/^seat(\d{1,2})$/);
  if (!m) return null;
  return m[1].padStart(2, '0');
}

export interface UndoOkibakeLinkToBillParams {
  tournamentId: string;
  okibakeEntryId: string;
  payload: LinkLogPayload;
}

export async function undoOkibakeLinkToBill(
  params: UndoOkibakeLinkToBillParams
): Promise<void> {
  const db = getFirestore();
  const now = Timestamp.now();
  const tournamentRef = db.collection('scheduledTournaments').doc(params.tournamentId);
  const entryRef = tournamentRef
    .collection('okibakeTemporaryEntries')
    .doc(params.okibakeEntryId);

  const payload = params.payload;
  const billId = typeof payload.billId === 'string' ? payload.billId : null;
  const templateId = typeof payload.templateId === 'string' ? payload.templateId : null;
  if (!billId || !templateId) {
    throw new HttpsError('failed-precondition', '操作履歴に billId/templateId がありません');
  }

  const billRef = db.collection('bills').doc(billId);
  const billTournamentRef = billRef.collection('tournaments').doc(templateId);

  try {
    await db.runTransaction(async (tx) => {
      const [entrySnap, billSnap] = await Promise.all([tx.get(entryRef), tx.get(billRef)]);
      if (!entrySnap.exists) {
        throw new HttpsError('not-found', '置きバケ一時参加者が見つかりません');
      }
      if (!billSnap.exists) {
        throw new HttpsError('not-found', '紐付け先伝票が見つかりません');
      }

      const entryData = (entrySnap.data() ?? {}) as Record<string, unknown>;
      const billData = (billSnap.data() ?? {}) as Record<string, unknown>;

      const billStatus = typeof billData.status === 'string' ? billData.status : '';
      if (!ALLOWED_BILL_STATUSES.has(billStatus)) {
        throw new HttpsError(
          'failed-precondition',
          '会計後の伝票紐付けは取り消しできません。返金・事後調整で対応してください'
        );
      }

      const currentBillLinkStatus =
        typeof entryData.billLinkStatus === 'string' ? entryData.billLinkStatus : '';
      if (currentBillLinkStatus !== 'linked') {
        throw new HttpsError(
          'failed-precondition',
          '現在の置きバケ状態では伝票紐付け取り消しできません'
        );
      }
      const currentLinkedBillId =
        typeof entryData.linkedBillId === 'string' ? entryData.linkedBillId : null;
      if (currentLinkedBillId !== billId) {
        throw new HttpsError(
          'failed-precondition',
          '現在の紐付け先が操作履歴と一致しないため取り消しできません'
        );
      }

      const okibakeEntryAfter =
        typeof payload.okibakeEntryAfter === 'object' && payload.okibakeEntryAfter != null
          ? (payload.okibakeEntryAfter as Record<string, unknown>)
          : null;
      if (okibakeEntryAfter != null) {
        const afterBillLinkStatus =
          typeof okibakeEntryAfter.billLinkStatus === 'string'
            ? okibakeEntryAfter.billLinkStatus
            : null;
        const afterLinkedBillId =
          typeof okibakeEntryAfter.linkedBillId === 'string'
            ? okibakeEntryAfter.linkedBillId
            : null;
        if (afterBillLinkStatus != null && afterBillLinkStatus !== currentBillLinkStatus) {
          throw new HttpsError(
            'failed-precondition',
            '現在の置きバケ状態が操作履歴と一致しないため取り消しできません'
          );
        }
        if (afterLinkedBillId != null && afterLinkedBillId !== currentLinkedBillId) {
          throw new HttpsError(
            'failed-precondition',
            '現在の置きバケ紐付け先が操作履歴と一致しないため取り消しできません'
          );
        }
      }

      const before =
        typeof payload.before === 'object' && payload.before != null
          ? (payload.before as Record<string, unknown>)
          : {};
      const okibakeEntryBefore =
        typeof payload.okibakeEntryBefore === 'object' && payload.okibakeEntryBefore != null
          ? (payload.okibakeEntryBefore as Record<string, unknown>)
          : {};
      const sourceEntryStatus =
        typeof payload.sourceEntryStatus === 'string'
          ? payload.sourceEntryStatus
          : (typeof okibakeEntryBefore.entryStatus === 'string'
              ? okibakeEntryBefore.entryStatus
              : (typeof entryData.entryStatus === 'string'
                  ? entryData.entryStatus
                  : null));
      if (sourceEntryStatus == null) {
        throw new HttpsError(
          'failed-precondition',
          '操作履歴に sourceEntryStatus がなく、伝票紐付け取り消しできません'
        );
      }

      const beforeBillLinkStatus =
        typeof before.billLinkStatus === 'string'
          ? before.billLinkStatus
          : (typeof okibakeEntryBefore.billLinkStatus === 'string'
              ? okibakeEntryBefore.billLinkStatus
              : 'unlinked');
      const beforeLinkedBillId =
        before.linkedBillId === null
          ? null
          : (typeof before.linkedBillId === 'string'
              ? before.linkedBillId
              : (typeof okibakeEntryBefore.linkedBillId === 'string'
                  ? okibakeEntryBefore.linkedBillId
                  : null));
      const beforeLinkedUserId =
        before.linkedUserId === null
          ? null
          : (typeof before.linkedUserId === 'string'
              ? before.linkedUserId
              : (typeof okibakeEntryBefore.linkedUserId === 'string'
                  ? okibakeEntryBefore.linkedUserId
                  : null));
      const beforeLinkedUserPokerName =
        before.linkedUserPokerName === null
          ? null
          : (typeof before.linkedUserPokerName === 'string'
              ? before.linkedUserPokerName
              : (typeof okibakeEntryBefore.linkedUserPokerName === 'string'
                  ? okibakeEntryBefore.linkedUserPokerName
                  : null));

      const patch: Record<string, unknown> = {
        billLinkStatus: beforeBillLinkStatus,
        linkedBillId: beforeLinkedBillId,
        linkedUserId: beforeLinkedUserId,
        linkedUserPokerName: beforeLinkedUserPokerName,
        updatedAt: now,
      };

      const reflectedAddonRecordIds = Array.isArray(payload.reflectedAddonRecordIds)
        ? payload.reflectedAddonRecordIds.filter((id): id is string => typeof id === 'string')
        : [];
      if (reflectedAddonRecordIds.length > 0 && Array.isArray(entryData.okibakeAddonRecords)) {
        const idSet = new Set(reflectedAddonRecordIds);
        const nextRecords = (entryData.okibakeAddonRecords as Array<Record<string, unknown>>).map((r) => {
          const id = typeof r.addonRecordId === 'string' ? r.addonRecordId : null;
          if (!id || !idSet.has(id)) return r;
          return {
            ...r,
            reflectedToBill: false,
            reflectedToBillAt: null,
            linkedBillId: null,
          };
        });
        patch.okibakeAddonRecords = nextRecords;
      }

      if (beforeBillLinkStatus === 'pending_review') {
        if (okibakeEntryBefore.pendingReviewAt != null) {
          patch.pendingReviewAt = okibakeEntryBefore.pendingReviewAt;
        } else if (entryData.pendingReviewAt != null) {
          patch.pendingReviewAt = entryData.pendingReviewAt;
        }
        if (okibakeEntryBefore.pendingReviewReason != null) {
          patch.pendingReviewReason = okibakeEntryBefore.pendingReviewReason;
        } else if (entryData.pendingReviewReason != null) {
          patch.pendingReviewReason = entryData.pendingReviewReason;
        }
      }

      const billTournamentBefore =
        typeof payload.billTournamentBefore === 'object' && payload.billTournamentBefore != null
          ? (payload.billTournamentBefore as Record<string, unknown>)
          : null;

      const linkedUserId =
        typeof payload.userId === 'string'
          ? payload.userId
          : (typeof payload.linkedUserId === 'string' ? payload.linkedUserId : null);

      const usersListBefore =
        typeof payload.usersListBefore === 'object' && payload.usersListBefore != null
          ? (payload.usersListBefore as Record<string, unknown>)
          : null;
      const waitingBefore =
        typeof payload.waitingBefore === 'object' && payload.waitingBefore != null
          ? (payload.waitingBefore as Record<string, unknown>)
          : null;
      const seatBefore =
        typeof payload.seatBefore === 'object' && payload.seatBefore != null
          ? (payload.seatBefore as Record<string, unknown>)
          : null;
      if (usersListBefore == null) {
        throw new HttpsError(
          'failed-precondition',
          '操作履歴に usersListBefore がなく、伝票紐付け取り消しできません'
        );
      }
      if (sourceEntryStatus === 'registered' && waitingBefore == null) {
        throw new HttpsError(
          'failed-precondition',
          '操作履歴に waitingBefore がなく、伝票紐付け取り消しできません'
        );
      }
      if (sourceEntryStatus === 'seated' && seatBefore == null) {
        throw new HttpsError(
          'failed-precondition',
          '操作履歴に seatBefore がなく、伝票紐付け取り消しできません'
        );
      }

      const usersListRef = tournamentRef.collection('views').doc('usersList');
      const waitingRef = tournamentRef.collection('tablesSeat').doc('waiting');
      const tableId = typeof payload.tableId === 'string' ? payload.tableId : null;
      const assignedSeatKey =
        typeof okibakeEntryBefore.assignedSeatKey === 'string'
          ? okibakeEntryBefore.assignedSeatKey
          : null;
      const tableRef =
        tableId != null && assignedSeatKey != null
          ? tournamentRef.collection('tablesSeat').doc(tableId)
          : null;
      if (sourceEntryStatus === 'seated' && tableRef == null) {
        throw new HttpsError(
          'failed-precondition',
          '操作履歴に seated 復元情報が不足しているため取り消しできません'
        );
      }

      const usersListSnap = linkedUserId != null ? await tx.get(usersListRef) : null;
      const waitingSnap =
        linkedUserId != null && sourceEntryStatus === 'registered' ? await tx.get(waitingRef) : null;
      const tableSnap = tableRef != null ? await tx.get(tableRef) : null;
      if (linkedUserId != null) {
        const usersListData = (usersListSnap?.data() ?? {}) as Record<string, unknown>;
        const users =
          typeof usersListData.users === 'object' && usersListData.users != null
            ? { ...(usersListData.users as Record<string, unknown>) }
            : {};
        const beforeUserEntry =
          Object.prototype.hasOwnProperty.call(usersListBefore, 'userEntry')
            ? (usersListBefore.userEntry as unknown)
            : undefined;
        if (beforeUserEntry === undefined) {
          throw new HttpsError(
            'failed-precondition',
            '操作履歴の usersListBefore.userEntry が不足しているため取り消しできません'
          );
        }
        if (beforeUserEntry == null) {
          delete users[linkedUserId];
        } else {
          users[linkedUserId] = beforeUserEntry;
        }
        tx.set(usersListRef, { users, updatedAt: now }, { merge: true });
      }

      if (linkedUserId != null && sourceEntryStatus === 'registered') {
        const waitingData = (waitingSnap?.data() ?? {}) as Record<string, unknown>;
        const waiting =
          typeof waitingData.waiting === 'object' && waitingData.waiting != null
            ? { ...(waitingData.waiting as Record<string, unknown>) }
            : {};
        const beforeUserEntry =
          waitingBefore != null && Object.prototype.hasOwnProperty.call(waitingBefore, 'userEntry')
            ? (waitingBefore.userEntry as unknown)
            : undefined;
        if (beforeUserEntry === undefined) {
          throw new HttpsError(
            'failed-precondition',
            '操作履歴の waitingBefore.userEntry が不足しているため取り消しできません'
          );
        }
        if (beforeUserEntry == null) {
          delete waiting[linkedUserId];
        } else {
          waiting[linkedUserId] = beforeUserEntry;
        }
        const countFromBefore =
          waitingBefore != null && typeof waitingBefore.count === 'number' ? waitingBefore.count : null;
        tx.set(
          waitingRef,
          {
            waiting,
            count: countFromBefore ?? Object.keys(waiting).length,
            updatedAt: now,
          },
          { merge: true }
        );
      }

      if (seatBefore != null) {
        if (tableId != null && assignedSeatKey != null) {
          const suffix = parseSeatSuffix(assignedSeatKey);
          if (suffix == null) {
            throw new HttpsError('failed-precondition', '席情報が不正です');
          }
          if (!tableRef || !tableSnap?.exists) {
            throw new HttpsError('failed-precondition', '席テーブルが存在しません');
          }
          const tableData = (tableSnap.data() ?? {}) as Record<string, unknown>;
          const seats =
            typeof tableData.seats === 'object' && tableData.seats != null
              ? { ...(tableData.seats as Record<string, unknown>) }
              : {};
          seats[`seat${suffix}UserId`] = seatBefore.userId ?? null;
          seats[`seat${suffix}PokerName`] = seatBefore.pokerName ?? null;
          seats[`seat${suffix}OkibakeEntryId`] = seatBefore.okibakeEntryId ?? null;
          tx.update(tableRef, { seats, updatedAt: now });
        }
      }

      tx.update(entryRef, patch as UpdateData<DocumentData>);
      if (billTournamentBefore == null) {
        tx.delete(billTournamentRef);
      } else {
        tx.set(billTournamentRef, billTournamentBefore, { merge: false });
      }
      tx.update(billRef, { updatedAt: now });
    });

    logOpsSuccess({
      message: 'undoOkibakeLinkToBill 成功',
      functionEntry: 'undoOkibakeLinkToBill',
      context: {
        tournamentId: params.tournamentId,
        okibakeEntryId: params.okibakeEntryId,
        billId,
      },
    });
  } catch (error) {
    logOpsError({
      message: 'undoOkibakeLinkToBill 失敗',
      functionEntry: 'undoOkibakeLinkToBill',
      cause: error,
      context: {
        tournamentId: params.tournamentId,
        okibakeEntryId: params.okibakeEntryId,
        billId,
      },
    });
    throw error;
  }
}
