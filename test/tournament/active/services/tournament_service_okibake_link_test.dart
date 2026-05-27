import 'package:flutter_test/flutter_test.dart';
import 'package:amuse_app_template/tournament/active/tournament_service.dart';
import 'package:amuse_app_template/tournament/active/utils/okibake_bill_link_callable_payload.dart';
import 'package:cloud_functions/cloud_functions.dart';

void main() {
  group('buildLinkOkibakeBillCallablePayload', () {
    test('operationId を含み deviceId は送らない', () {
      final payload = buildLinkOkibakeBillCallablePayload(
        operationId: 'op-1',
        tournamentId: 't1',
        okibakeEntryId: 'e1',
        userId: 'u1',
        billId: 'b1',
      );
      expect(payload['operationId'], 'op-1');
      expect(payload['tournamentId'], 't1');
      expect(payload['okibakeEntryId'], 'e1');
      expect(payload['userId'], 'u1');
      expect(payload['billId'], 'b1');
      expect(payload.containsKey('deviceId'), false);
    });

    test('deviceName は非空のときのみ含める', () {
      final withName = buildLinkOkibakeBillCallablePayload(
        operationId: 'op-2',
        tournamentId: 't1',
        okibakeEntryId: 'e1',
        userId: 'u1',
        billId: 'b1',
        deviceName: 'Terminal 1',
      );
      expect(withName['deviceName'], 'Terminal 1');

      final withoutName = buildLinkOkibakeBillCallablePayload(
        operationId: 'op-3',
        tournamentId: 't1',
        okibakeEntryId: 'e1',
        userId: 'u1',
        billId: 'b1',
        deviceName: '',
      );
      expect(withoutName.containsKey('deviceName'), false);
    });
  });

  group('LinkOkibakeTemporaryEntryToBillResult.fromCallableData', () {
    test('replay を成功扱いする', () {
      final r = LinkOkibakeTemporaryEntryToBillResult.fromCallableData({
        'success': true,
        'replay': true,
        'billId': 'b1',
        'okibakeEntryId': 'e1',
      });
      expect(r.success, true);
      expect(r.replay, true);
      expect(r.billId, 'b1');
      expect(r.okibakeEntryId, 'e1');
    });

    test('応答が Map でないとき失敗とする', () {
      final r = LinkOkibakeTemporaryEntryToBillResult.fromCallableData(null);
      expect(r.success, false);
      expect(r.errorMessage, isNotNull);
    });
  });

  group('LinkOkibakeTemporaryEntryToBillResult.fromException', () {
    test('FirebaseFunctionsException は formatTournamentCallableError を通る', () {
      final r = LinkOkibakeTemporaryEntryToBillResult.fromException(
        FirebaseFunctionsException(
          code: 'failed-precondition',
          message: '伝票のユーザーと一致しません',
        ),
      );
      expect(r.success, false);
      expect(r.errorMessage, '伝票のユーザーと一致しません。別の来店中ユーザーを選んでください。');
    });
  });

  group('MockTournamentService.linkOkibakeTemporaryEntryToBill', () {
    test('成功結果を返す', () async {
      final svc = MockTournamentService();
      final r = await svc.linkOkibakeTemporaryEntryToBill(
        tournamentId: 't',
        okibakeEntryId: 'e',
        userId: 'u',
        billId: 'b',
      );
      expect(r.success, true);
      expect(r.billId, 'b');
    });
  });
}
