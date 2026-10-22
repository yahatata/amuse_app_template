import 'package:amuse_app_template/tournament/active/tournament_service.dart';
import 'package:amuse_app_template/tournament/active/utils/okibake_update_linked_user_callable_payload.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('buildUpdateOkibakeLinkedUserCallablePayload', () {
    test('operationId を含み deviceId は送らない', () {
      final payload = buildUpdateOkibakeLinkedUserCallablePayload(
        operationId: 'op-1',
        tournamentId: 't1',
        okibakeEntryId: 'e1',
        linkedUserId: 'u1',
      );
      expect(payload['operationId'], 'op-1');
      expect(payload['tournamentId'], 't1');
      expect(payload['okibakeEntryId'], 'e1');
      expect(payload['linkedUserId'], 'u1');
      expect(payload.containsKey('deviceId'), false);
      expect(payload.containsKey('linkedUserPokerName'), false);
    });

    test('deviceName は非空のときのみ含める', () {
      final withName = buildUpdateOkibakeLinkedUserCallablePayload(
        operationId: 'op-2',
        tournamentId: 't1',
        okibakeEntryId: 'e1',
        linkedUserId: 'u1',
        deviceName: 'Terminal 1',
      );
      expect(withName['deviceName'], 'Terminal 1');

      final withoutName = buildUpdateOkibakeLinkedUserCallablePayload(
        operationId: 'op-3',
        tournamentId: 't1',
        okibakeEntryId: 'e1',
        linkedUserId: 'u1',
        deviceName: '',
      );
      expect(withoutName.containsKey('deviceName'), false);
    });
  });

  group('UpdateOkibakeTemporaryEntryLinkedUserResult.fromCallableData', () {
    test('replay を成功扱いする', () {
      final r = UpdateOkibakeTemporaryEntryLinkedUserResult.fromCallableData({
        'success': true,
        'replay': true,
        'okibakeEntryId': 'e1',
        'linkedUserId': 'u1',
        'linkedUserPokerName': '山田',
      });
      expect(r.success, true);
      expect(r.replay, true);
      expect(r.okibakeEntryId, 'e1');
      expect(r.linkedUserId, 'u1');
      expect(r.linkedUserPokerName, '山田');
    });

    test('応答が Map でないとき失敗とする', () {
      final r = UpdateOkibakeTemporaryEntryLinkedUserResult.fromCallableData(
        null,
      );
      expect(r.success, false);
      expect(r.errorMessage, isNotNull);
    });
  });

  group('UpdateOkibakeTemporaryEntryLinkedUserResult.fromException', () {
    test('FirebaseFunctionsException は formatTournamentCallableError を通る', () {
      final r = UpdateOkibakeTemporaryEntryLinkedUserResult.fromException(
        FirebaseFunctionsException(
          code: 'failed-precondition',
          message: '対象ユーザーはすでに設定されています',
        ),
      );
      expect(r.success, false);
      expect(r.errorMessage, '対象ユーザーはすでに設定されています');
    });
  });

  group('MockTournamentService.updateOkibakeTemporaryEntryLinkedUser', () {
    test('成功結果を返す', () async {
      final svc = MockTournamentService();
      final r = await svc.updateOkibakeTemporaryEntryLinkedUser(
        tournamentId: 't',
        okibakeEntryId: 'e',
        linkedUserId: 'u',
      );
      expect(r.success, true);
      expect(r.okibakeEntryId, 'e');
      expect(r.linkedUserId, 'u');
    });
  });
}
