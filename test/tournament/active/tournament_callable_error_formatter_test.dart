import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:amuse_app_template/tournament/active/tournament_service.dart';
import 'package:amuse_app_template/tournament/active/utils/tournament_callable_error_formatter.dart';

class _TestFirebaseFunctionsException extends FirebaseFunctionsException {
  _TestFirebaseFunctionsException({
    required String message,
    required String code,
  }) : super(message: message, code: code);
}

void main() {
  group('formatTournamentCallableError', () {
    test('FirebaseFunctionsException は message を優先し code prefix を出さない', () {
      final error = _TestFirebaseFunctionsException(
        code: 'failed-precondition',
        message: '指定された席は使用中です',
      );

      final formatted = formatTournamentCallableError(error);

      expect(formatted, isNot(contains('failed-precondition')));
      expect(
        formatted,
        'この席はすでに使用されています。別の席を選んでください。',
      );
    });

    test('message が空のとき code を fallback', () {
      final error = _TestFirebaseFunctionsException(
        code: 'permission-denied',
        message: '',
      );

      expect(formatTournamentCallableError(error), 'permission-denied');
    });

    test('Exception ラップと code prefix を除去する', () {
      final formatted = formatTournamentCallableError(
        Exception('failed-precondition: 置きバケ一時参加者が見つかりません'),
      );

      expect(formatted, isNot(contains('Exception:')));
      expect(formatted, isNot(contains('failed-precondition')));
      expect(
        formatted,
        '対象の置きバケが見つかりません。画面を更新して再度お試しください。',
      );
    });

    test('既知 message のマップ', () {
      expect(
        mapKnownTournamentCallableMessage('Addon の上限に達しています'),
        'Addon の上限に達しています。',
      );
      expect(
        mapKnownTournamentCallableMessage('卓側の置きバケ席情報と参加者が一致しません'),
        '席情報に不整合があります。画面を更新して再度お試しください。',
      );
      expect(
        mapKnownTournamentCallableMessage('未知のエラー'),
        '未知のエラー',
      );
    });
  });

  group('formatOkibakeRegisterSuccessMessage', () {
    test('replay 時も冪等という語を含まない', () {
      const label = '置きバケ #3';
      final msg = formatOkibakeRegisterSuccessMessage(label);

      expect(msg, '置きバケを登録しました ($label)');
      expect(msg, isNot(contains('冪等')));
    });
  });

  group('ApplyOkibakeAddonResult.fromException', () {
    test('FirebaseFunctionsException をユーザー向け文言へ変換', () {
      final r = ApplyOkibakeAddonResult.fromException(
        _TestFirebaseFunctionsException(
          code: 'failed-precondition',
          message: 'Addon の上限に達しています',
        ),
      );

      expect(r.success, false);
      expect(r.errorMessage, 'Addon の上限に達しています。');
      expect(r.errorMessage, isNot(contains('failed-precondition')));
    });
  });
}
