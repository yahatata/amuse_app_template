import 'package:amuse_app_template/core/errors/errors.dart';
import 'package:amuse_app_template/services/device_callable_errors.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter_test/flutter_test.dart';

class _TestFirebaseFunctionsException extends FirebaseFunctionsException {
  _TestFirebaseFunctionsException({
    required String message,
    required String code,
    dynamic details,
  }) : super(message: message, code: code, details: details);
}

class _TestFirebaseAuthException extends FirebaseAuthException {
  _TestFirebaseAuthException({required String code, String? message})
      : super(code: code, message: message);
}

void main() {
  tearDown(() {
    ErrorMessageRegistry.instance.clear();
  });

  group('Phase 4 Device error mapping', () {
    test('FFE permission-denied: UID/path/raw 非表示', () {
      final msg = mapDeviceCallableError(
        _TestFirebaseFunctionsException(
          code: 'permission-denied',
          message: 'uid=secret path=/internal',
          details: {'errorKey': 'UNKNOWN_ERROR'},
        ),
        operation: 'updateDeviceStatus',
      );
      expect(msg, isNot(contains('uid=secret')));
      expect(msg, isNot(contains('/internal')));
      expect(msg, contains('権限'));
    });

    test('通常 Exception: raw 非表示', () {
      final msg = mapDeviceCallableError(
        Exception('secret internal exception'),
        operation: 'archiveDevice',
      );
      expect(msg, kFinalFallbackErrorMessage);
      expect(msg, isNot(contains('secret internal')));
    });

    test('soft-fail DeviceCallableSoftFail: raw 非表示', () {
      final msg = mapDeviceCallableError(
        DeviceCallableSoftFail({
          'success': false,
          'message': 'uid=secret',
          'error': 'stack/internal',
        }),
        operation: 'updateDeviceRole',
      );
      expect(msg, isNot(contains('uid=secret')));
      expect(msg, isNot(contains('stack/')));
    });

    test('DEV-11 Auth code mapping（contains なし）', () {
      expect(
        isAnonymousAuthRestricted(
          _TestFirebaseAuthException(code: 'admin-restricted-operation'),
        ),
        isTrue,
      );
      expect(
        isAnonymousAuthRestricted(
          _TestFirebaseAuthException(code: 'operation-not-allowed'),
        ),
        isTrue,
      );
      expect(
        isAnonymousAuthRestricted(
          Exception('admin-restricted-operation'),
        ),
        isFalse,
      );
      final msg = mapDeviceRegisterError(
        _TestFirebaseAuthException(
          code: 'admin-restricted-operation',
          message: 'raw auth message',
        ),
      );
      expect(msg, kAnonymousAuthUnavailableMessage);
      expect(msg, isNot(contains('raw auth')));
    });

    test('一覧読込失敗文言は固定・path 非表示', () {
      expect(kDeviceListLoadFailedMessage, contains('端末一覧'));
      expect(kDeviceListLoadFailedMessage, isNot(contains('projects/')));
    });
  });
}
