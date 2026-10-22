import { HttpsError } from 'firebase-functions/v2/https';
import type { Firestore } from 'firebase-admin/firestore';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';

export type FallbackSeatInput = {
  tableId: string;
  seatKey: string;
  seatNumber?: number;
};

export type SeatSlotSnapshot = {
  userId: unknown;
  pokerName: unknown;
  okibakeEntryId: unknown;
};

export type AvailableSeat = {
  tableId: string;
  tableName?: string;
  seatKey: string;
  seatNumber: number;
};

export type BustUndoParticipantType = 'normal' | 'okibake';

export type BustUndoRestorePlan = {
  tableId: string;
  seatKey: string;
  seatSuffix: string;
  usedFallback: boolean;
};

const SEAT_SELECTION_MESSAGE =
  '元の席が埋まっています。戻し先の空席を選択してください。';

export function parseSeatSuffix(seatKey: string): string | null {
  const m = seatKey.match(/^seat(\d{1,2})$/);
  if (!m) return null;
  return m[1].padStart(2, '0');
}

export function seatNumberFromSeatKey(seatKey: string): number | null {
  const suffix = parseSeatSuffix(seatKey);
  if (suffix == null) return null;
  return parseInt(suffix, 10);
}

export function readSeatSlot(seats: Record<string, unknown>, suffix: string): SeatSlotSnapshot {
  return {
    userId: seats[`seat${suffix}UserId`] ?? null,
    pokerName: seats[`seat${suffix}PokerName`] ?? null,
    okibakeEntryId: seats[`seat${suffix}OkibakeEntryId`] ?? null,
  };
}

export function isSeatSlotEmpty(slot: SeatSlotSnapshot): boolean {
  const userId = slot.userId;
  const okibakeEntryId = slot.okibakeEntryId;
  const hasUser = typeof userId === 'string' ? userId.trim().length > 0 : userId != null && userId !== '';
  const hasOkibake =
    typeof okibakeEntryId === 'string'
      ? okibakeEntryId.trim().length > 0
      : okibakeEntryId != null && okibakeEntryId !== '';
  return !hasUser && !hasOkibake;
}

export function seatSlotMatches(
  seats: Record<string, unknown>,
  suffix: string,
  expected: Record<string, unknown>
): boolean {
  const slot = readSeatSlot(seats, suffix);
  return (
    slot.userId === (expected.userId ?? null) &&
    slot.pokerName === (expected.pokerName ?? null) &&
    slot.okibakeEntryId === (expected.okibakeEntryId ?? null)
  );
}

export async function listAvailableTournamentSeats(
  db: Firestore,
  tournamentId: string
): Promise<AvailableSeat[]> {
  const snap = await db
    .collection('scheduledTournaments')
    .doc(tournamentId)
    .collection('tablesSeat')
    .get();

  const available: AvailableSeat[] = [];
  for (const doc of snap.docs) {
    if (doc.id === 'waiting' || doc.id === 'busted') continue;
    const data = doc.data() ?? {};
    if (data.isEnabled === false) continue;

    const seats =
      typeof data.seats === 'object' && data.seats != null
        ? (data.seats as Record<string, unknown>)
        : {};

    for (const key of Object.keys(seats)) {
      const m = key.match(/^seat(\d{2})UserId$/);
      if (!m) continue;
      const suffix = m[1];
      const seatKey = `seat${suffix}`;
      if (!isSeatSlotEmpty(readSeatSlot(seats, suffix))) continue;
      available.push({
        tableId: doc.id,
        tableName: doc.id,
        seatKey,
        seatNumber: parseInt(suffix, 10),
      });
    }
  }

  return available.sort(
    (a, b) => a.tableId.localeCompare(b.tableId) || a.seatNumber - b.seatNumber
  );
}

export function throwBustUndoSeatSelectionRequired(args: {
  tournamentId: string;
  operationLogId: string;
  participantType: BustUndoParticipantType;
  originalSeat: {
    tableId: string;
    seatKey: string;
    seatNumber?: number;
  };
  availableSeats: AvailableSeat[];
}): never {
  throw new HttpsError('failed-precondition', SEAT_SELECTION_MESSAGE, {
    errorKey: 'TOURNAMENT_BUST_UNDO_SEAT_SELECTION_REQUIRED',
    tournamentId: args.tournamentId,
    operationLogId: args.operationLogId,
    participantType: args.participantType,
    originalSeat: args.originalSeat,
    availableSeats: args.availableSeats,
  });
}

export async function resolveBustUndoRestorePlan(args: {
  db: Firestore;
  tournamentId: string;
  operationLogId: string;
  participantType: BustUndoParticipantType;
  originalTableId: string;
  originalSeatKey: string;
  originalSeatEmpty: boolean;
  fallbackSeat?: FallbackSeatInput;
}): Promise<BustUndoRestorePlan> {
  const originalSuffix = parseSeatSuffix(args.originalSeatKey);
  if (originalSuffix == null) {
    throw new HttpsError('failed-precondition', '操作履歴の seatKey が不正です');
  }

  const originalSeat = {
    tableId: args.originalTableId,
    seatKey: args.originalSeatKey,
    seatNumber: seatNumberFromSeatKey(args.originalSeatKey) ?? undefined,
  };

  if (args.originalSeatEmpty) {
    return {
      tableId: args.originalTableId,
      seatKey: args.originalSeatKey,
      seatSuffix: originalSuffix,
      usedFallback: false,
    };
  }

  if (args.fallbackSeat) {
    const fallbackSuffix = parseSeatSuffix(args.fallbackSeat.seatKey);
    if (fallbackSuffix == null) {
      throw new HttpsError('failed-precondition', 'fallbackSeat の seatKey が不正です');
    }

    const fallbackRef = args.db
      .collection('scheduledTournaments')
      .doc(args.tournamentId)
      .collection('tablesSeat')
      .doc(args.fallbackSeat.tableId);
    const fallbackSnap = await fallbackRef.get();
    if (!fallbackSnap.exists) {
      throw new HttpsError('failed-precondition', '指定された戻し先テーブルが存在しません');
    }

    const fallbackData = fallbackSnap.data() ?? {};
    if (fallbackData.isEnabled === false) {
      throw new HttpsError('failed-precondition', '指定された戻し先テーブルが無効です');
    }

    const fallbackSeats =
      typeof fallbackData.seats === 'object' && fallbackData.seats != null
        ? (fallbackData.seats as Record<string, unknown>)
        : {};

    if (!isSeatSlotEmpty(readSeatSlot(fallbackSeats, fallbackSuffix))) {
      throw new HttpsError('failed-precondition', '指定された戻し先席は使用中です');
    }

    return {
      tableId: args.fallbackSeat.tableId,
      seatKey: args.fallbackSeat.seatKey,
      seatSuffix: fallbackSuffix,
      usedFallback: true,
    };
  }

  const availableSeats = await listAvailableTournamentSeats(args.db, args.tournamentId);
  throwBustUndoSeatSelectionRequired({
    tournamentId: args.tournamentId,
    operationLogId: args.operationLogId,
    participantType: args.participantType,
    originalSeat,
    availableSeats,
  });
}

export function tournamentBustedUserRef(db: Firestore, tournamentId: string) {
  return db
    .collection('scheduledTournaments')
    .doc(tournamentId)
    .collection('tablesSeat')
    .doc('busted');
}

export function removeUserFromBustedUserInTransaction(
  transaction: FirebaseFirestore.Transaction,
  bustedRef: FirebaseFirestore.DocumentReference,
  bustedDocExists: boolean,
  playerUid: string,
  now: Timestamp
): void {
  if (!bustedDocExists) return;
  transaction.update(bustedRef, {
    [`bustedUser.${playerUid}`]: FieldValue.delete(),
    updatedAt: now,
  });
}
