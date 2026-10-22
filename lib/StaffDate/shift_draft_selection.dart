// Admin draft interim confirm: selection scoped to a single dateKey.
// Interim confirm is 1-day unit (see interimConfirmRequests callable).
// UI selection must not carry over across date tabs.

/// Returns pending request IDs on the current date.
Set<String> pendingRequestIdsOnDate(
  Iterable<({String requestId, String status})> requests,
) {
  return {
    for (final r in requests)
      if (r.status == 'pending') r.requestId,
  };
}

/// Selected IDs intersected with pending IDs on the current date.
Set<String> selectedRequestIdsForDate({
  required Set<String> selectedRequestIds,
  required Set<String> pendingRequestIdsOnDate,
}) {
  return selectedRequestIds.intersection(pendingRequestIdsOnDate);
}

/// Count of selected pending requests on the current date.
int selectedCountForDate({
  required Set<String> selectedRequestIds,
  required Set<String> pendingRequestIdsOnDate,
}) {
  return selectedRequestIdsForDate(
    selectedRequestIds: selectedRequestIds,
    pendingRequestIdsOnDate: pendingRequestIdsOnDate,
  ).length;
}

/// Allocation minutes for interim confirm payload (current date only).
typedef InterimConfirmAllocation = ({
  int startMinute,
  int endMinute,
});

/// Builds interim confirm [selections] for the current date (defense in depth).
List<Map<String, dynamic>> buildInterimConfirmSelectionsForDate({
  required Set<String> selectedRequestIds,
  required Set<String> pendingRequestIdsOnDate,
  required Map<String, InterimConfirmAllocation> allocationByRequestId,
}) {
  final filtered = selectedRequestIdsForDate(
    selectedRequestIds: selectedRequestIds,
    pendingRequestIdsOnDate: pendingRequestIdsOnDate,
  );

  final selections = <Map<String, dynamic>>[];
  for (final requestId in filtered) {
    final allocation = allocationByRequestId[requestId];
    if (allocation == null) continue;
    selections.add({
      'requestId': requestId,
      'startMinute': allocation.startMinute,
      'endMinute': allocation.endMinute,
    });
  }
  return selections;
}
