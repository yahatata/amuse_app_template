import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { logOpsError, logOpsSuccess } from '../../../shared/logging/logOpsError';

export interface UndoOkibakeUpdateLinkedUserParams {
  tournamentId: string;
  okibakeEntryId: string;
  afterLinkedUserId: string | null;
  afterLinkedUserPokerName: string | null;
  beforeLinkedUserId: string | null;
  beforeLinkedUserPokerName: string | null;
  seatBefore?: {
    tableId?: string;
    seatKey?: string;
    pokerName?: string | null;
  } | null;
}

function parseSeatSuffix(seatKey: string): string | null {
  const m = seatKey.match(/^seat(\d{1,2})$/);
  if (!m) return null;
  return m[1].padStart(2, '0');
}

export async function undoOkibakeUpdateLinkedUser(
  params: UndoOkibakeUpdateLinkedUserParams
): Promise<void> {
  const db = getFirestore();
  const now = Timestamp.now();
  const tournamentRef = db.collection('scheduledTournaments').doc(params.tournamentId);
  const entryRef = tournamentRef
    .collection('okibakeTemporaryEntries')
    .doc(params.okibakeEntryId);

  try {
    await db.runTransaction(async (tx) => {
      const entrySnap = await tx.get(entryRef);
      if (!entrySnap.exists) {
        throw new HttpsError('not-found', '置きバケ一時参加者が見つかりません');
      }

      const entryData = (entrySnap.data() ?? {}) as Record<string, unknown>;
      const billLinkStatus =
        typeof entryData.billLinkStatus === 'string' ? entryData.billLinkStatus : '';
      if (billLinkStatus !== 'unlinked') {
        throw new HttpsError(
          'failed-precondition',
          'この状態の置きバケ対象ユーザー設定は取り消しできません'
        );
      }

      const currentLinkedUserId =
        typeof entryData.linkedUserId === 'string' && entryData.linkedUserId.trim().length > 0
          ? entryData.linkedUserId.trim()
          : null;
      const currentLinkedUserPokerName =
        typeof entryData.linkedUserPokerName === 'string' &&
        entryData.linkedUserPokerName.trim().length > 0
          ? entryData.linkedUserPokerName.trim()
          : null;

      if (
        currentLinkedUserId !== params.afterLinkedUserId ||
        currentLinkedUserPokerName !== params.afterLinkedUserPokerName
      ) {
        throw new HttpsError(
          'failed-precondition',
          '現在の対象ユーザー状態が操作履歴と一致しないため取り消しできません'
        );
      }

      tx.update(entryRef, {
        linkedUserId: params.beforeLinkedUserId,
        linkedUserPokerName: params.beforeLinkedUserPokerName,
        updatedAt: now,
      });

      const seatBefore = params.seatBefore;
      const seatKey =
        typeof seatBefore?.seatKey === 'string' ? seatBefore.seatKey : null;
      const tableId =
        typeof seatBefore?.tableId === 'string' ? seatBefore.tableId : null;
      if (seatKey != null && tableId != null) {
        const suffix = parseSeatSuffix(seatKey);
        if (suffix == null) {
          throw new HttpsError('failed-precondition', '席情報が不正です');
        }
        const tableRef = tournamentRef.collection('tablesSeat').doc(tableId);
        const tableSnap = await tx.get(tableRef);
        if (!tableSnap.exists) {
          throw new HttpsError('failed-precondition', '席テーブルが存在しません');
        }
        const tableData = (tableSnap.data() ?? {}) as Record<string, unknown>;
        const seats =
          typeof tableData.seats === 'object' && tableData.seats != null
            ? { ...(tableData.seats as Record<string, unknown>) }
            : {};
        seats[`seat${suffix}PokerName`] = seatBefore?.pokerName ?? null;
        tx.update(tableRef, { seats, updatedAt: now });
      }
    });

    logOpsSuccess({
      message: 'undoOkibakeUpdateLinkedUser 成功',
      functionEntry: 'undoOkibakeUpdateLinkedUser',
      context: {
        tournamentId: params.tournamentId,
        okibakeEntryId: params.okibakeEntryId,
      },
    });
  } catch (error) {
    logOpsError({
      message: 'undoOkibakeUpdateLinkedUser 失敗',
      functionEntry: 'undoOkibakeUpdateLinkedUser',
      cause: error,
      context: {
        tournamentId: params.tournamentId,
        okibakeEntryId: params.okibakeEntryId,
      },
    });
    throw error;
  }
}

