import 'package:amuse_app_template/Home/home_list_load_errors.dart';
import 'package:amuse_app_template/core/errors/errors.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

class _TestFirebaseFunctionsException extends FirebaseFunctionsException {
  _TestFirebaseFunctionsException({
    required String message,
    required String code,
    dynamic details,
  }) : super(message: message, code: code, details: details);
}

void main() {
  tearDown(() {
    ErrorMessageRegistry.instance.clear();
  });

  group('Phase 5 Home', () {
    test('HOME-02/03 retireStaff fallback: raw 非表示', () {
      final msg = mapCallableError(
        _TestFirebaseFunctionsException(
          code: 'permission-denied',
          message: 'uid=secret path=/internal',
          details: {'errorKey': 'UNKNOWN_ERROR'},
        ),
        operation: 'retireStaff',
      ).message;
      expect(msg, isNot(contains('uid=secret')));
      expect(msg, isNot(contains('/internal')));
      expect(msg, contains('権限'));
    });

    test('HOME-01 known errorKey 文言は維持可能', () {
      // 個別文言は画面側で errorKey 分岐。D-1 は fallback のみ。
      expect(
        mapCallableError(
          _TestFirebaseFunctionsException(
            code: 'failed-precondition',
            message: 'raw',
            details: {'errorKey': 'STAFF_ALREADY_RETIRED'},
          ),
          operation: 'retireStaff',
        ).message,
        isNot(contains('raw')),
      );
    });

    testWidgets('HOME-10 Stream error UI: raw 非表示', (tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: Center(
              child: Text(kHomeUsersListLoadFailedMessage),
            ),
          ),
        ),
      );
      expect(find.text(kHomeUsersListLoadFailedMessage), findsOneWidget);
      expect(find.textContaining('projects/'), findsNothing);
    });

    test('HOME-13 realtime 固定文言は path 非表示', () {
      expect(kHomeUserDetailRealtimeFailedMessage, contains('最新情報'));
      expect(kHomeUserDetailRealtimeFailedMessage, isNot(contains('projects/')));
    });
  });
}
