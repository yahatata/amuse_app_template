import 'scheduled_tournament_seat_map.dart';
import 'seat_data.dart';

class TableSeats {
  final String tableId;

  /// 席番号（1 始まり）→ 1 席分のデータ（[SeatData.isOccupied] が false の空席もここに入る）
  final Map<int, SeatData> seats;
  final DateTime updatedAt;

  TableSeats({
    required this.tableId,
    required this.seats,
    required this.updatedAt,
  });

  factory TableSeats.fromMap(Map<String, dynamic> map) {
    final seatsDataRaw = map['seats'];
    final seatsData = seatsDataRaw is Map<String, dynamic>
        ? Map<String, dynamic>.from(seatsDataRaw)
        : <String, dynamic>{};

    final safeMaxSeats =
        ScheduledTournamentSeatMap.resolvedTableMaxSeats(
      map['maxSeats'],
      seatsData,
      fallbackWhenUnresolved: 6,
    );

    final seatsMap = <int, SeatData>{
      for (var i = 1; i <= safeMaxSeats; i++)
        i: ScheduledTournamentSeatMap.seatDataAt(seatsData, i),
    };

    final updatedParsed = DateTime.tryParse(map['updatedAt']?.toString() ?? '');
    final updatedAt =
        updatedParsed ?? DateTime.fromMillisecondsSinceEpoch(0);

    return TableSeats(
      tableId: map['tableId']?.toString() ?? '',
      seats: seatsMap,
      updatedAt: updatedAt,
    );
  }

  Map<String, dynamic> toMap() {
    final seatsMap = <String, dynamic>{};
    seats.forEach((seatNo, seatData) {
      final seatNumber = seatNo.toString().padLeft(2, '0');
      seatsMap['seat${seatNumber}UserId'] = seatData.userId;
      seatsMap['seat${seatNumber}PokerName'] = seatData.pokerName;
      seatsMap['seat${seatNumber}OkibakeEntryId'] = seatData.okibakeEntryId;
    });

    return {
      'tableId': tableId,
      'maxSeats': seats.length,
      'seats': seatsMap,
      'updatedAt': updatedAt.toIso8601String(),
    };
  }

  TableSeats copyWith({
    String? tableId,
    Map<int, SeatData>? seats,
    DateTime? updatedAt,
  }) {
    return TableSeats(
      tableId: tableId ?? this.tableId,
      seats: seats ?? Map<int, SeatData>.from(this.seats),
      updatedAt: updatedAt ?? this.updatedAt,
    );
  }

  bool isSeatOccupied(int seatNo) => seats[seatNo]?.isOccupied ?? false;
  String? getUserIdAtSeat(int seatNo) => seats[seatNo]?.userId;
  String? getPokerNameAtSeat(int seatNo) => seats[seatNo]?.pokerName;
  String? getOkibakeEntryIdAtSeat(int seatNo) =>
      seats[seatNo]?.okibakeEntryId;
  SeatData? getSeatData(int seatNo) => seats[seatNo];

  int get occupiedSeatCount =>
      seats.values.where((SeatData seatData) => seatData.isOccupied).length;
  int get totalSeatCount => seats.length;
  int get availableSeatCount => totalSeatCount - occupiedSeatCount;
}
