// Firestoreから読み込むトーナメントデータのモデル
import 'seat_data.dart';

class TournamentTable {
  final String tableId;
  final String name;
  final int maxSeats;
  final String status;
  final bool isEnabled;
  final Map<String, SeatData?> seats; // seat01UserId: SeatData, seat01PokerName: SeatData, ...
  final DateTime? createdAt;
  final DateTime? updatedAt;

  TournamentTable({
    required this.tableId,
    required this.name,
    required this.maxSeats,
    required this.status,
    required this.isEnabled,
    required this.seats,
    this.createdAt,
    this.updatedAt,
  });

  factory TournamentTable.fromFirestore(Map<String, dynamic> data, String tableId) {
    final seatsData = data['seats'] as Map<String, dynamic>? ?? {};
    final seats = <String, SeatData?>{};
    
    // 新しい形式: seatXXUserId, seatXXPokerName
    final seatNumbers = <int>{};
    seatsData.keys.forEach((key) {
      if (key.startsWith('seat') && key.endsWith('UserId')) {
        final seatNo = int.tryParse(key.substring(4, key.length - 6)); // "seat" + number + "UserId"
        if (seatNo != null) {
          seatNumbers.add(seatNo);
        }
      }
    });
    
    for (final seatNo in seatNumbers) {
      final seatNumber = seatNo.toString().padLeft(2, '0');
      final userIdKey = 'seat${seatNumber}UserId';
      final pokerNameKey = 'seat${seatNumber}PokerName';
      
      final userId = seatsData[userIdKey] as String?;
      final pokerName = seatsData[pokerNameKey] as String?;
      
      if (userId != null && userId.isNotEmpty) {
        seats[userIdKey] = SeatData(userId: userId, pokerName: pokerName);
        seats[pokerNameKey] = SeatData(userId: userId, pokerName: pokerName);
      } else {
        seats[userIdKey] = null;
        seats[pokerNameKey] = null;
      }
    }
    
    return TournamentTable(
      tableId: tableId,
      name: data['name'] ?? 'テーブル$tableId',
      maxSeats: data['maxSeats'] ?? 6,
      status: data['status'] ?? 'open',
      isEnabled: data['isEnabled'] ?? true,
      seats: seats,
      createdAt: data['createdAt']?.toDate(),
      updatedAt: data['updatedAt']?.toDate(),
    );
  }

  // 空席数を取得
  int get availableSeats {
    return seats.values.where((userId) => userId == null).length;
  }

  // 着席者数を取得
  int get occupiedSeats {
    return seats.values.where((userId) => userId != null).length;
  }

  // 特定のシートが空いているかチェック
  bool isSeatAvailable(int seatNumber) {
    final seatNumberStr = seatNumber.toString().padLeft(2, '0');
    final seatKey = 'seat${seatNumberStr}UserId';
    return seats[seatKey] == null;
  }

  // 特定のシートのユーザーIDを取得
  String? getSeatUserId(int seatNumber) {
    final seatNumberStr = seatNumber.toString().padLeft(2, '0');
    final seatKey = 'seat${seatNumberStr}UserId';
    return seats[seatKey]?.userId;
  }

  // 特定のシートのポーカー名を取得
  String? getSeatPokerName(int seatNumber) {
    final seatNumberStr = seatNumber.toString().padLeft(2, '0');
    final seatKey = 'seat${seatNumberStr}PokerName';
    return seats[seatKey]?.pokerName;
  }
}

class TournamentUser {
  final String userId;
  final String displayName;
  final bool isSeated;
  final bool isBusted;
  final String? tableId;
  final int? seatNo;
  final int pointA;
  final int pointB;
  final int pointC;
  final int entryCount;
  final int reentryCount;
  final int addonCount;
  final DateTime? createdAt;
  final DateTime? updatedAt;

  TournamentUser({
    required this.userId,
    required this.displayName,
    required this.isSeated,
    required this.isBusted,
    this.tableId,
    this.seatNo,
    required this.pointA,
    required this.pointB,
    required this.pointC,
    required this.entryCount,
    required this.reentryCount,
    required this.addonCount,
    this.createdAt,
    this.updatedAt,
  });

  factory TournamentUser.fromFirestore(Map<String, dynamic> data, String userId) {
    return TournamentUser(
      userId: userId,
      displayName: data['displayName'] ?? 'ユーザー$userId',
      isSeated: data['isSeated'] ?? false,
      isBusted: data['isBusted'] ?? false,
      tableId: data['tableId'],
      seatNo: data['seatNo'],
      pointA: data['pointA'] ?? 0,
      pointB: data['pointB'] ?? 0,
      pointC: data['pointC'] ?? 0,
      entryCount: data['entryCount'] ?? 1,
      reentryCount: data['reentryCount'] ?? 0,
      addonCount: data['addonCount'] ?? 0,
      createdAt: data['createdAt']?.toDate(),
      updatedAt: data['updatedAt']?.toDate(),
    );
  }
}

class WaitingPlayer {
  final String userId;
  final String displayName;
  final DateTime joinedAt;
  final int waitingMinutes;

  WaitingPlayer({
    required this.userId,
    required this.displayName,
    required this.joinedAt,
  }) : waitingMinutes = DateTime.now().difference(joinedAt).inMinutes;

  factory WaitingPlayer.fromFirestore(String userId, Map<String, dynamic> userData) {
    return WaitingPlayer(
      userId: userId,
      displayName: userData['displayName'] ?? 'ユーザー$userId',
      joinedAt: userData['joinedAt']?.toDate() ?? DateTime.now(),
    );
  }
}
