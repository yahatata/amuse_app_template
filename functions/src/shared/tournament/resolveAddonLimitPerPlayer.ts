/**
 * Phase 3A+: テンプレート / scheduledTournament.snapshot における Addon 上限回数。
 * addon.ts / bulkAddon / applyOkibakeAddon からも再利用すること。
 */

export type ResolveAddonLimitInput = {
  isAddon?: unknown;
  addonLimitPerPlayer?: unknown;
};

/** isAddon が厳密に true のときのみ Addon 許可カウントを返す。それ以外は 0 */
export function resolveAddonLimitPerPlayer(input: ResolveAddonLimitInput): number {
  if (input.isAddon !== true) {
    return 0;
  }
  const raw = input.addonLimitPerPlayer;
  if (
    typeof raw === "number" &&
    Number.isFinite(raw) &&
    Number.isInteger(raw) &&
    raw >= 1
  ) {
    return raw;
  }
  return 1;
}
