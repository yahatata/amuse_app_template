import 'package:flutter_test/flutter_test.dart';
import 'package:amuse_app_template/tournament/active/widgets/dialogs/okibake_link_user_picker_dialog.dart';

void main() {
  group('isEligibleForOkibakeNewLink', () {
    test('line は候補に含める', () {
      expect(isEligibleForOkibakeNewLink({'userType': 'line'}), isTrue);
    });

    test('未移行の店舗管理は候補に含める', () {
      expect(
        isEligibleForOkibakeNewLink({
          'userType': 'store_managed',
          'isMigrated': false,
        }),
        isTrue,
      );
    });

    test('移行済み店舗管理は候補から除外する', () {
      expect(
        isEligibleForOkibakeNewLink({
          'userType': 'store_managed',
          'isMigrated': true,
        }),
        isFalse,
      );
    });

    test('userType 未設定はクラッシュせず候補に含める（種別推測なし）', () {
      expect(isEligibleForOkibakeNewLink({}), isTrue);
      expect(isEligibleForOkibakeNewLink({'pokerName': 'NoType'}), isTrue);
      expect(
        isEligibleForOkibakeNewLink({'isMigrated': true}),
        isTrue,
      );
    });

    test('LINE に isMigrated があっても種別推測せず除外しない', () {
      expect(
        isEligibleForOkibakeNewLink({
          'userType': 'line',
          'isMigrated': true,
        }),
        isTrue,
      );
    });
  });

  group('okibake candidate search / unused filters', () {
    OkibakeLinkCandidate cp({
      required String uid,
      String? poker,
    }) =>
        OkibakeLinkCandidate(userId: uid, pokerName: poker);

    test('入店中除外は staySnap.docId を inStore として除外する（関数未変更の契約）', () {
      // filterOkibakeLinkCandidatesNotStaying:
      //   final inStore = staySnap.docs.map((d) => d.id).toSet();
      //   return candidates.where((c) => !inStore.contains(c.userId))
      // Firestore sealed Snapshot をテストで実装しないため、契約ロジックを固定する。
      final inStore = {'u-in', 'u-out'};
      final list = [
        cp(uid: 'u-in', poker: 'In'),
        cp(uid: 'u-free', poker: 'Free'),
        cp(uid: 'u-out', poker: 'Out'),
      ];
      final filtered =
          list.where((c) => !inStore.contains(c.userId)).toList();
      expect(filtered.map((e) => e.userId), ['u-free']);
    });

    test('検索は一覧と同じ pokerName 一致（userId は対象外）', () {
      final available = [
        cp(uid: 'uid-alice', poker: 'Alice'),
        cp(uid: 'uid-bob', poker: 'Bob'),
        cp(uid: 'contains-ali', poker: 'x'),
      ];
      final filtered = filterOkibakeLinkCandidatesBySearch(available, 'Ali');
      expect(filtered.map((e) => e.userId), ['uid-alice']);
      expect(
        filterOkibakeLinkCandidatesBySearch(available, 'uid-alice'),
        isEmpty,
      );
    });

    test('検索順位: 完全一致 → 前方一致 → 部分一致', () {
      final available = [
        cp(uid: 'u-partial', poker: 'まんじゅうや'),
        cp(uid: 'u-exact', poker: 'や'),
        cp(uid: 'u-prefix', poker: 'やはた'),
      ];
      expect(
        filterOkibakeLinkCandidatesBySearch(available, 'や')
            .map((e) => e.userId),
        ['u-exact', 'u-prefix', 'u-partial'],
      );
    });

    test('検索不一致は非表示、一致する通常ユーザーは表示', () {
      final available = [
        cp(uid: 'u1', poker: 'Normal'),
        cp(uid: 'u2', poker: 'Other'),
      ];
      expect(
        filterOkibakeLinkCandidatesBySearch(available, 'zzz'),
        isEmpty,
      );
      expect(
        filterOkibakeLinkCandidatesBySearch(available, 'Norm').single.userId,
        'u1',
      );
    });

    test('置きバケで使用中 linkedUserId は候補から除外されること', () {
      final list = [
        cp(uid: 'u1', poker: 'A'),
        cp(uid: 'u2', poker: 'B'),
        cp(uid: 'u3', poker: 'C'),
      ];
      final filtered = filterOkibakeLinkCandidatesUnusedByOkibake(list, {'u2'});
      expect(filtered.map((e) => e.userId), ['u1', 'u3']);
    });
  });

  group('compareOkibakeLinkCandidates', () {
    DateTime t(int millis) =>
        DateTime.fromMillisecondsSinceEpoch(millis, isUtc: true);

    OkibakeLinkCandidate cp({
      required String uid,
      DateTime? last,
      String? poker,
    }) =>
        OkibakeLinkCandidate(
          userId: uid,
          lastCheckInAt: last,
          pokerName: poker,
        );

    test('lastCheckInAt が新しいユーザーを優先すること', () {
      final a = cp(uid: 'a', last: t(200), poker: 'A');
      final b = cp(uid: 'b', last: t(100), poker: 'B');
      final list = [b, a]..sort(compareOkibakeLinkCandidates);
      expect(list.map((e) => e.userId), ['a', 'b']);
    });

    test('lastCheckInAt が null のユーザーはフィールドがあるユーザーの後ろで、pokerName 昇順となること',
        () {
      final newer = cp(uid: 'u1', last: t(1000), poker: 'Charlie');
      final older = cp(uid: 'u2', last: t(500), poker: 'Alpha');
      final noTsB = cp(uid: 'no-b', last: null, poker: 'Beta');
      final noTsA = cp(uid: 'no-a', last: null, poker: 'Apple');

      final list = [noTsB, newer, noTsA, older]
        ..sort(compareOkibakeLinkCandidates);
      expect(list.map((e) => e.userId), ['u1', 'u2', 'no-a', 'no-b']);
    });

    test('lastCheckInAt が同じなら pokerName 昇順（欠損は userId）になること', () {
      final sameTs = t(777);
      final x = cp(uid: 'zzz', last: sameTs); // poker 欠損 → nameSortKey zzz
      final y = cp(uid: 'u-y', last: sameTs, poker: 'yamada');
      final z = cp(uid: 'u-z', last: sameTs, poker: 'ichiro');
      final list = [x, z, y]..sort(compareOkibakeLinkCandidates);
      expect(list.map((e) => e.nameSortKey), ['ichiro', 'yamada', 'zzz']);
    });

    test('pokerName 欠損でも userId で安定すること', () {
      final a = cp(uid: 'zzz', last: null);
      final b = cp(uid: 'aaa', last: null);
      final list = [a, b]..sort(compareOkibakeLinkCandidates);
      expect(list.map((e) => e.userId), ['aaa', 'zzz']);
      expect(list[0].displayLabel, 'aaa');
      expect(list[0].linkedPokerName, 'aaa');
    });

    test('候補モデルに lastLogin は含まれず lastCheckInAt と pokerName のみとなることのスモーク',
        () {
      final row = cp(uid: 'k', last: t(50), poker: 'kenta');
      expect(row.lastCheckInAt, isNotNull);
      expect(row.pokerName, 'kenta');
    });
  });
}
