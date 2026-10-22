import 'seat_data.dart';

/// `scheduledTournaments/.../tablesSeat` の `seats` フラットマップを、
/// **seatXX 単位（1 席 = UserId + PokerName + OkibakeEntryId）**で解釈する。
///
/// Firestore の `seat01UserId` / `seat01PokerName` / `seat01OkibakeEntryId` は
/// 別席ではなく **seat01 という 1 席の属性**として扱う。
class ScheduledTournamentSeatMap {
  ScheduledTournamentSeatMap._();

  static String _nn(int seatNumber) => seatNumber.toString().padLeft(2, '0');

  /// Functions の `assignOkibakeTemporaryEntryToSeat` / `seatKey` の canonical（`seat01`…`seat09`, `seat10`…）。
  static String canonicalSeatKeyFromSeatNumber(int seatNumber) =>
      'seat${_nn(seatNumber)}';

  static String? _asNullableString(Object? v) {
    if (v == null) return null;
    if (v is! String) return null;
    final trimmed = v.trim();
    if (trimmed.isEmpty) return null;
    return trimmed;
  }

  /// [seatsFlat] から [seatNumber]（1 始まり）の 1 席分を [SeatData] にまとめる。
  static SeatData seatDataAt(Map<String, dynamic> seatsFlat, int seatNumber) {
    final nn = _nn(seatNumber);
    return SeatData(
      userId: _asNullableString(seatsFlat['seat${nn}UserId']),
      pokerName: _asNullableString(seatsFlat['seat${nn}PokerName']),
      okibakeEntryId: _asNullableString(seatsFlat['seat${nn}OkibakeEntryId']),
    );
  }

  static bool isOccupiedAt(Map<String, dynamic> seatsFlat, int seatNumber) =>
      seatDataAt(seatsFlat, seatNumber).isOccupied;

  /// `seat` + 番号 + 接尾辞 から見つかった最大席番号。見つからなければ null。
  static int? inferMaxSeatNumber(Map<String, dynamic> seatsFlat) {
    final re = RegExp(r'^seat(\d{1,2})(UserId|PokerName|OkibakeEntryId)$');
    var maxN = 0;
    for (final key in seatsFlat.keys) {
      final m = re.firstMatch(key.toString());
      if (m != null) {
        final n = int.tryParse(m.group(1)!) ?? 0;
        if (n > maxN) maxN = n;
      }
    }
    return maxN == 0 ? null : maxN;
  }

  /// 着席数（seat01 … seat[maxSeats] を **席単位で 1 回ずつ**数える）。
  static int occupiedCount(Map<String, dynamic> seatsFlat, int maxSeats) {
    var c = 0;
    for (var i = 1; i <= maxSeats; i++) {
      if (isOccupiedAt(seatsFlat, i)) c++;
    }
    return c;
  }

  /// `seat*UserId` または `seat*OkibakeEntryId` が1つでもあれば true。
  ///
  /// Cloud Functions `removeTableFromTournament` の occupied 判定と同じ基準。
  static bool hasOccupiedTournamentSeat(Map<String, dynamic> seatsFlat) {
    for (final entry in seatsFlat.entries) {
      final key = entry.key.toString();
      if (!key.endsWith('UserId') && !key.endsWith('OkibakeEntryId')) {
        continue;
      }
      if (_asNullableString(entry.value) != null) {
        return true;
      }
    }
    return false;
  }

  /// 卓の全席が空いているか（UserId / OkibakeEntryId いずれも未設定）。
  static bool isTournamentTableEmpty(Map<String, dynamic> seatsFlat) =>
      !hasOccupiedTournamentSeat(seatsFlat);

  /// `maxSeats` と seats フラットから卓の席数 N（1〜99）を求める。
  ///
  /// ドキュメント値が無い・0・パース不可のときは、[inferMaxSeatNumber] か
  /// [fallbackWhenUnresolved] を使う。
  static int resolvedTableMaxSeats(
    dynamic maxSeatsRaw,
    Map<String, dynamic> seatsFlat, {
    int fallbackWhenUnresolved = 6,
  }) {
    if (maxSeatsRaw is num) {
      final n = maxSeatsRaw.toInt();
      if (n > 0) return n.clamp(1, 99);
    } else if (maxSeatsRaw is String) {
      final parsed = int.tryParse(maxSeatsRaw);
      if (parsed != null && parsed > 0) return parsed.clamp(1, 99);
    }
    final inferred = inferMaxSeatNumber(seatsFlat);
    final base = inferred ?? fallbackWhenUnresolved;
    return base.clamp(1, 99);
  }
}
