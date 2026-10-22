import 'package:amuse_app_template/tournament/active/utils/tournament_result_entries.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('parseTournamentResultSummary', () {
    test('returns empty summary when mainViewData is null', () {
      final summary = parseTournamentResultSummary(null);

      expect(summary.prizeReceiverCount, 0);
      expect(summary.entries, isEmpty);
      expect(summary.hasAnyRankedPlayer, isFalse);
    });

    test('parses ranked players in order', () {
      final summary = parseTournamentResultSummary({
        'prizeReceiverCount': 3,
        'prizePool': 30000,
        'pointType': 'pointB',
        '1stPlayerName': 'Alice',
        '1stPlayerUid': 'uid-a',
        '1stPrize': 15000,
        '2ndPlayerName': 'Bob',
        '2ndPlayerUid': 'uid-b',
        '2ndPrize': 10000,
        '3rdPlayerName': 'Carol',
        '3rdPlayerUid': 'uid-c',
        '3rdPrize': 5000,
      });

      expect(summary.prizePool, 30000);
      expect(summary.pointType, 'pointB');
      expect(summary.prizeReceiverCount, 3);
      expect(summary.hasAnyRankedPlayer, isTrue);
      expect(summary.entries.map((e) => e.rank), [1, 2, 3]);
      expect(summary.entries.first.playerName, 'Alice');
      expect(summary.entries.first.prizeAmount, 15000);
    });

    test('detects missing ranked players', () {
      final summary = parseTournamentResultSummary({
        'prizeReceiverCount': 2,
        'prizePool': 10000,
        '1stPrize': 7000,
        '2ndPrize': 3000,
      });

      expect(summary.hasPrizeStructure, isTrue);
      expect(summary.hasAnyRankedPlayer, isFalse);
      expect(summary.entries.length, 2);
    });
  });

  group('formatYenAmount', () {
    test('formats with comma separators', () {
      expect(formatYenAmount(15000), '¥15,000');
    });
  });
}
