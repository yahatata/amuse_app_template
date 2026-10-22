import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:amuse_app_template/tournament/active/models/okibake_temporary_entry.dart';

void main() {
  group('OkibakeTemporaryEntry.fromDoc', () {
    test('okibakeAddonCount を読み取れる', () {
      final entry = OkibakeTemporaryEntry.fromDoc(
        _FakeDoc(
          id: 'e1',
          rawData: {
            'tournamentId': 't1',
            'temporaryDisplayName': 'オキバケA',
            'entryStatus': 'registered',
            'billLinkStatus': 'unlinked',
            'okibakeAddonCount': 1,
            'createdAt': Timestamp.fromDate(DateTime(2026, 5, 1)),
          },
        ),
      );

      expect(entry.okibakeAddonCount, 1);
      expect(entry.isWaitingUnlinked, true);
    });

    test('waitingListDisplayName は linkedUserPokerName を優先する', () {
      final withLinked = OkibakeTemporaryEntry.fromDoc(
        _FakeDoc(
          id: 'e2',
          rawData: {
            'temporaryDisplayName': 'オキバケA',
            'linkedUserPokerName': '  リンク太郎  ',
            'entryStatus': 'registered',
            'billLinkStatus': 'unlinked',
          },
        ),
      );
      expect(withLinked.linkedUserPokerName, 'リンク太郎');
      expect(withLinked.waitingListDisplayName, 'リンク太郎');

      final withoutLinked = OkibakeTemporaryEntry.fromDoc(
        _FakeDoc(
          id: 'e3',
          rawData: {
            'temporaryDisplayName': 'オキバケB',
            'entryStatus': 'registered',
            'billLinkStatus': 'unlinked',
          },
        ),
      );
      expect(withoutLinked.waitingListDisplayName, 'オキバケB');
    });

    test('bustedAt を Timestamp から読み取る', () {
      final ts = DateTime(2026, 5, 27, 10, 30);
      final entry = OkibakeTemporaryEntry.fromDoc(
        _FakeDoc(
          id: 'e10',
          rawData: {
            'temporaryDisplayName': 'オキバケ',
            'entryStatus': 'busted',
            'billLinkStatus': 'unlinked',
            'bustedAt': Timestamp.fromDate(ts),
          },
        ),
      );
      expect(entry.bustedAt, ts);
    });
  });

  group('OkibakeTemporaryEntry.isListTarget / isBustedUnlinked', () {
    OkibakeTemporaryEntry build({
      required String status,
      required String billLink,
    }) =>
        OkibakeTemporaryEntry.fromDoc(
          _FakeDoc(
            id: 'x',
            rawData: {
              'temporaryDisplayName': 'オキバケ',
              'entryStatus': status,
              'billLinkStatus': billLink,
            },
          ),
        );

    test('registered + unlinked は対象', () {
      final e = build(status: 'registered', billLink: 'unlinked');
      expect(e.isListTarget, true);
      expect(e.isBustedUnlinked, false);
    });

    test('seated + unlinked は対象', () {
      final e = build(status: 'seated', billLink: 'unlinked');
      expect(e.isListTarget, true);
      expect(e.isBustedUnlinked, false);
    });

    test('busted + unlinked は対象 (主目的)', () {
      final e = build(status: 'busted', billLink: 'unlinked');
      expect(e.isListTarget, true);
      expect(e.isBustedUnlinked, true);
    });

    test('linked は registered/seated/busted いずれも対象外', () {
      for (final s in const ['registered', 'seated', 'busted']) {
        final e = build(status: s, billLink: 'linked');
        expect(e.isListTarget, false, reason: 'status=$s billLink=linked');
        expect(e.isBustedUnlinked, false);
      }
    });

    test('voided は対象外', () {
      final e = build(status: 'voided', billLink: 'unlinked');
      expect(e.isListTarget, false);
      expect(e.isBustedUnlinked, false);
    });

    test('pending_review は対象外', () {
      final e = build(status: 'registered', billLink: 'pending_review');
      expect(e.isListTarget, false);
      expect(e.isBustedUnlinked, false);
    });
  });
}

class _FakeDoc implements DocumentSnapshot<Map<String, dynamic>> {
  _FakeDoc({required this.id, required Map<String, dynamic> rawData}) : _rawData = rawData;

  @override
  final String id;
  final Map<String, dynamic> _rawData;

  @override
  Map<String, dynamic>? data() => _rawData;

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}
