class SeatData {
  final String? userId;
  final String? pokerName;

  SeatData({
    this.userId,
    this.pokerName,
  });

  factory SeatData.fromMap(Map<String, dynamic> map) {
    return SeatData(
      userId: map['userId'],
      pokerName: map['pokerName'],
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'userId': userId,
      'pokerName': pokerName,
    };
  }

  SeatData copyWith({
    String? userId,
    String? pokerName,
  }) {
    return SeatData(
      userId: userId ?? this.userId,
      pokerName: pokerName ?? this.pokerName,
    );
  }

  bool get isOccupied => userId != null && userId!.isNotEmpty;

  @override
  String toString() {
    return 'SeatData(userId: $userId, pokerName: $pokerName)';
  }

  @override
  bool operator ==(Object other) {
    if (identical(this, other)) return true;
    return other is SeatData &&
        other.userId == userId &&
        other.pokerName == pokerName;
  }

  @override
  int get hashCode {
    return userId.hashCode ^ pokerName.hashCode;
  }
}
