import 'package:flutter_test/flutter_test.dart';
import 'package:amuse_app_template/tournament/active/models/scheduled_tournament_seat_map.dart';

void main() {
  group('ScheduledTournamentSeatMap', () {
    test('seatDataAt は同一 seat に UserId/PokerName/Okibake をまとめる', () {
      final flat = <String, dynamic>{
        'seat03UserId': null,
        'seat03PokerName': 'O',
        'seat03OkibakeEntryId': 'e99',
      };
      final s = ScheduledTournamentSeatMap.seatDataAt(flat, 3);
      expect(s.userId, isNull);
      expect(s.pokerName, 'O');
      expect(s.okibakeEntryId, 'e99');
      expect(s.isOccupied, true);
    });

    test('inferMaxSeatNumber は Okibake キーからも番号を拾う', () {
      final flat = <String, dynamic>{
        'seat05OkibakeEntryId': 'x',
      };
      expect(ScheduledTournamentSeatMap.inferMaxSeatNumber(flat), 5);
    });

    test('resolvedTableMaxSeats は文字列の maxSeats を解釈できる', () {
      final flat = <String, dynamic>{};
      expect(
        ScheduledTournamentSeatMap.resolvedTableMaxSeats('9', flat),
        9,
      );
    });

    test('canonicalSeatKeyFromSeatNumber は seat01 形式', () {
      expect(
        ScheduledTournamentSeatMap.canonicalSeatKeyFromSeatNumber(1),
        'seat01',
      );
      expect(
        ScheduledTournamentSeatMap.canonicalSeatKeyFromSeatNumber(10),
        'seat10',
      );
    });

    test(
        'occupiedCount は seat01..max を席単位で数え、pokerName だけでは増えない',
        () {
      final flat = <String, dynamic>{
        'seat01UserId': 'u',
        'seat01PokerName': 'A',
        'seat02PokerName': '名前だけ',
      };
      expect(
        ScheduledTournamentSeatMap.occupiedCount(flat, 9),
        1,
      );
    });
  });
}
