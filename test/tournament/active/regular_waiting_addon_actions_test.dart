import 'package:flutter_test/flutter_test.dart';
import 'package:amuse_app_template/tournament/active/tournament_service.dart';

void main() {
  group('MockTournamentService applyUserAddon', () {
    test('待機中通常ユーザー Addon が成功結果を返す', () async {
      final svc = MockTournamentService();
      final result = await svc.applyUserAddon(
        tournamentId: 't1',
        userId: 'user-wait-1',
        pokerName: '太郎',
      );
      expect(result.success, true);
    });
  });
}
