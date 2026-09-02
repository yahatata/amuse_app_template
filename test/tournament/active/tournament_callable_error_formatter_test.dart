import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:amuse_app_template/core/errors/errors.dart';
import 'package:amuse_app_template/tournament/active/tournament_service.dart';
import 'package:amuse_app_template/tournament/active/utils/tournament_callable_error_formatter.dart';

class _TestFirebaseFunctionsException extends FirebaseFunctionsException {
  _TestFirebaseFunctionsException({
    required String message,
    required String code,
    dynamic details,
  }) : super(message: message, code: code, details: details);
}

void main() {
  group('formatTournamentCallableError', () {
    test('既知 message は個別文言を維持（generic へ退行しない）', () {
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
      expect(formatted, isNot(kFinalFallbackErrorMessage));
    });

    test('message が空のとき D-1 code 文言', () {
      final error = _TestFirebaseFunctionsException(
        code: 'permission-denied',
        message: '',
      );

      expect(
        formatTournamentCallableError(error),
        'この操作の権限がありません。',
      );
    });

    test('Exception ラップでも既知 message を解決', () {
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
        lookupKnownTournamentCallableMessage('未知のエラー'),
        isNull,
      );
    });

    test('permission-denied + 未知 key は D-1（UID/path 非表示）', () {
      const secret = 'secret-user-id';
      final formatted = formatTournamentCallableError(
        _TestFirebaseFunctionsException(
          code: 'permission-denied',
          message: 'uid=$secret path=/internal/doc',
          details: {'errorKey': 'UNKNOWN_KEY'},
        ),
      );
      expect(formatted, 'この操作の権限がありません。');
      expect(formatted, isNot(contains(secret)));
      expect(formatted, isNot(contains('/internal/doc')));
    });

    test('unavailable は通信文言', () {
      final formatted = formatTournamentCallableError(
        _TestFirebaseFunctionsException(
          code: 'unavailable',
          message: 'backend raw unavailable',
        ),
      );
      expect(formatted, '通信できません。接続を確認して再度お試しください。');
      expect(formatted, isNot(contains('backend raw')));
    });

    test('未知 FFE message は raw 非表示', () {
      final formatted = formatTournamentCallableError(
        _TestFirebaseFunctionsException(
          code: 'unknown-xyz',
          message: 'SHOULD_NOT_APPEAR_RAW',
        ),
      );
      expect(formatted, kFinalFallbackErrorMessage);
      expect(formatted, isNot(contains('SHOULD_NOT_APPEAR')));
    });

    test('通常 Exception は最終共通', () {
      final formatted = formatTournamentCallableError(
        Exception('secret internal exception'),
      );
      expect(formatted, kFinalFallbackErrorMessage);
      expect(formatted, isNot(contains('secret internal exception')));
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
