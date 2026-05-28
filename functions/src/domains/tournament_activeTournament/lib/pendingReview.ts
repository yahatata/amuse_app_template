import type { Firestore, Transaction } from 'firebase-admin/firestore';
import { FieldValue } from 'firebase-admin/firestore';

const ELIGIBLE_ENTRY_STATUSES = new Set(['registered', 'seated', 'busted']);

export type PendingReviewStats = {
  blockedUnlinkedWithoutLinkedUser: number;
  movedToPendingReview: number;
};

export type PendingReviewBlockingEntry = {
  okibakeEntryId: string;
  displayName?: string;
  entryStatus: 'registered' | 'seated' | 'busted';
};

type EntryForPendingReview = {
  ref: FirebaseFirestore.DocumentReference;
  data: Record<string, unknown>;
};

export async function collectPendingReviewTargetsInTx(
  tx: Transaction,
  db: Firestore,
  tournamentId: string
): Promise<{
  blockedCount: number;
  blockingEntries: PendingReviewBlockingEntry[];
  entriesToPendingReview: EntryForPendingReview[];
}> {
  const collRef = db
    .collection('scheduledTournaments')
    .doc(tournamentId)
    .collection('okibakeTemporaryEntries');
  const snap = await tx.get(collRef);

  let blockedCount = 0;
  const blockingEntries: PendingReviewBlockingEntry[] = [];
  const entriesToPendingReview: EntryForPendingReview[] = [];

  for (const doc of snap.docs) {
    const data = (doc.data() ?? {}) as Record<string, unknown>;
    const entryStatus = typeof data.entryStatus === 'string' ? data.entryStatus : '';
    const billLinkStatus =
      typeof data.billLinkStatus === 'string' ? data.billLinkStatus : '';
    const linkedUserId =
      typeof data.linkedUserId === 'string' && data.linkedUserId.trim().length > 0
        ? data.linkedUserId.trim()
        : null;

    if (entryStatus === 'voided') continue;
    if (billLinkStatus !== 'unlinked') continue;

    if (linkedUserId == null) {
      blockedCount += 1;
      const entryId =
        typeof data.okibakeEntryId === 'string' && data.okibakeEntryId.trim().length > 0
          ? data.okibakeEntryId.trim()
          : doc.id;
      const displayName =
        typeof data.temporaryDisplayName === 'string' && data.temporaryDisplayName.trim().length > 0
          ? data.temporaryDisplayName.trim()
          : undefined;
      if (
        entryStatus === 'registered' ||
        entryStatus === 'seated' ||
        entryStatus === 'busted'
      ) {
        blockingEntries.push({
          okibakeEntryId: entryId,
          displayName,
          entryStatus,
        });
      }
      continue;
    }
    if (!ELIGIBLE_ENTRY_STATUSES.has(entryStatus)) continue;

    entriesToPendingReview.push({ ref: doc.ref, data });
  }

  return { blockedCount, blockingEntries, entriesToPendingReview };
}

export function applyPendingReviewTransitionInTx(
  tx: Transaction,
  entries: EntryForPendingReview[]
): PendingReviewStats {
  const now = FieldValue.serverTimestamp();
  for (const { ref } of entries) {
    tx.update(ref, {
      billLinkStatus: 'pending_review',
      pendingReviewAt: now,
      pendingReviewReason: 'tournament_finished_unlinked',
      updatedAt: now,
    });
  }
  return {
    blockedUnlinkedWithoutLinkedUser: 0,
    movedToPendingReview: entries.length,
  };
}
