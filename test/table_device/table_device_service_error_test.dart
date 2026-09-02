import 'package:amuse_app_template/core/errors/errors.dart';
import 'package:amuse_app_template/tableDevice/services/table_device_service.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('formatTableDeviceFunctionsError / formatFunctionsError', () {
    test('permission-denied は D-1 code 文言（UID/path 非表示）', () {
      const secret = 'secret-user-id';
      final msg = formatTableDeviceFunctionsError(
        FirebaseFunctionsException(
          code: 'permission-denied',
          message: 'uid=$secret path=/internal/doc',
          details: {'errorKey': 'UNKNOWN_KEY'},
        ),
      );
      expect(msg, 'この操作の権限がありません。');
      expect(msg, isNot(contains(secret)));
      expect(msg, isNot(contains('/internal/doc')));
      expect(msg, isNot(contains('uid=')));
    });

    test('unavailable は通信文言', () {
      final msg = formatTableDeviceFunctionsError(
        FirebaseFunctionsException(
          code: 'unavailable',
          message: 'backend raw unavailable',
        ),
      );
      expect(msg, '通信できません。接続を確認して再度お試しください。');
      expect(msg, isNot(contains('backend raw')));
    });

    test('unknown FFE は最終共通（message 非表示）', () {
      final msg = formatTableDeviceFunctionsError(
        FirebaseFunctionsException(
          code: 'weird-code',
          message: 'SHOULD_NOT_APPEAR',
        ),
      );
      expect(msg, kFinalFallbackErrorMessage);
      expect(msg, isNot(contains('SHOULD_NOT_APPEAR')));
    });

    test('通常 Exception は最終共通', () {
      final msg = formatTableDeviceFunctionsError(
        Exception('secret internal exception'),
      );
      expect(msg, kFinalFallbackErrorMessage);
      expect(msg, isNot(contains('secret internal exception')));
      expect(msg, isNot(contains('Exception')));
    });
  });
}
