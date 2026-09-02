import 'package:amuse_app_template/core/errors/errors.dart';
import 'package:amuse_app_template/tournament/active/tournament_service.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  tearDown(() {
    ErrorMessageRegistry.instance.clear();
  });

  group('isCallableSuccessResponse / mapCallableSoftFailMessage', () {
    test('success == true のみ成功', () {
      expect(isCallableSuccessResponse({'success': true}), isTrue);
      expect(isCallableSuccessResponse({'success': false}), isFalse);
      expect(isCallableSuccessResponse({}), isFalse);
      expect(isCallableSuccessResponse({'success': 'true'}), isFalse);
      expect(isCallableSuccessResponse(null), isFalse);
    });

    test('共通 soft-fail: raw message/error/UID/path 非表示', () {
      const secret = 'secret';
      final data = {
        'success': false,
        'message': 'backend raw message uid=$secret',
        'error': 'internal/path/value',
      };
      final msg = mapCallableSoftFailMessage(data);
      expect(isCallableSuccessResponse(data), isFalse);
      expect(msg, kFinalFallbackErrorMessage);
      expect(msg, isNot(contains('backend raw')));
      expect(msg, isNot(contains(secret)));
      expect(msg, isNot(contains('internal/path')));
    });

    test('errorKey + code: raw 非表示、code 文言', () {
      final data = {
        'success': false,
        'errorKey': 'SOME_BUSINESS_ERROR',
        'code': 'failed-precondition',
        'message': 'raw backend message',
      };
      final msg = mapCallableSoftFailMessage(data);
      expect(
        msg,
        '現在の状態ではこの操作を実行できません。画面を更新してください。',
      );
      expect(msg, isNot(contains('raw backend')));
      expect(msg, isNot(contains('SOME_BUSINESS_ERROR')));
    });

    test('malformed {} / success 文字列は成功扱いせず generic', () {
      expect(isCallableSuccessResponse({}), isFalse);
      expect(mapCallableSoftFailMessage({}), kFinalFallbackErrorMessage);

      expect(isCallableSuccessResponse({'success': 'true'}), isFalse);
      expect(
        mapCallableSoftFailMessage({'success': 'true'}),
        kFinalFallbackErrorMessage,
      );
    });
  });

  group('AUTH-09 LinkOkibakeTemporaryEntryToBillResult soft-fail', () {
    test('raw error/message を errorMessage に載せない', () {
      final r = LinkOkibakeTemporaryEntryToBillResult.fromCallableData({
        'success': false,
        'error': 'internal/path/value',
        'message': 'backend raw uid=secret',
      });
      expect(r.success, isFalse);
      expect(r.errorMessage, kFinalFallbackErrorMessage);
      expect(r.errorMessage, isNot(contains('internal/path')));
      expect(r.errorMessage, isNot(contains('uid=secret')));
    });

    test('malformed は成功扱いにしない', () {
      final r = LinkOkibakeTemporaryEntryToBillResult.fromCallableData({});
      expect(r.success, isFalse);
      expect(r.errorMessage, isNotNull);
      expect(r.errorMessage, isNot(contains('Exception')));
    });
  });

  group('Phase 3A soft-fail UI 表示（代表）', () {
    testWidgets('soft-fail でエラー表示・成功 SnackBar なし・pop なし', (tester) async {
      const rawError = 'internal/path/value';
      final data = {
        'success': false,
        'error': rawError,
        'message': 'backend raw uid=secret',
      };
      var successShown = false;
      var navigated = false;

      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: Builder(
              builder: (context) {
                return ElevatedButton(
                  onPressed: () {
                    if (isCallableSuccessResponse(data)) {
                      successShown = true;
                      navigated = true;
                      return;
                    }
                    ScaffoldMessenger.of(context).showSnackBar(
                      SnackBar(content: Text(mapCallableSoftFailMessage(data))),
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

      expect(successShown, isFalse);
      expect(navigated, isFalse);
      expect(find.text(kFinalFallbackErrorMessage), findsOneWidget);
      expect(find.textContaining(rawError), findsNothing);
      expect(find.textContaining('uid=secret'), findsNothing);
    });
  });
}
