import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:amuse_app_template/tournament/active/utils/okibake_bill_link_stay_candidates.dart';

void main() {
  group('parseOkibakeBillLinkStayCandidates', () {
    test('billId がある activeStay のみ候補に含める', () {
      final snap = _FakeQuerySnapshot([
        _FakeDoc('u1', {'billId': 'b1', 'pokerName': '山田', 'isActive': true}),
        _FakeDoc('u2', {'billId': '', 'pokerName': '空bill', 'isActive': true}),
        _FakeDoc('u3', {'pokerName': 'billなし', 'isActive': true}),
      ]);

      final candidates = parseOkibakeBillLinkStayCandidates(snap);
      expect(candidates.length, 1);
      expect(candidates.first.userId, 'u1');
      expect(candidates.first.billId, 'b1');
      expect(candidates.first.displayLabel, '山田');
    });

    test('billId が空文字の activeStay は候補から除外される', () {
      final snap = _FakeQuerySnapshot([
        _FakeDoc('u1', {'billId': '', 'pokerName': '空bill', 'isActive': true}),
      ]);

      expect(parseOkibakeBillLinkStayCandidates(snap), isEmpty);
    });

    test('billId がない activeStay は候補から除外される', () {
      final snap = _FakeQuerySnapshot([
        _FakeDoc('u1', {'pokerName': 'billなし', 'isActive': true}),
      ]);

      expect(parseOkibakeBillLinkStayCandidates(snap), isEmpty);
    });
  });

  group('filterOkibakeBillLinkStayCandidatesByLinkedUserId', () {
    const base = [
      OkibakeBillLinkStayCandidate(
        userId: 'u1',
        billId: 'b1',
        pokerName: '山田',
      ),
      OkibakeBillLinkStayCandidate(
        userId: 'u2',
        billId: 'b2',
        pokerName: '佐藤',
      ),
    ];

    test('linkedUserId がない場合は全候補を返す', () {
      expect(
        filterOkibakeBillLinkStayCandidatesByLinkedUserId(base, null),
        base,
      );
      expect(
        filterOkibakeBillLinkStayCandidatesByLinkedUserId(base, ''),
        base,
      );
    });

    test('linkedUserId がある場合、同一 userId の候補だけが残る', () {
      final filtered =
          filterOkibakeBillLinkStayCandidatesByLinkedUserId(base, 'u1');
      expect(filtered.length, 1);
      expect(filtered.first.userId, 'u1');
    });

    test('linkedUserId と異なる userId の activeStay は候補から除外される', () {
      final filtered =
          filterOkibakeBillLinkStayCandidatesByLinkedUserId(base, 'u1');
      expect(filtered.any((c) => c.userId == 'u2'), isFalse);
    });

    test('linkedUserId のユーザーが未入店なら候補0件', () {
      expect(
        filterOkibakeBillLinkStayCandidatesByLinkedUserId(base, 'u9'),
        isEmpty,
      );
    });
  });

  group('filterOkibakeBillLinkStayCandidatesFromBaseExcludingRegistered', () {
    const templateId = 'tpl-1';
    const base = [
      OkibakeBillLinkStayCandidate(
        userId: 'u1',
        billId: 'b1',
        pokerName: '山田',
      ),
      OkibakeBillLinkStayCandidate(
        userId: 'u2',
        billId: 'b2',
        pokerName: '佐藤',
      ),
    ];

    test('linkedUserId がない場合、同一トーナメント未参加の全ユーザーが候補になる', () async {
      final filtered =
          await filterOkibakeBillLinkStayCandidatesFromBaseExcludingRegistered(
        baseCandidates: base,
        templateId: templateId,
        billTournamentExists: (_, __) async => false,
      );

      expect(filtered.length, 2);
    });

    test('bills/{billId}/tournaments/{templateId} が存在しない場合は候補に出る', () async {
      final filtered =
          await filterOkibakeBillLinkStayCandidatesFromBaseExcludingRegistered(
        baseCandidates: [
          const OkibakeBillLinkStayCandidate(
            userId: 'u1',
            billId: 'b1',
            pokerName: '山田',
          ),
        ],
        templateId: templateId,
        billTournamentExists: (_, __) async => false,
      );

      expect(filtered.length, 1);
      expect(filtered.first.userId, 'u1');
    });

    test('bills/{billId}/tournaments/{templateId} が存在する場合は候補から除外される', () async {
      final filtered =
          await filterOkibakeBillLinkStayCandidatesFromBaseExcludingRegistered(
        baseCandidates: base,
        templateId: templateId,
        billTournamentExists: (billId, _) async => billId == 'b1',
      );

      expect(filtered.length, 1);
      expect(filtered.first.userId, 'u2');
    });

    test('linkedUserId がある場合、同一 userId の候補だけが残る', () async {
      final filtered =
          await filterOkibakeBillLinkStayCandidatesFromBaseExcludingRegistered(
        baseCandidates: base,
        templateId: templateId,
        linkedUserId: 'u1',
        billTournamentExists: (_, __) async => false,
      );

      expect(filtered.length, 1);
      expect(filtered.first.userId, 'u1');
    });

    test('linkedUserId のユーザーに billId がなければ候補0件', () async {
      final snap = _FakeQuerySnapshot([
        _FakeDoc('u1', {'pokerName': '山田', 'isActive': true}),
        _FakeDoc('u2', {'billId': 'b2', 'pokerName': '佐藤', 'isActive': true}),
      ]);

      final filtered =
          await filterOkibakeBillLinkStayCandidatesFromBaseExcludingRegistered(
        baseCandidates: parseOkibakeBillLinkStayCandidates(snap),
        templateId: templateId,
        linkedUserId: 'u1',
        billTournamentExists: (_, __) async => false,
      );

      expect(filtered, isEmpty);
    });

    test('linkedUserId のユーザーが同一トーナメント参加済みなら候補0件', () async {
      final filtered =
          await filterOkibakeBillLinkStayCandidatesFromBaseExcludingRegistered(
        baseCandidates: base,
        templateId: templateId,
        linkedUserId: 'u1',
        billTournamentExists: (_, __) async => true,
      );

      expect(filtered, isEmpty);
    });
  });

  group('resolveInitialOkibakeBillLinkUserId', () {
    test('linkedUserId が候補内にある場合は初期選択される', () {
      const candidates = [
        OkibakeBillLinkStayCandidate(
          userId: 'u1',
          billId: 'b1',
          pokerName: 'A',
        ),
      ];
      expect(resolveInitialOkibakeBillLinkUserId('u1', candidates), 'u1');
    });

    test('linkedUserId がない場合は未選択', () {
      const candidates = [
        OkibakeBillLinkStayCandidate(
          userId: 'u1',
          billId: 'b1',
          pokerName: 'A',
        ),
      ];
      expect(resolveInitialOkibakeBillLinkUserId(null, candidates), isNull);
    });

    test('linkedUserId が候補にない場合は null', () {
      const candidates = [
        OkibakeBillLinkStayCandidate(
          userId: 'u1',
          billId: 'b1',
          pokerName: 'A',
        ),
      ];
      expect(resolveInitialOkibakeBillLinkUserId('u9', candidates), isNull);
    });

    test('linkedUserId が同一 tournament 参加済みで候補から除外された場合は初期選択されない', () {
      const candidates = [
        OkibakeBillLinkStayCandidate(
          userId: 'u2',
          billId: 'b2',
          pokerName: 'B',
        ),
      ];
      expect(resolveInitialOkibakeBillLinkUserId('u1', candidates), isNull);
    });
  });

  group('isOkibakeBillLinkSubmitEnabled', () {
    test('userId / billId が揃えば true', () {
      expect(
        isOkibakeBillLinkSubmitEnabled(
          const OkibakeBillLinkStayCandidate(
            userId: 'u1',
            billId: 'b1',
            pokerName: 'A',
          ),
        ),
        true,
      );
      expect(isOkibakeBillLinkSubmitEnabled(null), false);
    });
  });
}

class _FakeQuerySnapshot implements QuerySnapshot<Map<String, dynamic>> {
  _FakeQuerySnapshot(this._docs);

  final List<QueryDocumentSnapshot<Map<String, dynamic>>> _docs;

  @override
  List<QueryDocumentSnapshot<Map<String, dynamic>>> get docs => _docs;

  @override
  List<DocumentChange<Map<String, dynamic>>> get docChanges => [];

  @override
  SnapshotMetadata get metadata => throw UnimplementedError();

  @override
  int get size => _docs.length;
}

class _FakeDoc implements QueryDocumentSnapshot<Map<String, dynamic>> {
  _FakeDoc(this._id, this._data);

  final String _id;
  final Map<String, dynamic> _data;

  @override
  Map<String, dynamic> data() => _data;

  @override
  String get id => _id;

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}
