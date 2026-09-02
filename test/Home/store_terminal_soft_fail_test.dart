import 'package:amuse_app_template/Home/store_terminal_callable_result.dart';
import 'package:amuse_app_template/core/errors/errors.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  tearDown(() {
    ErrorMessageRegistry.instance.clear();
  });

  group('isStoreTerminalCallableSuccess', () {
    test('success == true のみ成功', () {
      expect(isStoreTerminalCallableSuccess({'success': true}), isTrue);
    });

    test('success == false / 欠損 / 非 bool は失敗', () {
      expect(isStoreTerminalCallableSuccess({'success': false}), isFalse);
      expect(isStoreTerminalCallableSuccess({}), isFalse);
      expect(isStoreTerminalCallableSuccess({'success': 'true'}), isFalse);
      expect(isStoreTerminalCallableSuccess(null), isFalse);
      expect(isStoreTerminalCallableSuccess('ok'), isFalse);
    });
  });

  group('STORE-01a close soft-fail', () {
    test('raw message / error を表示せず利用者向け文言', () {
      const rawMessage = 'backend raw close message';
      const rawError = 'internal close error';
      final mapped = mapStoreTerminalSoftFail({
        'success': false,
        'message': rawMessage,
        'error': rawError,
      });

      expect(isStoreTerminalCallableSuccess({
        'success': false,
        'message': rawMessage,
        'error': rawError,
      }), isFalse);
      expect(mapped.message, kFinalFallbackErrorMessage);
      expect(mapped.message, isNot(contains(rawMessage)));
      expect(mapped.message, isNot(contains(rawError)));
      expect(mapped.source, UserFacingErrorSource.softFail);
    });
  });

  group('STORE-03a open soft-fail', () {
    test('raw message / error を表示せず利用者向け文言', () {
      const rawMessage = 'backend raw open message';
      const rawError = 'internal open error';
      final mapped = mapStoreTerminalSoftFail({
        'success': false,
        'message': rawMessage,
        'error': rawError,
      });

      expect(mapped.message, kFinalFallbackErrorMessage);
      expect(mapped.message, isNot(contains(rawMessage)));
      expect(mapped.message, isNot(contains(rawError)));
    });
  });

  group('malformed response', () {
    test('{} は成功扱いにせず generic', () {
      expect(isStoreTerminalCallableSuccess({}), isFalse);
      final mapped = mapStoreTerminalSoftFail({});
      expect(mapped.message, kFinalFallbackErrorMessage);
    });

    test("{'success': 'true'} は成功扱いにせず generic", () {
      expect(isStoreTerminalCallableSuccess({'success': 'true'}), isFalse);
      final mapped = mapStoreTerminalSoftFail({'success': 'true'});
      expect(mapped.message, kFinalFallbackErrorMessage);
      expect(mapped.message, isNot(contains('true')));
    });
  });

  group('soft-fail SnackBar 表示（二重なし・成功処理なし）', () {
    testWidgets('失敗文言が表示され raw は出ない', (tester) async {
      const rawMessage = 'backend raw close message';
      const rawError = 'internal close error';
      final data = {
        'success': false,
        'message': rawMessage,
        'error': rawError,
      };

      var successHandled = false;
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: Builder(
              builder: (context) {
                return ElevatedButton(
                  onPressed: () {
                    if (isStoreTerminalCallableSuccess(data)) {
                      successHandled = true;
                      return;
                    }
                    final softFail = mapStoreTerminalSoftFail(data);
                    ScaffoldMessenger.of(context).showSnackBar(
                      SnackBar(content: Text(softFail.message)),
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

      expect(successHandled, isFalse);
      expect(find.text(kFinalFallbackErrorMessage), findsOneWidget);
      expect(find.textContaining(rawMessage), findsNothing);
      expect(find.textContaining(rawError), findsNothing);
    });
  });
}
