import 'package:amuse_app_template/core/errors/errors.dart';
import 'package:amuse_app_template/user/a6_callable_errors.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('parseNonNegativeIntInput', () {
    test('整数を受理', () {
      expect(parseNonNegativeIntInput('0'), 0);
      expect(parseNonNegativeIntInput('12'), 12);
      expect(parseNonNegativeIntInput(' 7 '), 7);
    });

    test('空欄・負数・小数・非数値を拒否', () {
      expect(parseNonNegativeIntInput(''), isNull);
      expect(parseNonNegativeIntInput('   '), isNull);
      expect(parseNonNegativeIntInput('-1'), isNull);
      expect(parseNonNegativeIntInput('1.5'), isNull);
      expect(parseNonNegativeIntInput('1,000'), isNull);
      expect(parseNonNegativeIntInput('abc'), isNull);
    });
  });

  group('formatA6CallableError', () {
    test('既知 errorKey を日本語にマップ（generic へ退行しない）', () {
      final err = FirebaseFunctionsException(
        code: 'failed-precondition',
        message: '移行済みユーザーは操作できません',
        details: {'errorKey': 'USER_MIGRATED'},
      );
      expect(formatA6CallableError(err), kA6ErrorKeyMessages['USER_MIGRATED']);
      expect(formatA6CallableError(err), isNot(kFinalFallbackErrorMessage));
    });

    test('必須キーを定義済み', () {
      for (final key in [
        'PERMISSION_DENIED',
        'UNAUTHENTICATED',
        'INVALID_ARGUMENT',
        'INVALID_USER_TYPE',
        'USER_MIGRATED',
        'SOURCE_USER_NOT_STORE_MANAGED',
        'TARGET_USER_NOT_LINE',
        'USER_ALREADY_MIGRATED',
        'USER_HAS_ACTIVE_STAY',
        'IDEMPOTENCY_CONFLICT',
        'INTERNAL',
      ]) {
        expect(kA6ErrorKeyMessages.containsKey(key), isTrue, reason: key);
      }
    });

    test('移行 Callable の errorKey を日本語にマップ', () {
      final err = FirebaseFunctionsException(
        code: 'failed-precondition',
        message: '入店中',
        details: {'errorKey': 'USER_HAS_ACTIVE_STAY'},
      );
      expect(
        formatA6CallableError(err),
        kA6ErrorKeyMessages['USER_HAS_ACTIVE_STAY'],
      );
    });

    test('permission-denied + 未知 errorKey は D-1 code 文言（UID/path 非表示）', () {
      const secret = 'secret-user-id';
      final err = FirebaseFunctionsException(
        code: 'permission-denied',
        message: 'uid=$secret path=/internal/doc',
        details: {'errorKey': 'UNKNOWN_KEY'},
      );
      final msg = formatA6CallableError(err);
      expect(msg, 'この操作の権限がありません。');
      expect(msg, isNot(contains(secret)));
      expect(msg, isNot(contains('/internal/doc')));
      expect(msg, isNot(contains('uid=')));
    });

    test('unavailable は通信文言（raw 非表示）', () {
      final err = FirebaseFunctionsException(
        code: 'unavailable',
        message: 'backend raw unavailable',
      );
      final msg = formatA6CallableError(err);
      expect(msg, '通信できません。接続を確認して再度お試しください。');
      expect(msg, isNot(contains('backend raw')));
    });

    test('unknown FFE は最終共通（message 非表示）', () {
      final err = FirebaseFunctionsException(
        code: 'unknown-xyz',
        message: 'SHOULD_NOT_APPEAR',
      );
      final msg = formatA6CallableError(err);
      expect(msg, kFinalFallbackErrorMessage);
      expect(msg, isNot(contains('SHOULD_NOT_APPEAR')));
    });

    test('通常 Exception は最終共通（secret 非表示）', () {
      final msg = formatA6CallableError(Exception('secret internal exception'));
      expect(msg, kFinalFallbackErrorMessage);
      expect(msg, isNot(contains('secret internal exception')));
    });
  });
}
