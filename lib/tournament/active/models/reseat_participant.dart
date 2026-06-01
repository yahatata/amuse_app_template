/// 全員リシート候補（通常参加者 / 置きバケ一時参加者）。
enum ReseatParticipantType { normal, okibake }

class ReseatParticipant {
  const ReseatParticipant({
    required this.participantType,
    required this.selectionKey,
    required this.displayName,
    required this.isCurrentlySeated,
    this.userId,
    this.okibakeEntryId,
    this.currentTableId,
    this.currentSeatNumber,
    this.joinedAt,
    this.entryStatus,
    this.billLinkStatus,
    this.linkedUserId,
  });

  final ReseatParticipantType participantType;
  final String selectionKey;
  final String displayName;
  final bool isCurrentlySeated;

  final String? userId;
  final String? okibakeEntryId;

  final String? currentTableId;
  final int? currentSeatNumber;

  /// 待機側リスト表示用（通常待機のみ）。
  final DateTime? joinedAt;

  final String? entryStatus;
  final String? billLinkStatus;
  final String? linkedUserId;

  bool get isOkibake => participantType == ReseatParticipantType.okibake;

  /// 候補一覧で置きバケであることが分かる表示名。
  String get listDisplayName =>
      isOkibake ? '$displayName（置きバケ）' : displayName;

  static String okibakeSelectionKey(String okibakeEntryId) =>
      'okibakeTemporary:$okibakeEntryId';

  static bool isOkibakeSelectionKey(String key) =>
      key.startsWith('okibakeTemporary:');

  static String? okibakeEntryIdFromSelectionKey(String key) {
    if (!isOkibakeSelectionKey(key)) return null;
    return key.substring('okibakeTemporary:'.length);
  }
}
