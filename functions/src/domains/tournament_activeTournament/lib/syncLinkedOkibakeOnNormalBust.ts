import type {
  DocumentReference,
  Firestore,
  Transaction,
  UpdateData,
  DocumentData,
  FieldValue,
} from 'firebase-admin/firestore';

export type LinkedOkibakeNormalBustMode = 'exit' | 'reentry';

export function isLinkedOkibakeActiveForNormalBustSync(
  data: Record<string, unknown>,
): boolean {
  const billLinkStatus =
    typeof data.billLinkStatus === 'string' ? data.billLinkStatus : '';
  const entryStatus = typeof data.entryStatus === 'string' ? data.entryStatus : '';
  return (
    billLinkStatus === 'linked' &&
    (entryStatus === 'seated' || entryStatus === 'registered')
  );
}

/** トランザクション外: linked かつ seated/registered の okibake entryId 一覧。 */
export async function loadLinkedOkibakeEntryIdsForUser(
  db: Firestore,
  tournamentId: string,
  userId: string,
): Promise<string[]> {
  const snap = await db
    .collection('scheduledTournaments')
    .doc(tournamentId)
    .collection('okibakeTemporaryEntries')
    .where('linkedUserId', '==', userId)
    .get();

  return snap.docs
    .filter((doc) =>
      isLinkedOkibakeActiveForNormalBustSync(doc.data() as Record<string, unknown>),
    )
    .map((doc) => doc.id);
}

function seatKeyFromSeatNumber(seatNumber: number): string {
  return `seat${String(seatNumber).padStart(2, '0')}`;
}

function buildLinkedOkibakePatch(
  mode: LinkedOkibakeNormalBustMode,
  tableId: string,
  seatNumber: number,
  now: FieldValue,
): Record<string, unknown> {
  if (mode === 'exit') {
    return {
      entryStatus: 'busted',
      bustedAt: now,
      bustedTableId: tableId,
      bustedSeatKey: seatKeyFromSeatNumber(seatNumber),
      updatedAt: now,
    };
  }
  return {
    entryStatus: 'registered',
    assignedTableId: null,
    assignedSeatKey: null,
    seatedAt: null,
    updatedAt: now,
  };
}

/**
 * 伝票紐付け済み置きバケを、通常 bust / reentry に合わせて okibakeTemporaryEntries へ反映する。
 * トランザクション内では先に get してから update すること（本関数は get も行う）。
 */
export async function syncLinkedOkibakeOnNormalBustInTx(params: {
  transaction: Transaction;
  tournamentRef: DocumentReference;
  userId: string;
  mode: LinkedOkibakeNormalBustMode;
  tableId: string;
  seatNumber: number;
  seatOkibakeEntryId?: string | null;
  preloadedEntryIds: string[];
  now: FieldValue;
}): Promise<void> {
  const {
    transaction,
    tournamentRef,
    userId,
    mode,
    tableId,
    seatNumber,
    seatOkibakeEntryId,
    preloadedEntryIds,
    now,
  } = params;

  const entryIds = new Set(preloadedEntryIds);
  if (typeof seatOkibakeEntryId === 'string' && seatOkibakeEntryId.trim().length > 0) {
    entryIds.add(seatOkibakeEntryId.trim());
  }

  if (entryIds.size === 0) return;

  const patch = buildLinkedOkibakePatch(mode, tableId, seatNumber, now);

  for (const entryId of entryIds) {
    const entryRef = tournamentRef.collection('okibakeTemporaryEntries').doc(entryId);
    const snap = await transaction.get(entryRef);
    if (!snap.exists) continue;

    const data = snap.data() as Record<string, unknown>;
    if (typeof data.linkedUserId !== 'string' || data.linkedUserId !== userId) continue;
    if (!isLinkedOkibakeActiveForNormalBustSync(data)) continue;

    transaction.update(entryRef, patch as UpdateData<DocumentData>);
  }
}
