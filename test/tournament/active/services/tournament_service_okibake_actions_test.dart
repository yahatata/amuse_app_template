import 'package:flutter_test/flutter_test.dart';
import 'package:amuse_app_template/tournament/active/tournament_service.dart';

void main() {
  group('ApplyOkibakeAddonResult.fromCallableData', () {
    test('replay を成功として解釈し addonRecordId を読む', () {
      final r = ApplyOkibakeAddonResult.fromCallableData({
        'success': true,
        'replay': true,
        'addonRecordId': 'addon-uuid',
      });
      expect(r.success, true);
      expect(r.replay, true);
      expect(r.addonRecordId, 'addon-uuid');
      expect(r.errorMessage, isNull);
    });

    test('初回成功', () {
      final r = ApplyOkibakeAddonResult.fromCallableData({
        'success': true,
        'replay': false,
        'addonRecordId': 'new-id',
      });
      expect(r.success, true);
      expect(r.replay, false);
      expect(r.addonRecordId, 'new-id');
    });

    test('応答が Map でないとき失敗とする', () {
      final r = ApplyOkibakeAddonResult.fromCallableData('bad');
      expect(r.success, false);
      expect(r.errorMessage, isNotNull);
    });
  });

  group('ApplyOkibakeAddonResult.fromException', () {
    test('FirebaseFunctionsException ライクではない例外を文字列化', () {
      final r = ApplyOkibakeAddonResult.fromException(StateError('x'));
      expect(r.success, false);
      expect(r.errorMessage, contains('Bad state'));
      expect(r.errorMessage, isNot(contains('Exception:')));
    });
  });

  group('BustOkibakeTemporaryEntryResult.fromCallableData', () {
    test('replay を成功として解釈する', () {
      final r = BustOkibakeTemporaryEntryResult.fromCallableData({
        'success': true,
        'replay': true,
      });
      expect(r.success, true);
      expect(r.replay, true);
      expect(r.errorMessage, isNull);
    });

    test('応答が Map でないとき失敗とする', () {
      final r = BustOkibakeTemporaryEntryResult.fromCallableData(123);
      expect(r.success, false);
      expect(r.errorMessage, isNotNull);
    });
  });

  group('MockTournamentService Phase 3C-3-2', () {
    test('applyOkibakeAddon / bustOkibakeTemporaryEntry は成功結果を返す', () async {
      final svc = MockTournamentService();
      final a = await svc.applyOkibakeAddon(
        tournamentId: 't',
        okibakeEntryId: 'e',
      );
      expect(a.success, true);

      final b = await svc.bustOkibakeTemporaryEntry(
        tournamentId: 't',
        okibakeEntryId: 'e',
      );
      expect(b.success, true);
    });
  });
}
