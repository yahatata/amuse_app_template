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

    group('isTournamentTableEmpty / hasOccupiedTournamentSeat', () {
      test('seat*UserId も seat*OkibakeEntryId もない → 空卓', () {
        final flat = <String, dynamic>{
          'seat01UserId': null,
          'seat01OkibakeEntryId': null,
          'seat02PokerName': '名前だけ',
        };
        expect(ScheduledTournamentSeatMap.isTournamentTableEmpty(flat), isTrue);
        expect(
          ScheduledTournamentSeatMap.hasOccupiedTournamentSeat(flat),
          isFalse,
        );
      });

      test('seat1UserId がある → 空卓ではない', () {
        final flat = <String, dynamic>{'seat01UserId': 'user-1'};
        expect(ScheduledTournamentSeatMap.isTournamentTableEmpty(flat), isFalse);
      });

      test('seat1OkibakeEntryId がある → 空卓ではない', () {
        final flat = <String, dynamic>{
          'seat01OkibakeEntryId': 'okibake-1',
        };
        expect(ScheduledTournamentSeatMap.isTournamentTableEmpty(flat), isFalse);
      });

      test('seat1UserId が null でも seat1OkibakeEntryId がある → 空卓ではない', () {
        final flat = <String, dynamic>{
          'seat01UserId': null,
          'seat01OkibakeEntryId': 'okibake-1',
        };
        expect(ScheduledTournamentSeatMap.isTournamentTableEmpty(flat), isFalse);
      });

      test('seat1UserId が空文字でも seat1OkibakeEntryId がある → 空卓ではない', () {
        final flat = <String, dynamic>{
          'seat01UserId': '',
          'seat01OkibakeEntryId': 'okibake-1',
        };
        expect(ScheduledTournamentSeatMap.isTournamentTableEmpty(flat), isFalse);
      });

      test('複数席のどこかに OkibakeEntryId がある → 空卓ではない', () {
        final flat = <String, dynamic>{
          'seat01UserId': null,
          'seat02OkibakeEntryId': 'okibake-2',
        };
        expect(ScheduledTournamentSeatMap.isTournamentTableEmpty(flat), isFalse);
      });

      test('OkibakeEntryId が null / 空文字のみ → 空卓', () {
        final flat = <String, dynamic>{
          'seat01UserId': null,
          'seat01OkibakeEntryId': '',
          'seat02OkibakeEntryId': null,
        };
        expect(ScheduledTournamentSeatMap.isTournamentTableEmpty(flat), isTrue);
      });

      test('seat1UserId = 空白文字のみ → 空卓', () {
        final flat = <String, dynamic>{'seat01UserId': '   '};
        expect(ScheduledTournamentSeatMap.isTournamentTableEmpty(flat), isTrue);
      });

      test('seat1OkibakeEntryId = 空白文字のみ → 空卓', () {
        final flat = <String, dynamic>{'seat01OkibakeEntryId': '   '};
        expect(ScheduledTournamentSeatMap.isTournamentTableEmpty(flat), isTrue);
      });

      test('seat1UserId = 前後空白付き有効値 → 空卓ではない', () {
        final flat = <String, dynamic>{'seat01UserId': ' user_1 '};
        expect(ScheduledTournamentSeatMap.isTournamentTableEmpty(flat), isFalse);
      });

      test('seat1OkibakeEntryId = 前後空白付き有効値 → 空卓ではない', () {
        final flat = <String, dynamic>{'seat01OkibakeEntryId': ' okibake_1 '};
        expect(ScheduledTournamentSeatMap.isTournamentTableEmpty(flat), isFalse);
      });
    });
  });
}
