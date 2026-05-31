// Firestoreから読み込むトーナメントデータのモデル
import 'scheduled_tournament_seat_map.dart';
import 'seat_data.dart';

class TournamentTable {
  final String tableId;
  final String name;
  final int maxSeats;
  final String status;
  final bool isEnabled;

  /// 席番号（1 始まり）→ seatXX 単位でまとめた 1 席のデータ
  final Map<int, SeatData> seats;

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

  factory TournamentTable.fromFirestore(
    Map<String, dynamic> data,
    String tableId,
  ) {
    final seatsDataRaw = data['seats'];
    final seatsData = seatsDataRaw is Map<String, dynamic>
        ? Map<String, dynamic>.from(seatsDataRaw)
        : <String, dynamic>{};

    final safeMaxSeats = ScheduledTournamentSeatMap.resolvedTableMaxSeats(
      data['maxSeats'],
      seatsData,
      fallbackWhenUnresolved: 6,
    );

    final seatsByNumber = <int, SeatData>{
      for (var i = 1; i <= safeMaxSeats; i++)
        i: ScheduledTournamentSeatMap.seatDataAt(seatsData, i),
    };

    return TournamentTable(
      tableId: tableId,
      name: data['name'] ?? 'テーブル$tableId',
      maxSeats: safeMaxSeats,
      status: data['status'] ?? 'open',
      isEnabled: data['isEnabled'] ?? true,
      seats: seatsByNumber,
      createdAt: data['createdAt']?.toDate(),
      updatedAt: data['updatedAt']?.toDate(),
    );
  }

  SeatData seatAt(int seatNumber) => seats[seatNumber] ?? SeatData();

  bool getSeatOccupied(int seatNumber) =>
      seats[seatNumber]?.isOccupied ?? false;

  /// 通常ユーザーまたは置きバケを含む着席済み席の数（1 席につき 1 カウント）
  int get occupiedSeats =>
      seats.values.where((SeatData s) => s.isOccupied).length;

  int get availableSeats =>
      seats.values.where((SeatData s) => !s.isOccupied).length;

  bool isSeatAvailable(int seatNumber) =>
      !(seats[seatNumber]?.isOccupied ?? false);

  String? getSeatUserId(int seatNumber) => seats[seatNumber]?.userId;

  String? getSeatPokerName(int seatNumber) => seats[seatNumber]?.pokerName;

  String? getSeatOkibakeEntryId(int seatNumber) =>
      seats[seatNumber]?.okibakeEntryId;
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

  factory TournamentUser.fromFirestore(
    Map<String, dynamic> data,
    String userId,
  ) {
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

  /// Phase2 置きバケ一時参加者行。着席・アサイン Callable は別フェーズ。
  final bool isOkibakeTemporary;

  /// `isOkibakeTemporary` のときのみ。`assignOkibakeTemporaryEntryToSeat` に渡す ID。
  final String? okibakeEntryId;

  /// `isOkibakeTemporary` のときのみ。`okibakeTemporaryEntries.okibakeAddonCount`。
  final int okibakeAddonCount;

  /// `isOkibakeTemporary` のときのみ。`okibakeTemporaryEntries.billLinkStatus`。
  final String? okibakeBillLinkStatus;

  /// `isOkibakeTemporary` のときのみ。未設定なら対象ユーザー設定が可能。
  final String? okibakeLinkedUserId;

  WaitingPlayer({
    required this.userId,
    required this.displayName,
    required this.joinedAt,
    this.isOkibakeTemporary = false,
    this.okibakeEntryId,
    this.okibakeAddonCount = 0,
    this.okibakeBillLinkStatus,
    this.okibakeLinkedUserId,
  }) : waitingMinutes = DateTime.now().difference(joinedAt).inMinutes;

  /// Firestore `okibakeTemporaryEntries/{okibakeEntryId}` の待機表示用。
  factory WaitingPlayer.okibakeTemporary({
    required String okibakeEntryId,
    required String displayName,
    required DateTime createdAt,
    int okibakeAddonCount = 0,
    String billLinkStatus = 'unlinked',
    String? linkedUserId,
  }) {
    return WaitingPlayer(
      userId: 'okibakeTemporary:$okibakeEntryId',
      displayName: displayName,
      joinedAt: createdAt,
      isOkibakeTemporary: true,
      okibakeEntryId: okibakeEntryId,
      okibakeAddonCount: okibakeAddonCount,
      okibakeBillLinkStatus: billLinkStatus,
      okibakeLinkedUserId: linkedUserId,
    );
  }

  factory WaitingPlayer.fromFirestore(
    String userId,
    Map<String, dynamic> userData,
  ) {
    return WaitingPlayer(
      userId: userId,
      displayName: userData['displayName'] ?? 'ユーザー$userId',
      joinedAt: userData['joinedAt']?.toDate() ?? DateTime.now(),
    );
  }
}
