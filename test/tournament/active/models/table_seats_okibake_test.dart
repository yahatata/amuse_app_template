import 'package:flutter_test/flutter_test.dart';
import 'package:amuse_app_template/tournament/active/models/table_seats.dart';

void main() {
  group('TableSeats Okibake / seatXX 単位', () {
    test('seat01 に userId があれば 1 席として occupiedCount に含む', () {
      final ts = TableSeats.fromMap({
        'tableId': 't1',
        'maxSeats': 9,
        'seats': {
          'seat01UserId': 'user_a',
          'seat01PokerName': 'A',
          'seat02UserId': null,
        },
        'updatedAt': '2026-05-01T00:00:00.000',
      });

      expect(ts.occupiedSeatCount, 1);
      expect(ts.availableSeatCount, 8);
      expect(ts.getSeatData(1)?.userId, 'user_a');
      expect(ts.getSeatData(1)?.okibakeEntryId, isNull);
    });

    test('seat01 が okibake のみでも occupied とし、pokerName を保持する', () {
      final ts = TableSeats.fromMap({
        'tableId': 't2',
        'maxSeats': 9,
        'seats': {
          'seat01UserId': null,
          'seat01PokerName': 'オキバケA',
          'seat01OkibakeEntryId': 'obe1',
          'seat02UserId': null,
        },
        'updatedAt': '2026-05-01T00:00:00.000',
      });

      final s1 = ts.getSeatData(1)!;
      expect(s1.isOccupied, true);
      expect(s1.isOkibakeSeat, true);
      expect(s1.pokerName, 'オキバケA');
      expect(ts.occupiedSeatCount, 1);
    });

    test('userId あり + okibakeEntryId ありは通常席（link 後）', () {
      final ts = TableSeats.fromMap({
        'tableId': 't-linked',
        'maxSeats': 9,
        'seats': {
          'seat01UserId': 'user_linked',
          'seat01PokerName': '山田',
          'seat01OkibakeEntryId': 'obe1',
        },
        'updatedAt': '2026-05-01T00:00:00.000',
      });

      final s1 = ts.getSeatData(1)!;
      expect(s1.isOccupied, true);
      expect(s1.isOkibakeSeat, false);
      expect(s1.userId, 'user_linked');
    });

    test('seat01UserId と seat01PokerName は別席にならず二重カウントしない', () {
      final ts = TableSeats.fromMap({
        'tableId': 't3',
        'maxSeats': 6,
        'seats': {
          'seat01UserId': 'user_x',
          'seat01PokerName': 'Xさん',
        },
        'updatedAt': '2026-05-01T00:00:00.000',
      });

      expect(ts.occupiedSeatCount, 1);
      expect(ts.totalSeatCount, 6);
    });

    test('seat02OkibakeEntryId のみでも席番号を推論して読み取る（maxSeats 未指定でも）',
        () {
      final ts = TableSeats.fromMap({
        'tableId': 't4',
        'seats': {
          'seat02OkibakeEntryId': 'obeZ',
          'seat02PokerName': 'P',
        },
        'updatedAt': '2026-05-01T00:00:00.000',
      });

      expect(ts.totalSeatCount, greaterThanOrEqualTo(2));
      expect(ts.getSeatData(2)?.okibakeEntryId, 'obeZ');
      expect(ts.occupiedSeatCount, 1);
    });
  });
}
