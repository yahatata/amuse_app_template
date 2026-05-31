import type { Firestore } from 'firebase-admin/firestore';
import type { OkibakeLoginPromptMode, StoreConfig } from '../../../shared/config/types';
import { DEFAULT_OKIBAKE_LOGIN_PROMPT_MODE } from '../../../shared/config/defaults';

export type OkibakeLoginPromptEntry = {
  tournamentId: string;
  tournamentName?: string;
  okibakeEntryId: string;
  displayName?: string;
  temporaryDisplayName?: string;
  linkedUserPokerName?: string;
  entryStatus: string;
  billLinkStatus: string;
};

export type OkibakeLoginPromptPayload = {
  mode: OkibakeLoginPromptMode;
  count: number;
  entries: OkibakeLoginPromptEntry[];
};

const ALLOWED_MODES: ReadonlySet<string> = new Set([
  'none',
  'notice_only',
  'link_prompt',
]);

export function resolveOkibakeLoginPromptMode(
  config: StoreConfig | null | undefined
): OkibakeLoginPromptMode {
  const raw = config?.okibake?.loginPromptMode;
  if (typeof raw === 'string' && ALLOWED_MODES.has(raw)) {
    return raw as OkibakeLoginPromptMode;
  }
  return DEFAULT_OKIBAKE_LOGIN_PROMPT_MODE as OkibakeLoginPromptMode;
}

export async function collectOkibakeLoginPromptTargets(params: {
  db: Firestore;
  linkedUserId: string;
  currentBusinessDate: string;
}): Promise<OkibakeLoginPromptEntry[]> {
  const { db, linkedUserId, currentBusinessDate } = params;
  if (!linkedUserId.trim()) return [];

  const snap = await db
    .collectionGroup('okibakeTemporaryEntries')
    .where('linkedUserId', '==', linkedUserId)
    .where('billLinkStatus', 'in', ['unlinked', 'pending_review'])
    .get();

  const rows: Array<{
    tournamentId: string;
    okibakeEntryId: string;
    data: Record<string, unknown>;
  }> = [];
  const unlinkedTournamentIds = new Set<string>();
  const allTournamentIds = new Set<string>();

  for (const doc of snap.docs) {
    const tournamentId = doc.ref.parent.parent?.id;
    if (!tournamentId) continue;
    const data = doc.data() as Record<string, unknown>;
    const entryStatus = typeof data.entryStatus === 'string' ? data.entryStatus : '';
    const billLinkStatus =
      typeof data.billLinkStatus === 'string' ? data.billLinkStatus : '';
    if (entryStatus === 'voided') continue;
    if (billLinkStatus !== 'unlinked' && billLinkStatus !== 'pending_review') continue;

    allTournamentIds.add(tournamentId);
    if (billLinkStatus === 'unlinked') {
      unlinkedTournamentIds.add(tournamentId);
    }
    rows.push({
      tournamentId,
      okibakeEntryId: doc.id,
      data,
    });
  }

  const unlinkedTournamentDateMap = new Map<string, string>();
  const tournamentNameMap = new Map<string, string>();
  if (allTournamentIds.size > 0) {
    const reads = Array.from(allTournamentIds).map(async (tournamentId) => {
      const tournamentSnap = await db
        .collection('scheduledTournaments')
        .doc(tournamentId)
        .get();
      const tournamentData = tournamentSnap.data() as Record<string, unknown> | undefined;
      const businessDate =
        typeof tournamentData?.businessDate === 'string' ? tournamentData.businessDate : '';
      const snapshotObj =
        tournamentData?.snapshot &&
        typeof tournamentData.snapshot === 'object' &&
        tournamentData.snapshot !== null
          ? (tournamentData.snapshot as Record<string, unknown>)
          : undefined;
      const nameFromSnapshot =
        typeof snapshotObj?.name === 'string' ? snapshotObj.name.trim() : '';
      const nameFromRoot =
        typeof tournamentData?.name === 'string' ? tournamentData.name.trim() : '';
      const name = nameFromSnapshot || nameFromRoot;
      unlinkedTournamentDateMap.set(tournamentId, businessDate);
      tournamentNameMap.set(tournamentId, name);
    });
    await Promise.all(reads);
  }

  const out: OkibakeLoginPromptEntry[] = [];
  for (const row of rows) {
    const { tournamentId, okibakeEntryId, data } = row;
    const entryStatus = typeof data.entryStatus === 'string' ? data.entryStatus : '';
    const billLinkStatus =
      typeof data.billLinkStatus === 'string' ? data.billLinkStatus : '';
    if (billLinkStatus === 'unlinked') {
      const tournamentBusinessDate = unlinkedTournamentDateMap.get(tournamentId) ?? '';
      if (!currentBusinessDate || tournamentBusinessDate !== currentBusinessDate) {
        continue;
      }
    }

    out.push({
      tournamentId,
      tournamentName: tournamentNameMap.get(tournamentId),
      okibakeEntryId,
      displayName: typeof data.displayName === 'string' ? data.displayName : undefined,
      temporaryDisplayName:
        typeof data.temporaryDisplayName === 'string'
          ? data.temporaryDisplayName
          : undefined,
      linkedUserPokerName:
        typeof data.linkedUserPokerName === 'string'
          ? data.linkedUserPokerName
          : undefined,
      entryStatus,
      billLinkStatus,
    });
  }

  return out;
}

export function buildOkibakeLoginPromptPayload(params: {
  mode: OkibakeLoginPromptMode;
  entries: OkibakeLoginPromptEntry[];
}): OkibakeLoginPromptPayload {
  const { mode, entries } = params;
  const shouldExposeEntries = mode === 'notice_only' || mode === 'link_prompt';
  return {
    mode,
    count: entries.length,
    entries: shouldExposeEntries ? entries : [],
  };
}

export function buildOkibakeLoginPromptFallback(): OkibakeLoginPromptPayload {
  return {
    mode: 'notice_only',
    count: 0,
    entries: [],
  };
}
