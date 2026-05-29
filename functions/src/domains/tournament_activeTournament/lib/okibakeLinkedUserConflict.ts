import type { firestore } from 'firebase-admin';

const CONFLICT_BILL_LINK_STATUSES = new Set(['unlinked', 'pending_review', 'linked']);

export interface OkibakeLinkedUserConflictResult {
  conflict: boolean;
  okibakeEntryId?: string;
  billLinkStatus?: string;
  entryStatus?: string;
}

export async function findOkibakeLinkedUserConflictInTx(params: {
  tx: firestore.Transaction;
  tournamentRef: firestore.DocumentReference;
  userId: string;
}): Promise<OkibakeLinkedUserConflictResult> {
  const { tx, tournamentRef, userId } = params;
  const targetUserId = userId.trim();
  if (!targetUserId) {
    return { conflict: false };
  }

  const snap = await tx.get(tournamentRef.collection('okibakeTemporaryEntries'));
  for (const doc of snap.docs) {
    const data = doc.data();
    const linkedUserId =
      typeof data.linkedUserId === 'string' ? data.linkedUserId.trim() : '';
    if (!linkedUserId || linkedUserId !== targetUserId) continue;

    const entryStatus =
      typeof data.entryStatus === 'string' ? data.entryStatus : 'registered';
    if (entryStatus === 'voided') continue;

    const billLinkStatus =
      typeof data.billLinkStatus === 'string' ? data.billLinkStatus : 'unlinked';
    if (!CONFLICT_BILL_LINK_STATUSES.has(billLinkStatus)) continue;

    return {
      conflict: true,
      okibakeEntryId: doc.id,
      billLinkStatus,
      entryStatus,
    };
  }

  return { conflict: false };
}
