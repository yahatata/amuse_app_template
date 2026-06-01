import { HttpsError } from 'firebase-functions/v2/https';
import type { Timestamp } from 'firebase-admin/firestore';
import type { OkibakeReseatEntrySnapshot } from '../../tournament_activeTournament/lib/slimOkibakeEntryForReseatLog';

function entryFieldMatches(
  entryData: Record<string, unknown>,
  field: keyof OkibakeReseatEntrySnapshot,
  expected: unknown,
): boolean {
  const actual = Object.prototype.hasOwnProperty.call(entryData, field)
    ? entryData[field]
    : null;
  return actual === expected || (actual == null && expected == null);
}

export function validateOkibakeReseatUndoEntry(
  entryData: Record<string, unknown>,
  entryAfter: OkibakeReseatEntrySnapshot,
): void {
  const fields: Array<keyof OkibakeReseatEntrySnapshot> = [
    'entryStatus',
    'assignedTableId',
    'assignedSeatKey',
  ];

  for (const field of fields) {
    if (!entryFieldMatches(entryData, field, entryAfter[field])) {
      throw new HttpsError(
        'failed-precondition',
        `置きバケ状態が操作履歴と一致しないため、全員リシートの取り消しを実行できません (${field})`,
      );
    }
  }

  if (entryAfter.assignedSeatNumber != null) {
    const actualNumber = typeof entryData.assignedSeatNumber === 'number'
      ? entryData.assignedSeatNumber
      : null;
    if (actualNumber != null && actualNumber !== entryAfter.assignedSeatNumber) {
      throw new HttpsError(
        'failed-precondition',
        '置きバケ状態が操作履歴と一致しないため、全員リシートの取り消しを実行できません (assignedSeatNumber)',
      );
    }
  }
}

export function buildOkibakeReseatUndoEntryPatch(
  entryBefore: OkibakeReseatEntrySnapshot,
  rollBackBy: string,
  now: Timestamp,
): Record<string, unknown> {
  return {
    entryStatus: entryBefore.entryStatus ?? 'registered',
    assignedTableId: entryBefore.assignedTableId ?? null,
    assignedSeatKey: entryBefore.assignedSeatKey ?? null,
    seatedAt: entryBefore.seatedAt ?? null,
    updatedAt: now,
    updatedByDeviceId: rollBackBy,
  };
}

export function countOkibakeRegisteredRestoresOnUndo(
  targets: Array<{ okibakeEntryBefore: OkibakeReseatEntrySnapshot; okibakeEntryAfter: OkibakeReseatEntrySnapshot }>,
): number {
  let count = 0;
  for (const target of targets) {
    if (
      target.okibakeEntryBefore.entryStatus === 'registered' &&
      target.okibakeEntryAfter.entryStatus === 'seated'
    ) {
      count += 1;
    }
  }
  return count;
}
