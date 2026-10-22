import 'dart:async';

import 'package:amuse_app_template/Home/store_terminal_callable_result.dart';
import 'package:amuse_app_template/core/errors/errors.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter_test/flutter_test.dart';

class _TestFirebaseFunctionsException implements FirebaseFunctionsException {
  _TestFirebaseFunctionsException({
    required this.code,
    this.message,
    this.details,
  });

  @override
  final String code;
  @override
  final String? message;
  @override
  final dynamic details;
  @override
  String get plugin => 'cloud_functions';
  @override
  StackTrace? get stackTrace => null;
}

void main() {
  tearDown(() {
    ErrorMessageRegistry.instance.clear();
  });

  group('Phase 4 Store exception mapping', () {
    test('FFE permission-denied: UID/path/raw 非表示', () {
      final e = _TestFirebaseFunctionsException(
        code: 'permission-denied',
        message: 'uid=secret path=/internal',
        details: {'errorKey': 'UNKNOWN_ERROR'},
      );
      final msg = mapStoreTerminalCallableException(
        e,
        operation: 'closeStoreTerminal',
      );
      expect(msg, isNot(contains('uid=secret')));
      expect(msg, isNot(contains('/internal')));
      expect(msg, isNot(contains('uid=')));
      expect(msg, contains('権限'));
    });

    test('通常 Exception: raw 非表示・最終共通', () {
      final msg = mapStoreTerminalCallableException(
        Exception('secret internal exception'),
        operation: 'openStoreTerminal',
      );
      expect(msg, kFinalFallbackErrorMessage);
      expect(msg, isNot(contains('secret internal')));
    });

    test('busy precondition は code で判定', () {
      expect(
        isStoreTerminalBusyPrecondition(
          _TestFirebaseFunctionsException(code: 'failed-precondition'),
        ),
        isTrue,
      );
      expect(
        isStoreTerminalBusyPrecondition(Exception('failed-precondition')),
        isFalse,
      );
    });

    test('resume runId は details から取得（表示には使わない）', () {
      final e = _TestFirebaseFunctionsException(
        code: 'aborted',
        message: 'raw should not appear',
        details: {'runId': 'run-abc'},
      );
      expect(extractStoreTerminalResumeRunId(e), 'run-abc');
      final msg = mapStoreTerminalCallableException(e);
      expect(msg, isNot(contains('raw should not appear')));
    });

    test('TimeoutException は最終共通（message 非表示）', () {
      final msg = mapCallableError(
        TimeoutException('閉店時確認の実行がタイムアウトしました'),
        operation: 'getCloseIntegrityData',
      ).message;
      expect(msg, kFinalFallbackErrorMessage);
      expect(msg, isNot(contains('タイムアウトしました')));
    });

    test('getCloseIntegrityData soft-fail: raw 非表示', () {
      final data = {
        'success': false,
        'message': 'uid=secret',
        'error': 'stack/internal',
      };
      expect(isCallableSuccessResponse(data), isFalse);
      final msg = mapCallableSoftFailMessage(
        data,
        operation: 'getCloseIntegrityData',
      );
      expect(msg, isNot(contains('uid=secret')));
      expect(msg, isNot(contains('stack/')));
    });
  });
}
