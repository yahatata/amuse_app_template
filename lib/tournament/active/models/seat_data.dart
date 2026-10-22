class SeatData {
  final String? userId;
  final String? pokerName;
  final String? okibakeEntryId;

  SeatData({
    this.userId,
    this.pokerName,
    this.okibakeEntryId,
  });

  bool get isOkibakeSeat =>
      okibakeEntryId != null &&
      okibakeEntryId!.isNotEmpty &&
      (userId == null || userId!.isEmpty);

  /// userId または okibakeEntryId があれば占有。pokerName のみでは空席扱い。
  bool get isOccupied =>
      (userId != null && userId!.isNotEmpty) ||
      (okibakeEntryId != null && okibakeEntryId!.isNotEmpty);

  factory SeatData.fromMap(Map<String, dynamic> map) {
    return SeatData(
      userId: map['userId'] as String?,
      pokerName: map['pokerName'] as String?,
      okibakeEntryId: map['okibakeEntryId'] as String?,
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'userId': userId,
      'pokerName': pokerName,
      'okibakeEntryId': okibakeEntryId,
    };
  }

  SeatData copyWith({
    String? userId,
    String? pokerName,
    String? okibakeEntryId,
  }) {
    return SeatData(
      userId: userId ?? this.userId,
      pokerName: pokerName ?? this.pokerName,
      okibakeEntryId: okibakeEntryId ?? this.okibakeEntryId,
    );
  }

  @override
  String toString() {
    return 'SeatData(userId: $userId, pokerName: $pokerName, okibakeEntryId: $okibakeEntryId)';
  }

  @override
  bool operator ==(Object other) {
    if (identical(this, other)) return true;
    return other is SeatData &&
        other.userId == userId &&
        other.pokerName == pokerName &&
        other.okibakeEntryId == okibakeEntryId;
  }

  @override
  int get hashCode {
    return Object.hash(userId, pokerName, okibakeEntryId);
  }
}
