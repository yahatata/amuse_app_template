/// Phase 5-A': `updateOkibakeTemporaryEntryLinkedUser` Callable payload（テスト可能な pure builder）。
Map<String, dynamic> buildUpdateOkibakeLinkedUserCallablePayload({
  required String operationId,
  required String tournamentId,
  required String okibakeEntryId,
  required String linkedUserId,
  String? deviceName,
}) {
  return {
    'operationId': operationId,
    'tournamentId': tournamentId,
    'okibakeEntryId': okibakeEntryId,
    'linkedUserId': linkedUserId,
    if (deviceName != null && deviceName.isNotEmpty) 'deviceName': deviceName,
  };
}
