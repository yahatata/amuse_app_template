import 'package:flutter_test/flutter_test.dart';
import 'package:amuse_app_template/tournament/active/models/seat_data.dart';

void main() {
  group('SeatData.isOccupied / isOkibakeSeat', () {
    test('userId のみで occupied', () {
      final s = SeatData(userId: 'u1', pokerName: null, okibakeEntryId: null);
      expect(s.isOccupied, true);
      expect(s.isOkibakeSeat, false);
    });

    test('okibakeEntryId のみでも occupied（userId が null でよい）', () {
      final s = SeatData(
        userId: null,
        pokerName: 'オキバケA',
        okibakeEntryId: 'ent1',
      );
      expect(s.isOccupied, true);
      expect(s.isOkibakeSeat, true);
    });

    test('userId と okibakeEntryId 両方ある席は通常ユーザー席を優先', () {
      final s = SeatData(
        userId: 'u1',
        pokerName: '山田',
        okibakeEntryId: 'ent1',
      );
      expect(s.isOccupied, true);
      expect(s.isOkibakeSeat, false);
    });

    test('userId と okibake がない席は empty', () {
      final s = SeatData(userId: null, pokerName: null, okibakeEntryId: null);
      expect(s.isOccupied, false);
    });

    test('pokerName のみでは occupied にしない', () {
      final s = SeatData(
        userId: null,
        pokerName: '名前のみ',
        okibakeEntryId: null,
      );
      expect(s.isOccupied, false);
    });

    test('空文字は占有とみなさない', () {
      final s = SeatData(userId: '', okibakeEntryId: '');
      expect(s.isOccupied, false);
      expect(s.isOkibakeSeat, false);
    });
  });

  group('SeatData serialization', () {
    test('fromMap / toMap で okibakeEntryId が往復できる', () {
      final original = SeatData(
        userId: 'u',
        pokerName: '名前',
        okibakeEntryId: null,
      );
      final roundTrip = SeatData.fromMap(original.toMap());
      expect(roundTrip, original);
    });
  });
}
