/// 閉店持ち越し（C1-B）判定。Functions `carryoverUnsettled.ts` と同契約。
bool isCarryoverUnsettledBillFromCloseSummary(Object? closeSummary) {
  if (closeSummary is! Map) return false;
  final unresolved = closeSummary['unresolved'] == true;
  final markedAt = closeSummary['markedAt'];
  final closedBusinessDate = closeSummary['closedBusinessDate'];
  final displayAmountAtMark = closeSummary['displayAmountAtMark'];
  final lastCloseRunId = closeSummary['lastCloseRunId'];
  final hasClosedBusinessDate =
      closedBusinessDate is String && closedBusinessDate.trim().isNotEmpty;
  final hasLastCloseRunId =
      lastCloseRunId is String && lastCloseRunId.trim().isNotEmpty;
  return unresolved ||
      markedAt != null ||
      hasClosedBusinessDate ||
      displayAmountAtMark != null ||
      hasLastCloseRunId;
}
