import 'package:amuse_app_template/tournament/active/utils/tournament_tables_seat_display.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('shouldShowTablesSeatDoc', () {
    test('waiting / busted は常に非表示', () {
      expect(
        shouldShowTablesSeatDoc(
          docId: 'waiting',
          data: {'isEnabled': true},
          tournamentStatus: 'running',
        ),
        isFalse,
      );
      expect(
        shouldShowTablesSeatDoc(
          docId: 'busted',
          data: {'isEnabled': true},
          tournamentStatus: 'ended',
        ),
        isFalse,
      );
    });

    test('開催中は isEnabled=false を非表示', () {
      expect(
        shouldShowTablesSeatDoc(
          docId: 'table_1',
          data: {'isEnabled': false},
          tournamentStatus: 'running',
        ),
        isFalse,
      );
      expect(
        shouldShowTablesSeatDoc(
          docId: 'table_1',
          data: {'isEnabled': true},
          tournamentStatus: 'registered',
        ),
        isTrue,
      );
    });

    test('終了後は isEnabled=false も表示', () {
      expect(
        shouldShowTablesSeatDoc(
          docId: 'table_1',
          data: {'isEnabled': false},
          tournamentStatus: 'ended',
        ),
        isTrue,
      );
      expect(
        shouldShowTablesSeatDoc(
          docId: 'table_1',
          data: {'isEnabled': false},
          tournamentStatus: 'force_ended',
        ),
        isTrue,
      );
    });
  });
}
