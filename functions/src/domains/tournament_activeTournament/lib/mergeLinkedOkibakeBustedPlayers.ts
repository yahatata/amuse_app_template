/**
 * getRankingData 向け: linked + busted の元置きバケを bustedPlayers に合成する。
 * 永続データは変更せず、読み取り結果の返却時のみ利用する。
 */

export type BustedPlayerRow = {
  uid: string;
  pokerName: string;
  bustAt: unknown;
};

export function bustAtSeconds(bustAt: unknown): number {
  if (bustAt != null && typeof bustAt === 'object' && '_seconds' in bustAt) {
    const seconds = (bustAt as { _seconds?: number })._seconds;
    return typeof seconds === 'number' ? seconds : 0;
  }
  return 0;
}

export function sortBustedPlayersByBustAtDesc(players: BustedPlayerRow[]): BustedPlayerRow[] {
  return [...players].sort((a, b) => bustAtSeconds(b.bustAt) - bustAtSeconds(a.bustAt));
}

export function resolveOkibakeBustedPokerName(entry: Record<string, unknown>): string {
  const linkedUserPokerName = entry.linkedUserPokerName;
  if (typeof linkedUserPokerName === 'string' && linkedUserPokerName.trim().length > 0) {
    return linkedUserPokerName.trim();
  }
  const temporaryDisplayName = entry.temporaryDisplayName;
  if (typeof temporaryDisplayName === 'string' && temporaryDisplayName.trim().length > 0) {
    return temporaryDisplayName.trim();
  }
  const displayName = entry.displayName;
  if (typeof displayName === 'string' && displayName.trim().length > 0) {
    return displayName.trim();
  }
  return '不明';
}

export function isLinkedBustedOkibakeEntry(entry: Record<string, unknown>): boolean {
  if (entry.entryStatus !== 'busted') return false;
  if (entry.billLinkStatus !== 'linked') return false;
  const linkedUserId = entry.linkedUserId;
  return typeof linkedUserId === 'string' && linkedUserId.trim().length > 0;
}

export function mergeLinkedOkibakeBustedPlayers(
  bustedPlayers: BustedPlayerRow[],
  okibakeEntries: Record<string, unknown>[]
): BustedPlayerRow[] {
  const existingUidSet = new Set(bustedPlayers.map((player) => player.uid));
  const merged = [...bustedPlayers];

  for (const entry of okibakeEntries) {
    if (!isLinkedBustedOkibakeEntry(entry)) continue;

    const uid = (entry.linkedUserId as string).trim();
    if (existingUidSet.has(uid)) continue;

    existingUidSet.add(uid);
    merged.push({
      uid,
      pokerName: resolveOkibakeBustedPokerName(entry),
      bustAt: entry.bustedAt ?? null,
    });
  }

  return sortBustedPlayersByBustAtDesc(merged);
}
