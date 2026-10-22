import 'package:amuse_app_template/core/errors/errors.dart';
import 'package:amuse_app_template/tournament/scheduling/errors/create_single_tournament_error.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  tearDown(() {
    ErrorMessageRegistry.instance.clear();
  });

  group('TOUR-72 permission-denied', () {
    test('UID / raw message 非表示、権限の安全文言', () {
      const secretUid = 'secret-user-id';
      final err = FirebaseFunctionsException(
        code: 'permission-denied',
        message: 'uid=$secretUid is not allowed',
        details: {
          'errorKey': 'PERMISSION_DENIED',
        },
      );

      final mapped = mapCreateSingleTournamentCallableError(err);

      expect(mapped.message, 'この操作の権限がありません。');
      expect(mapped.message, isNot(contains(secretUid)));
      expect(mapped.message, isNot(contains('uid=')));
      expect(mapped.message, isNot(contains('is not allowed')));
      expect(mapped.code, 'permission-denied');
    });
  });

  group('TOUR-72 unknown error', () {
    test(r'$e / raw / UID 非表示、最終共通文言', () {
      const secretUid = 'secret-user-id-xyz';
      final mapped = mapCreateSingleTournamentCallableError(
        Exception('uid=$secretUid boom details'),
      );

      expect(mapped.message, kFinalFallbackErrorMessage);
      expect(mapped.message, isNot(contains(secretUid)));
      expect(mapped.message, isNot(contains('boom')));
      expect(mapped.message, isNot(contains('Exception')));
    });
  });

  group('TOUR-72 soft-fail', () {
    test('result.error / message を表示しない', () {
      const rawError = 'device missing for uid=secret';
      final mapped = mapCreateSingleTournamentSoftFail({
        'success': false,
        'error': rawError,
        'message': 'backend raw create message',
      });

      expect(mapped.message, kFinalFallbackErrorMessage);
      expect(mapped.message, isNot(contains(rawError)));
      expect(mapped.message, isNot(contains('backend raw')));
      expect(mapped.message, isNot(contains('uid=')));
    });
  });

  group('TOUR-72 SnackBar 表示', () {
    testWidgets('permission-denied で UID が UI に出ない', (tester) async {
      const secretUid = 'secret-user-id';
      final err = FirebaseFunctionsException(
        code: 'permission-denied',
        message: 'uid=$secretUid is not allowed',
        details: {'errorKey': 'PERMISSION_DENIED'},
      );

      var successNavigated = false;

      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: Builder(
              builder: (context) {
                return ElevatedButton(
                  onPressed: () {
                    // 失敗時は成功遷移しない
                    final mapped = mapCreateSingleTournamentCallableError(err);
                    ScaffoldMessenger.of(context).showSnackBar(
                      SnackBar(content: Text(mapped.message)),
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

      expect(successNavigated, isFalse);
      expect(find.text('この操作の権限がありません。'), findsOneWidget);
      expect(find.textContaining(secretUid), findsNothing);
      expect(find.textContaining('uid='), findsNothing);
      expect(find.textContaining('is not allowed'), findsNothing);
    });
  });
}
