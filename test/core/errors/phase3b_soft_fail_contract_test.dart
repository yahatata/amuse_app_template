import 'package:amuse_app_template/Accounting/errors/map_accounting_error.dart';
import 'package:amuse_app_template/core/errors/errors.dart';
import 'package:amuse_app_template/tournament/active/tournament_service.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

/// Phase 3B: soft-fail 共通契約（Phase 3A helper の回帰＋代表 UI／Result）。
void main() {
  tearDown(() {
    ErrorMessageRegistry.instance.clear();
  });

  group('Phase 3B soft-fail contract', () {
    test('raw message/error 非表示', () {
      final data = {
        'success': false,
        'message': 'uid=secret path=/internal',
        'error': 'stack/internal/value',
      };
      expect(isCallableSuccessResponse(data), isFalse);
      final msg = mapCallableSoftFailMessage(data);
      expect(msg, kFinalFallbackErrorMessage);
      expect(msg, isNot(contains('uid=secret')));
      expect(msg, isNot(contains('/internal')));
      expect(msg, isNot(contains('stack/')));
    });

    test('errorKey 未知 + code → code 文言', () {
      final data = {
        'success': false,
        'errorKey': 'UNKNOWN_PHASE3B_KEY',
        'code': 'failed-precondition',
        'message': 'backend raw',
      };
      final msg = mapCallableSoftFailMessage(data);
      expect(
        msg,
        '現在の状態ではこの操作を実行できません。画面を更新してください。',
      );
      expect(msg, isNot(contains('backend raw')));
    });

    test('malformed は成功扱いしない', () {
      expect(isCallableSuccessResponse({}), isFalse);
      expect(isCallableSuccessResponse({'success': 'true'}), isFalse);
      expect(mapCallableSoftFailMessage({}), kFinalFallbackErrorMessage);
    });
  });

  group('Phase 3B Result factories（置きバケ）', () {
    test('CreateOkibakeTemporaryEntryResult: soft-fail raw 非表示', () {
      final r = CreateOkibakeTemporaryEntryResult.fromCallableData({
        'success': false,
        'message': 'uid=secret path=/internal',
        'error': 'stack/internal/value',
      });
      expect(r.success, isFalse);
      expect(r.errorMessage, kFinalFallbackErrorMessage);
      expect(r.errorMessage, isNot(contains('uid=secret')));
    });

    test('AssignOkibakeTemporaryEntryToSeatResult: malformed は失敗', () {
      final r = AssignOkibakeTemporaryEntryToSeatResult.fromCallableData({});
      expect(r.success, isFalse);
      expect(r.errorMessage, kFinalFallbackErrorMessage);
    });
  });

  group('Phase 3B Accounting ACC-10 mapper', () {
    test('updateActiveBill soft-fail は raw 非表示', () {
      final err = mapAccountingSoftFailError(
        {
          'success': false,
          'message': 'uid=secret',
          'error': 'stack/internal',
        },
        operation: 'accounting.updateActiveBill',
      );
      expect(err.message, isNot(contains('uid=secret')));
      expect(err.message, isNot(contains('stack/')));
    });
  });

  group('Phase 3B 代表 UI（soft-fail）', () {
    Future<void> pumpSoftFailUi(
      WidgetTester tester, {
      required Map<String, dynamic> data,
      required String Function(dynamic) mapFail,
    }) async {
      var successUi = false;
      var popped = false;

      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: Builder(
              builder: (context) {
                return ElevatedButton(
                  onPressed: () {
                    if (isCallableSuccessResponse(data)) {
                      successUi = true;
                      popped = true;
                      Navigator.of(context).pop();
                      return;
                    }
                    ScaffoldMessenger.of(context).showSnackBar(
                      SnackBar(content: Text(mapFail(data))),
                    );
                  },
                  child: const Text('run'),
                );
              },
            ),
          ),
        ),
      );

      await tester.tap(find.text('run'));
      await tester.pump();

      expect(successUi, isFalse);
      expect(popped, isFalse);
      expect(find.textContaining('uid=secret'), findsNothing);
      expect(find.textContaining('stack/'), findsNothing);
    }

    testWidgets('HOME-08 相当: soft-fail で pop なし・raw 非表示', (tester) async {
      final data = {
        'success': false,
        'error': 'stack/internal/value',
        'message': 'uid=secret',
      };
      await pumpSoftFailUi(
        tester,
        data: data,
        mapFail: (d) => mapCallableSoftFailMessage(
          d,
          operation: 'createTemporaryTable',
        ),
      );
      expect(find.text(kFinalFallbackErrorMessage), findsOneWidget);
    });

    testWidgets('TOUR-90 相当: create template soft-fail', (tester) async {
      final data = {
        'success': false,
        'error': 'stack/internal/value',
        'message': 'uid=secret',
      };
      await pumpSoftFailUi(
        tester,
        data: data,
        mapFail: (d) => mapCallableSoftFailMessage(d),
      );
      expect(find.text(kFinalFallbackErrorMessage), findsOneWidget);
    });

    testWidgets('ACC-10 相当: accounting soft-fail', (tester) async {
      final data = {
        'success': false,
        'error': 'stack/internal/value',
        'message': 'uid=secret',
      };
      await pumpSoftFailUi(
        tester,
        data: data,
        mapFail: (d) => mapAccountingSoftFailError(
          d,
          operation: 'accounting.updateActiveBill',
        ).message,
      );
    });
  });
}
