import 'package:amuse_app_template/tournament/active/utils/tournament_prize_participant_count.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('resolveTournamentPrizeParticipantCount', () {
    test('entries + reentries を返す', () {
      expect(
        resolveTournamentPrizeParticipantCount({
          'entries': 5,
          'reentries': 2,
        }),
        7,
      );
    });

    test('置きバケは entries に含まれる前提で合算される', () {
      expect(
        resolveTournamentPrizeParticipantCount({
          'entries': 3,
          'reentries': 0,
        }),
        3,
      );
    });

    test('欠損時は 0 として扱う', () {
      expect(resolveTournamentPrizeParticipantCount(null), 0);
      expect(resolveTournamentPrizeParticipantCount({}), 0);
    });
  });
}
