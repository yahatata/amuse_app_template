import 'package:amuse_app_template/tournament/active/models/okibake_temporary_entry.dart';
import 'package:amuse_app_template/tournament/active/widgets/dialogs/okibake_list_dialog.dart';
import 'package:flutter_test/flutter_test.dart';

OkibakeTemporaryEntry _entry({
  required String id,
  required String status,
  required String billLink,
  DateTime? createdAt,
}) {
  return OkibakeTemporaryEntry(
    okibakeEntryId: id,
    tournamentId: 't1',
    temporaryDisplayName: id,
    entryStatus: status,
    billLinkStatus: billLink,
    createdAt: createdAt,
  );
}

void main() {
  group('filterOkibakeListEntries', () {
    test('linked / voided / pending_review は除外され registered/seated/busted の unlinked のみ残る',
        () {
      final src = [
        _entry(id: 'r1', status: 'registered', billLink: 'unlinked'),
        _entry(id: 'r2', status: 'registered', billLink: 'linked'),
        _entry(id: 'r3', status: 'registered', billLink: 'pending_review'),
        _entry(id: 's1', status: 'seated', billLink: 'unlinked'),
        _entry(id: 's2', status: 'seated', billLink: 'linked'),
        _entry(id: 'b1', status: 'busted', billLink: 'unlinked'),
        _entry(id: 'b2', status: 'busted', billLink: 'linked'),
        _entry(id: 'v1', status: 'voided', billLink: 'unlinked'),
      ];
      final result = filterOkibakeListEntries(src).map((e) => e.okibakeEntryId).toList();
      expect(result, containsAll(['r1', 's1', 'b1']));
      expect(result, isNot(contains('r2')));
      expect(result, isNot(contains('r3')));
      expect(result, isNot(contains('s2')));
      expect(result, isNot(contains('b2')));
      expect(result, isNot(contains('v1')));
      expect(result.length, 3);
    });

    test('状態順 registered → seated → busted で並ぶ', () {
      final src = [
        _entry(id: 'b1', status: 'busted', billLink: 'unlinked'),
        _entry(id: 's1', status: 'seated', billLink: 'unlinked'),
        _entry(id: 'r1', status: 'registered', billLink: 'unlinked'),
      ];
      final ids = filterOkibakeListEntries(src).map((e) => e.okibakeEntryId).toList();
      expect(ids, ['r1', 's1', 'b1']);
    });

    test('同状態内では createdAt 降順（新しい順）', () {
      final src = [
        _entry(
            id: 'r-old',
            status: 'registered',
            billLink: 'unlinked',
            createdAt: DateTime(2026, 1, 1)),
        _entry(
            id: 'r-new',
            status: 'registered',
            billLink: 'unlinked',
            createdAt: DateTime(2026, 5, 1)),
      ];
      final ids = filterOkibakeListEntries(src).map((e) => e.okibakeEntryId).toList();
      expect(ids, ['r-new', 'r-old']);
    });
  });
}
