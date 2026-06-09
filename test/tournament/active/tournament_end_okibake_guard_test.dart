import 'package:amuse_app_template/tournament/active/utils/tournament_end_okibake_guard.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('TournamentEndOkibakeGuard.parseBlockingOkibakeEntries', () {
    test('有効な blockingOkibakeEntries をパースする', () {
      final entries = TournamentEndOkibakeGuard.parseBlockingOkibakeEntries([
        {
          'okibakeEntryId': ' ok-1 ',
          'displayName': 'オキバケA',
          'entryStatus': 'busted',
        },
        {
          'okibakeEntryId': 'ok-2',
          'displayName': '',
          'entryStatus': 'registered',
        },
      ]);

      expect(entries, hasLength(2));
      expect(entries[0].okibakeEntryId, 'ok-1');
      expect(entries[0].displayName, 'オキバケA');
      expect(entries[0].entryStatusLabel, '退席済み');
      expect(entries[1].displayName, isEmpty);
      expect(entries[1].entryStatusLabel, '待機中');
    });

    test('okibakeEntryId が空の要素は除外する', () {
      final entries = TournamentEndOkibakeGuard.parseBlockingOkibakeEntries([
        {'okibakeEntryId': '', 'displayName': 'x', 'entryStatus': 'busted'},
        {'displayName': 'y', 'entryStatus': 'busted'},
      ]);

      expect(entries, isEmpty);
    });

    test('List 以外は空リストを返す', () {
      expect(
        TournamentEndOkibakeGuard.parseBlockingOkibakeEntries(null),
        isEmpty,
      );
      expect(
        TournamentEndOkibakeGuard.parseBlockingOkibakeEntries('invalid'),
        isEmpty,
      );
    });
  });
}
