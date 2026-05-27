import 'package:flutter_test/flutter_test.dart';
import 'package:amuse_app_template/tournament/active/models/table_and_users.dart';

void main() {
  group('WaitingPlayer.okibakeTemporary', () {
    test('フラグ・表示名・合成 userId が区別できること', () {
      final t = DateTime(2026, 5, 1, 12, 30);
      final p = WaitingPlayer.okibakeTemporary(
        okibakeEntryId: 'ent1',
        displayName: 'オキバケA',
        createdAt: t,
        okibakeAddonCount: 2,
      );

      expect(p.isOkibakeTemporary, true);
      expect(p.userId.startsWith('okibakeTemporary:'), true);
      expect(p.displayName, 'オキバケA');
      expect(p.joinedAt, t);
      expect(p.okibakeEntryId, 'ent1');
      expect(p.okibakeAddonCount, 2);
    });
  });
}
