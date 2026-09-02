import 'package:amuse_app_template/core/errors/errors.dart';
import 'package:amuse_app_template/sideGame/side_game_user_facing_errors.dart';
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

  group('Phase 6 SideGame', () {
    testWidgets('SG-01/08 stream error message: raw/path 非表示', (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: Column(
              children: [
                Text(sideGameTableStreamErrorMessage(
                  Exception('projects/x/databases/(default)/documents/sideGame/t1'),
                )),
                Text(sideGameTableListStreamErrorMessage(
                  Exception('projects/x/databases/(default)/documents/tables'),
                )),
              ],
            ),
          ),
        ),
      );

      expect(find.text(kSideGameTableLoadFailedMessage), findsOneWidget);
      expect(find.text(kSideGameTableListLoadFailedMessage), findsOneWidget);
      expect(find.textContaining('projects/'), findsNothing);
      expect(find.textContaining('sideGame/'), findsNothing);
      expect(find.textContaining('Exception'), findsNothing);
    });

    test('SG-04 end fail mapping: UID 非表示', () {
      final msg = mapSideGameCallableError(
        _TestFirebaseFunctionsException(
          code: 'permission-denied',
          message: 'uid=secret-user path=/internal/end',
          details: {'errorKey': 'UNKNOWN_ERROR'},
        ),
        operation: 'endSideGameSession',
      );
      expect(msg, isNot(contains('uid=secret-user')));
      expect(msg, isNot(contains('/internal')));
      expect(msg, isNot(contains('secret-user')));
      expect(msg, contains('権限'));
    });

    test('SG-07 register fail mapping: raw 非表示', () {
      final msg = mapSideGameCallableError(
        _TestFirebaseFunctionsException(
          code: 'failed-precondition',
          message: 'ユーザー abc123 のactiveStaysにbillIdが設定されていません',
          details: {'errorKey': 'UNKNOWN_ERROR'},
        ),
        operation: 'registerForSideGame',
      );
      expect(msg, isNot(contains('abc123')));
      expect(msg, isNot(contains('activeStays')));
      expect(msg, isNot(contains('billId')));
    });

    test('SG-10 start fail mapping: raw 非表示', () {
      final msg = mapSideGameCallableError(
        _TestFirebaseFunctionsException(
          code: 'failed-precondition',
          message: 'tableId=T01 already registered uid=u1',
          details: {'errorKey': 'UNKNOWN_ERROR'},
        ),
        operation: 'registerTableToSideGame',
      );
      expect(msg, isNot(contains('tableId=T01')));
      expect(msg, isNot(contains('uid=u1')));
    });

    test('Exception(secret) → safe generic', () {
      final msg = mapSideGameCallableError(
        Exception('secret internal stack'),
        operation: 'endSideGameSession',
      );
      expect(msg, isNot(contains('secret')));
      expect(msg, isNot(contains('internal stack')));
      expect(msg, isNotEmpty);
    });

    test('SG-03/09 confirm: fixed safe wording', () {
      expect(kSideGameBillMissingMessage, contains('伝票情報'));
      expect(kSideGameBillMissingMessage, isNot(contains('伝票ID')));
      expect(kSideGameBillMissingMessage, isNot(contains('billId')));
      expect(kSideGameTournamentSeatedBlockMessage, contains('着席中'));
      expect(kSideGameTournamentSeatedBlockMessage, isNot(contains('\$e')));
      expect(kSideGameTournamentSeatedBlockMessage, isNot(contains('Exception')));
    });
  });
}
