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
    test('errorKey を日本語にマップ', () {
      final err = FirebaseFunctionsException(
        code: 'failed-precondition',
        message: '移行済みユーザーは操作できません',
        details: {'errorKey': 'USER_MIGRATED'},
      );
      expect(formatA6CallableError(err), kA6ErrorKeyMessages['USER_MIGRATED']);
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
  });
}
