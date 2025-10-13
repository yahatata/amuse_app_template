import 'waiting_user_data.dart';

class WaitingList {
  final Map<String, WaitingUserData> waiting; // userId -> WaitingUserData (待機中)
  final int count;
  final DateTime updatedAt;

  WaitingList({
    required this.waiting,
    required this.count,
    required this.updatedAt,
  });

  factory WaitingList.fromMap(Map<String, dynamic> map) {
    final waitingMap = <String, WaitingUserData>{};
    if (map['waiting'] != null) {
      (map['waiting'] as Map<String, dynamic>).forEach((key, value) {
        if (value is Map<String, dynamic>) {
          // 新しい形式: WaitingUserData
          waitingMap[key] = WaitingUserData.fromMap(value);
        } else if (value == true) {
          // 旧形式: boolean (移行用)
          waitingMap[key] = WaitingUserData(
            pokerName: 'ユーザー$key',
            joinedAt: DateTime.now(),
            order: waitingMap.length + 1,
          );
        }
      });
    }

    return WaitingList(
      waiting: waitingMap,
      count: map['count'] ?? waitingMap.length,
      updatedAt: DateTime.parse(map['updatedAt']),
    );
  }

  Map<String, dynamic> toMap() {
    final waitingMap = <String, Map<String, dynamic>>{};
    waiting.forEach((key, value) {
      waitingMap[key] = value.toMap();
    });
    
    return {
      'waiting': waitingMap,
      'count': count,
      'updatedAt': updatedAt.toIso8601String(),
    };
  }

  WaitingList copyWith({
    Map<String, WaitingUserData>? waiting,
    int? count,
    DateTime? updatedAt,
  }) {
    return WaitingList(
      waiting: waiting ?? this.waiting,
      count: count ?? this.count,
      updatedAt: updatedAt ?? this.updatedAt,
    );
  }

  // 待機リストの状態を取得
  List<String> get waitingUserIds => waiting.keys.toList();
  bool isUserWaiting(String userId) => waiting.containsKey(userId);
  int get actualCount => waiting.length;
  
  // 待機リストに追加
  WaitingList addUser(String userId, {String? pokerName, int? order}) {
    final newWaiting = Map<String, WaitingUserData>.from(waiting);
    final newOrder = order ?? (waiting.isEmpty ? 1 : waiting.values.map((w) => w.order).reduce((a, b) => a > b ? a : b) + 1);
    newWaiting[userId] = WaitingUserData(
      pokerName: pokerName ?? 'ユーザー$userId',
      joinedAt: DateTime.now(),
      order: newOrder,
    );
    return copyWith(
      waiting: newWaiting,
      count: newWaiting.length,
    );
  }

  // 待機リストから削除
  WaitingList removeUser(String userId) {
    final newWaiting = Map<String, WaitingUserData>.from(waiting);
    newWaiting.remove(userId);
    return copyWith(
      waiting: newWaiting,
      count: newWaiting.length,
    );
  }

  // 待機リストをorderでソート
  List<MapEntry<String, WaitingUserData>> get sortedWaiting {
    final entries = waiting.entries.toList();
    entries.sort((a, b) => a.value.order.compareTo(b.value.order));
    return entries;
  }
}
