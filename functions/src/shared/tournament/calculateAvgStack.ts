import type { DocumentData, UpdateData } from 'firebase-admin/firestore';

export interface MainViewAvgStackCounters {
  entries: number;
  reentries: number;
  playersBusted: number;
  addons: number;
}

export interface AvgStackSnapshotInput {
  startStack?: unknown;
  addonStack?: unknown;
  isAddon?: unknown;
}

function toFiniteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function pickCounter(
  update: Record<string, unknown>,
  current: Record<string, unknown>,
  key: keyof MainViewAvgStackCounters,
): number {
  const value = update[key] ?? current[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/**
 * views/main のカウンタと snapshot から Avg Stack を計算する。
 * 計算不可の場合は null を返す。
 */
export function calculateAvgStack(
  main: Partial<MainViewAvgStackCounters>,
  snapshot: AvgStackSnapshotInput,
): number | null {
  const entries =
    typeof main.entries === 'number' && Number.isFinite(main.entries) ? main.entries : 0;
  const reentries =
    typeof main.reentries === 'number' && Number.isFinite(main.reentries)
      ? main.reentries
      : 0;
  const playersBusted =
    typeof main.playersBusted === 'number' && Number.isFinite(main.playersBusted)
      ? main.playersBusted
      : 0;
  const addons =
    typeof main.addons === 'number' && Number.isFinite(main.addons) ? main.addons : 0;

  const totalEntries = entries + reentries;
  const remainingPlayers = totalEntries - playersBusted;
  if (remainingPlayers <= 0) {
    return null;
  }

  const startStack = toFiniteNumber(snapshot.startStack);
  if (startStack === null) {
    return null;
  }

  let addonStack = 0;
  if (addons > 0) {
    const resolvedAddonStack = toFiniteNumber(snapshot.addonStack);
    if (resolvedAddonStack === null) {
      return null;
    }
    addonStack = resolvedAddonStack;
  }

  const totalChips = totalEntries * startStack + addons * addonStack;
  return Math.floor(totalChips / remainingPlayers);
}

/**
 * views/main 更新パッチに、更新後カウンタに基づく avgStack を付与する。
 */
export function appendAvgStackToMainViewUpdate(
  update: UpdateData<DocumentData>,
  currentMain: Record<string, unknown>,
  snapshot: AvgStackSnapshotInput,
): UpdateData<DocumentData> {
  const updateRecord = update as Record<string, unknown>;
  const counters: MainViewAvgStackCounters = {
    entries: pickCounter(updateRecord, currentMain, 'entries'),
    reentries: pickCounter(updateRecord, currentMain, 'reentries'),
    playersBusted: pickCounter(updateRecord, currentMain, 'playersBusted'),
    addons: pickCounter(updateRecord, currentMain, 'addons'),
  };

  return {
    ...update,
    avgStack: calculateAvgStack(counters, snapshot),
  };
}
