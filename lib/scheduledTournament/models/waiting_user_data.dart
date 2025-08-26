class WaitingUserData {
  final String pokerName;
  final DateTime joinedAt;
  final int order;

  WaitingUserData({
    required this.pokerName,
    required this.joinedAt,
    required this.order,
  });

  factory WaitingUserData.fromMap(Map<String, dynamic> map) {
    return WaitingUserData(
      pokerName: map['pokerName'] ?? '',
      joinedAt: map['joinedAt']?.toDate() ?? DateTime.now(),
      order: map['order'] ?? 0,
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'pokerName': pokerName,
      'joinedAt': joinedAt,
      'order': order,
    };
  }

  WaitingUserData copyWith({
    String? pokerName,
    DateTime? joinedAt,
    int? order,
  }) {
    return WaitingUserData(
      pokerName: pokerName ?? this.pokerName,
      joinedAt: joinedAt ?? this.joinedAt,
      order: order ?? this.order,
    );
  }

  @override
  String toString() {
    return 'WaitingUserData(pokerName: $pokerName, joinedAt: $joinedAt, order: $order)';
  }

  @override
  bool operator ==(Object other) {
    if (identical(this, other)) return true;
    return other is WaitingUserData &&
        other.pokerName == pokerName &&
        other.joinedAt == joinedAt &&
        other.order == order;
  }

  @override
  int get hashCode {
    return pokerName.hashCode ^ joinedAt.hashCode ^ order.hashCode;
  }
}
