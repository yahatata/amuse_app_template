import 'package:flutter_test/flutter_test.dart';
import 'package:amuse_app_template/tournament/active/widgets/dialogs/okibake_register_dialog.dart';

void main() {
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

      final list = [noTsB, newer, noTsA, older]..sort(compareOkibakeLinkCandidates);
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

    test('候補モデルに lastLogin は含まれず lastCheckInAt と pokerName のみとなることのスモーク', () {
      final row = cp(uid: 'k', last: t(50), poker: 'kenta');
      expect(row.lastCheckInAt, isNotNull);
      expect(row.pokerName, 'kenta');
    });
  });
}
