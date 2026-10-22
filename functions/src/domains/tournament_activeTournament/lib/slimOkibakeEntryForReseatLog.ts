import { parseSeatKeyToTwoDigitSuffix } from './parseOkibakeSeatKey';

export type OkibakeReseatEntrySnapshot = {
  entryStatus: string | null;
  billLinkStatus: string | null;
  assignedTableId: string | null;
  assignedSeatKey: string | null;
  assignedSeatNumber: number | null;
  seatedAt: unknown;
  updatedAt: unknown;
  updatedByDeviceId: string | null;
};

export function assignedSeatNumberFromSeatKey(seatKey: unknown): number | null {
  if (typeof seatKey !== 'string' || seatKey.trim().length === 0) return null;
  const suffix = parseSeatKeyToTwoDigitSuffix(seatKey);
  if (suffix == null) return null;
  const n = parseInt(suffix, 10);
  return Number.isFinite(n) ? n : null;
}

export function slimOkibakeEntryForReseatLog(
  data: Record<string, unknown> | undefined,
): OkibakeReseatEntrySnapshot | null {
  if (!data) return null;
  const assignedSeatKey =
    typeof data.assignedSeatKey === 'string' && data.assignedSeatKey.trim().length > 0
      ? data.assignedSeatKey.trim()
      : null;

  return {
    entryStatus: typeof data.entryStatus === 'string' ? data.entryStatus : null,
    billLinkStatus: typeof data.billLinkStatus === 'string' ? data.billLinkStatus : null,
    assignedTableId:
      typeof data.assignedTableId === 'string' && data.assignedTableId.trim().length > 0
        ? data.assignedTableId.trim()
        : null,
    assignedSeatKey,
    assignedSeatNumber: assignedSeatNumberFromSeatKey(assignedSeatKey),
    seatedAt: Object.prototype.hasOwnProperty.call(data, 'seatedAt') ? data.seatedAt ?? null : null,
    updatedAt: Object.prototype.hasOwnProperty.call(data, 'updatedAt') ? data.updatedAt ?? null : null,
    updatedByDeviceId:
      typeof data.updatedByDeviceId === 'string' && data.updatedByDeviceId.trim().length > 0
        ? data.updatedByDeviceId.trim()
        : null,
  };
}

export function buildOkibakeEntryAfterForReseatLog(args: {
  tableId: string;
  seatNumber: number;
  seatKey: string;
}): OkibakeReseatEntrySnapshot {
  return {
    entryStatus: 'seated',
    billLinkStatus: null,
    assignedTableId: args.tableId,
    assignedSeatKey: args.seatKey,
    assignedSeatNumber: args.seatNumber,
    seatedAt: null,
    updatedAt: null,
    updatedByDeviceId: null,
  };
}

export type OkibakeReseatTarget = {
  okibakeEntryId: string;
  okibakeEntryBefore: OkibakeReseatEntrySnapshot;
  okibakeEntryAfter: OkibakeReseatEntrySnapshot;
};
