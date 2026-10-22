/// Phase 4-C: `linkOkibakeTemporaryEntryToBill` Callable payload（テスト可能な pure builder）。
Map<String, dynamic> buildLinkOkibakeBillCallablePayload({
  required String operationId,
  required String tournamentId,
  required String okibakeEntryId,
  required String userId,
  required String billId,
  String? deviceName,
}) {
  return {
    'operationId': operationId,
    'tournamentId': tournamentId,
    'okibakeEntryId': okibakeEntryId,
    'userId': userId,
    'billId': billId,
    if (deviceName != null && deviceName.isNotEmpty) 'deviceName': deviceName,
  };
}
