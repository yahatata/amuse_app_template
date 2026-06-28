import {
  getFirestore,
  Timestamp,
  type DocumentData,
  type UpdateData,
} from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { logOpsError, logOpsSuccess } from '../../../shared/logging/logOpsError';
import { appendAvgStackToMainViewUpdate } from '../../../shared/tournament/calculateAvgStack';

export interface UndoOkibakeAddonParams {
  tournamentId: string;
  okibakeEntryId: string;
  addonRecordId: string;
  rollBackBy: string;
  operationLogId: string;
}

type OkibakeAddonRecord = Record<string, unknown>;

function isActiveOkibakeAddonRecord(record: OkibakeAddonRecord): boolean {
  return record.rolledBack !== true;
}

export function recalculateOkibakeAddonFieldsFromRecords(records: OkibakeAddonRecord[]): {
  okibakeAddonCount: number;
  lastOkibakeAddonAt: Timestamp | null;
} {
  const activeRecords = records.filter(isActiveOkibakeAddonRecord);
  let lastOkibakeAddonAt: Timestamp | null = null;

  for (const record of activeRecords) {
    const occurredAt = record.occurredAt;
    if (!(occurredAt instanceof Timestamp)) {
      continue;
    }
    if (
      lastOkibakeAddonAt == null ||
      occurredAt.toMillis() > lastOkibakeAddonAt.toMillis()
    ) {
      lastOkibakeAddonAt = occurredAt;
    }
  }

  return {
    okibakeAddonCount: activeRecords.length,
    lastOkibakeAddonAt,
  };
}

/**
 * 置きバケ単体 Addon（applyOkibakeAddon）を巻き戻す（詳細仕様書 §18.6）。
 */
export async function undoOkibakeAddon(params: UndoOkibakeAddonParams): Promise<void> {
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
      const rawRecords = entryData.okibakeAddonRecords;
      if (!Array.isArray(rawRecords)) {
        throw new HttpsError(
          'failed-precondition',
          '置きバケ Addon 記録が見つかりません',
        );
      }

      const records = rawRecords.map((r) =>
        typeof r === 'object' && r != null ? ({ ...r } as OkibakeAddonRecord) : {},
      );

      const targetIndex = records.findIndex(
        (r) => r.addonRecordId === params.addonRecordId,
      );
      if (targetIndex < 0) {
        throw new HttpsError(
          'failed-precondition',
          '対象の Addon 記録が見つかりません',
        );
      }

      const target = records[targetIndex];
      if (target.rolledBack === true) {
        throw new HttpsError('failed-precondition', 'この Addon は既に取り消し済みです');
      }

      const recordOperationId =
        typeof target.operationId === 'string' ? target.operationId : null;
      if (recordOperationId != null && recordOperationId !== params.operationLogId) {
        throw new HttpsError(
          'failed-precondition',
          '操作記録と Addon 記録の operationId が一致しません',
        );
      }

      if (target.reflectedToBill === true) {
        throw new HttpsError(
          'failed-precondition',
          '伝票反映済みの Addon は単体では取り消せません',
        );
      }

      records[targetIndex] = {
        ...target,
        rolledBack: true,
        rollBackAt: now,
        rollBackBy: params.rollBackBy,
      };

      const { okibakeAddonCount, lastOkibakeAddonAt } =
        recalculateOkibakeAddonFieldsFromRecords(records);

      const viewsMainData = (viewsMainSnap.data() ?? {}) as Record<string, unknown>;
      const currentAddons =
        typeof viewsMainData.addons === 'number' && Number.isFinite(viewsMainData.addons)
          ? viewsMainData.addons
          : 0;

      tx.update(entryRef, {
        okibakeAddonRecords: records,
        okibakeAddonCount,
        lastOkibakeAddonAt,
        updatedAt: now,
      } as UpdateData<DocumentData>);

      tx.update(
        viewsMainRef,
        appendAvgStackToMainViewUpdate(
          {
            addons: Math.max(0, currentAddons - 1),
            updatedAt: now,
          },
          viewsMainData,
          snapshot,
        ),
      );
    });

    logOpsSuccess({
      message: 'undoOkibakeAddon 成功',
      functionEntry: 'undoOkibakeAddon',
      context: {
        tournamentId: params.tournamentId,
        okibakeEntryId: params.okibakeEntryId,
        addonRecordId: params.addonRecordId,
        operationLogId: params.operationLogId,
      },
    });
  } catch (error) {
    logOpsError({
      message: 'undoOkibakeAddon エラー',
      functionEntry: 'undoOkibakeAddon',
      cause: error,
      context: {
        tournamentId: params.tournamentId,
        okibakeEntryId: params.okibakeEntryId,
        addonRecordId: params.addonRecordId,
        operationLogId: params.operationLogId,
      },
    });
    throw error;
  }
}
