import 'package:flutter_test/flutter_test.dart';
import 'package:amuse_app_template/tournament/active/tournament_service.dart';

void main() {
  group('AssignOkibakeTemporaryEntryToSeatResult.fromCallableData', () {
    test('success と replay を解釈する', () {
      final r = AssignOkibakeTemporaryEntryToSeatResult.fromCallableData({
        'success': true,
        'replay': true,
      });

      expect(r.success, true);
      expect(r.replay, true);
      expect(r.errorMessage, isNull);
    });

    test('応答が Map でないとき失敗とする', () {
      final r = AssignOkibakeTemporaryEntryToSeatResult.fromCallableData('bad');
      expect(r.success, false);
      expect(r.errorMessage, isNotNull);
    });
  });

  group('MockTournamentService.assignOkibakeTemporaryEntryToSeat', () {
    test('成功結果を返す', () async {
      final svc = MockTournamentService();
      final r = await svc.assignOkibakeTemporaryEntryToSeat(
        tournamentId: 't',
        okibakeEntryId: 'e',
        tableId: 'table1',
        seatKey: 'seat01',
      );
      expect(r.success, true);
    });
  });
}
