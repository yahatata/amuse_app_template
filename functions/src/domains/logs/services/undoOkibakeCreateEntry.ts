import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { logOpsError, logOpsSuccess } from '../../../shared/logging/logOpsError';
import { appendAvgStackToMainViewUpdate } from '../../../shared/tournament/calculateAvgStack';

export interface UndoOkibakeCreateEntryParams {
  tournamentId: string;
  okibakeEntryId: string;
  rollBackByDeviceId: string;
}

export async function undoOkibakeCreateEntry(
  params: UndoOkibakeCreateEntryParams
): Promise<void> {
  const db = getFirestore();
  const now = Timestamp.now();
  const tournamentRef = db.collection('scheduledTournaments').doc(params.tournamentId);
  const entryRef = tournamentRef
    .collection('okibakeTemporaryEntries')
    .doc(params.okibakeEntryId);
  const viewsMainRef = tournamentRef.collection('views').doc('main');
  const tournamentSnap = await tournamentRef.get();
  const snapshot = tournamentSnap.data()?.snapshot ?? {};

  try {
    await db.runTransaction(async (tx) => {
      const [entrySnap, viewsMainSnap] = await Promise.all([
        tx.get(entryRef),
        tx.get(viewsMainRef),
      ]);
      if (!entrySnap.exists) {
        throw new HttpsError('not-found', '置きバケ一時参加者が見つかりません');
      }
      if (!viewsMainSnap.exists) {
        throw new HttpsError('failed-precondition', 'トーナメントの views/main が存在しません');
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

      if (entryStatus !== 'registered') {
        throw new HttpsError(
          'failed-precondition',
          '現在の置きバケ状態では登録取り消しできません'
        );
      }
      if (billLinkStatus !== 'unlinked') {
        throw new HttpsError(
          'failed-precondition',
          '現在の置きバケ状態では登録取り消しできません'
        );
      }
      if (linkedBillId != null) {
        throw new HttpsError(
          'failed-precondition',
          '伝票紐付け済みのため登録取り消しできません'
        );
      }
      if (okibakeAddonCount > 0) {
        throw new HttpsError(
          'failed-precondition',
          'Addon 済みの置きバケは登録取り消しできません'
        );
      }

      const viewsMainData = (viewsMainSnap.data() ?? {}) as Record<string, unknown>;
      const entries =
        typeof viewsMainData.entries === 'number' && Number.isFinite(viewsMainData.entries)
          ? viewsMainData.entries
          : 0;
      const playersIn =
        typeof viewsMainData.playersIn === 'number' &&
        Number.isFinite(viewsMainData.playersIn)
          ? viewsMainData.playersIn
          : 0;
      const waitingCount =
        typeof viewsMainData.waitingCount === 'number' &&
        Number.isFinite(viewsMainData.waitingCount)
          ? viewsMainData.waitingCount
          : 0;

      tx.update(entryRef, {
        entryStatus: 'voided',
        voidedAt: now,
        voidedByDeviceId: params.rollBackByDeviceId,
        updatedAt: now,
        updatedByDeviceId: params.rollBackByDeviceId,
      });
      tx.update(
        viewsMainRef,
        appendAvgStackToMainViewUpdate(
          {
            entries: Math.max(0, entries - 1),
            playersIn: Math.max(0, playersIn - 1),
            waitingCount: Math.max(0, waitingCount - 1),
            updatedAt: now,
          },
          viewsMainData,
          snapshot,
        ),
      );
    });

    logOpsSuccess({
      message: 'undoOkibakeCreateEntry 成功',
      functionEntry: 'undoOkibakeCreateEntry',
      context: {
        tournamentId: params.tournamentId,
        okibakeEntryId: params.okibakeEntryId,
      },
    });
  } catch (error) {
    logOpsError({
      message: 'undoOkibakeCreateEntry 失敗',
      functionEntry: 'undoOkibakeCreateEntry',
      cause: error,
      context: {
        tournamentId: params.tournamentId,
        okibakeEntryId: params.okibakeEntryId,
      },
    });
    throw error;
  }
}
