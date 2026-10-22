import 'package:flutter_test/flutter_test.dart';
import 'package:amuse_app_template/tournament/active/utils/tournament_read_only.dart';

void main() {
  group('tournament_read_only', () {
    test('isTournamentReadOnlyStatus', () {
      expect(isTournamentReadOnlyStatus('ended'), true);
      expect(isTournamentReadOnlyStatus('force_ended'), true);
      expect(isTournamentReadOnlyStatus('running'), false);
      expect(isTournamentReadOnlyStatus('cancelled'), false);
      expect(isTournamentReadOnlyStatus(null), false);
    });

    test('tournamentReadOnlyBannerMessage', () {
      expect(
        tournamentReadOnlyBannerMessage('ended'),
        contains('終了済み'),
      );
      expect(
        tournamentReadOnlyBannerMessage('force_ended'),
        contains('強制終了済み'),
      );
    });
  });
}
