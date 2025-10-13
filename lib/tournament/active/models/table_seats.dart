import 'seat_data.dart';

class TableSeats {
  final String tableId;
  final Map<int, SeatData?> seats; // seatNo -> SeatData (null = 空席)
  final DateTime updatedAt;

  TableSeats({
    required this.tableId,
    required this.seats,
    required this.updatedAt,
  });

  factory TableSeats.fromMap(Map<String, dynamic> map) {
    final seatsMap = <int, SeatData?>{};
    if (map['seats'] != null) {
      final seatsData = map['seats'] as Map<String, dynamic>;
      
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
        final userIdKey = 'seat${seatNo.toString().padLeft(2, '0')}UserId';
        final pokerNameKey = 'seat${seatNo.toString().padLeft(2, '0')}PokerName';
        
        final userId = seatsData[userIdKey] as String?;
        final pokerName = seatsData[pokerNameKey] as String?;
        
        if (userId != null && userId.isNotEmpty) {
          seatsMap[seatNo] = SeatData(userId: userId, pokerName: pokerName);
        } else {
          seatsMap[seatNo] = null;
        }
      }
    }

    return TableSeats(
      tableId: map['tableId'] ?? '',
      seats: seatsMap,
      updatedAt: DateTime.parse(map['updatedAt']),
    );
  }

  Map<String, dynamic> toMap() {
    final seatsMap = <String, String?>{};
    seats.forEach((seatNo, seatData) {
      final seatNumber = seatNo.toString().padLeft(2, '0');
      seatsMap['seat${seatNumber}UserId'] = seatData?.userId;
      seatsMap['seat${seatNumber}PokerName'] = seatData?.pokerName;
    });

    return {
      'tableId': tableId,
      'seats': seatsMap,
      'updatedAt': updatedAt.toIso8601String(),
    };
  }

  TableSeats copyWith({
    String? tableId,
    Map<int, SeatData?>? seats,
    DateTime? updatedAt,
  }) {
    return TableSeats(
      tableId: tableId ?? this.tableId,
      seats: seats ?? this.seats,
      updatedAt: updatedAt ?? this.updatedAt,
    );
  }

  // 座席の状態を取得
  bool isSeatOccupied(int seatNo) => seats[seatNo]?.isOccupied ?? false;
  String? getUserIdAtSeat(int seatNo) => seats[seatNo]?.userId;
  String? getPokerNameAtSeat(int seatNo) => seats[seatNo]?.pokerName;
  SeatData? getSeatData(int seatNo) => seats[seatNo];
  int get occupiedSeatCount => seats.values.where((seatData) => seatData?.isOccupied ?? false).length;
  int get totalSeatCount => seats.length;
  int get availableSeatCount => totalSeatCount - occupiedSeatCount;
}
