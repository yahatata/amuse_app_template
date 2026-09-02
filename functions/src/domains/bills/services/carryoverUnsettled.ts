/**
 * 閉店持ち越し（C1-B）判定。
 * closeSummary の証跡（markedAt / closedBusinessDate 等）を正とする。
 * settle 後に unresolved=false でも証跡が残れば carryover 由来とみなす。
 */

function hasTruthyString(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * 閉店持ち越し由来 bill かどうか（C1-B）。
 * `unresolved === true` のみでは判定しない（証跡フィールドを見る）。
 */
export function isCarryoverUnsettledBillFromCloseSummary(
  closeSummary: unknown,
): boolean {
  if (closeSummary == null || typeof closeSummary !== "object") {
    return false;
  }

  const summary = closeSummary as Record<string, unknown>;
  return (
    summary.unresolved === true ||
    summary.markedAt != null ||
    hasTruthyString(summary.closedBusinessDate) ||
    summary.displayAmountAtMark != null ||
    hasTruthyString(summary.lastCloseRunId)
  );
}

/**
 * reopen 時に unresolved を復元すべきか。
 * 現状は carryover 判定と同義（C1-B）。
 */
export function shouldRestoreCarryoverUnresolvedFromCloseSummary(
  closeSummary: unknown,
): boolean {
  return isCarryoverUnsettledBillFromCloseSummary(closeSummary);
}
