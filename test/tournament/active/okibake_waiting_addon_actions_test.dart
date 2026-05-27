import 'package:flutter_test/flutter_test.dart';
import 'package:amuse_app_template/tournament/active/tournament_service.dart';

void main() {
  group('MockTournamentService applyOkibakeAddon', () {
    test('待機中置きバケ Addon が成功結果を返す', () async {
      final svc = MockTournamentService();
      final result = await svc.applyOkibakeAddon(
        tournamentId: 't1',
        okibakeEntryId: 'okibake-wait-1',
      );
      expect(result.success, true);
    });
  });
}
