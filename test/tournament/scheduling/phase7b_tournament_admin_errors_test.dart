import 'package:amuse_app_template/core/errors/errors.dart';
import 'package:amuse_app_template/tournament/scheduling/errors/tournament_admin_user_facing_errors.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_core/firebase_core.dart';
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

  group('Phase 7B tournament admin helper', () {
    test('TOUR-69/70 template load fail vs empty', () {
      expect(kTournamentAdminTemplatesLoadFailedMessage, isNot(contains('\$e')));
      expect(kTournamentAdminTemplatesEmptyMessage, isNotEmpty);
      expect(
        canProceedWithTournamentTemplates(loadFailed: true, isEmpty: false),
        isFalse,
      );
      expect(
        canProceedWithTournamentTemplates(loadFailed: false, isEmpty: true),
        isFalse,
      );
      expect(
        canProceedWithTournamentTemplates(loadFailed: false, isEmpty: false),
        isTrue,
      );
      expect(
        kTournamentAdminTemplatesLoadFailedMessage,
        isNot(equals(kTournamentAdminTemplatesEmptyMessage)),
      );
    });

    test('TOUR-74 stream: first fail vs update fail; raw ignored', () {
      const secret = 'Firestore: projects/x/databases/(default)/documents/t1';

      expect(
        tournamentAdminScheduleStreamMessage(
          hasStaleData: false,
          error: secret,
        ),
        kTournamentAdminScheduleLoadFailedMessage,
      );
      expect(
        tournamentAdminScheduleStreamMessage(
          hasStaleData: true,
          error: secret,
        ),
        kTournamentAdminStaleUpdateFailedMessage,
      );
      expect(
        tournamentAdminScheduleStreamMessage(
          hasStaleData: false,
          error: secret,
        ),
        isNot(contains('projects/')),
      );
      expect(
        tournamentAdminScheduleStreamMessage(
          hasStaleData: true,
          error: secret,
        ),
        isNot(contains('Exception')),
      );
    });

    test('TOUR-61/64/67 permission-denied: UID/path/raw 非表示', () {
      final mapped = mapTournamentAdminCallableError(
        _TestFirebaseFunctionsException(
          code: 'permission-denied',
          message: 'uid=secret path=/internal',
          details: {'errorKey': 'UNKNOWN_ERROR'},
        ),
        operation: kUpdateScheduledTournamentStatusOperation,
      );
      expect(mapped, isNot(contains('uid=secret')));
      expect(mapped, isNot(contains('/internal')));
      expect(mapped, isNot(contains('uid=')));
      expect(mapped, isNotEmpty);
    });

    test('TOUR-67/78/85 generic Exception: raw 非表示', () {
      final mapped = mapTournamentAdminCallableError(
        Exception('secret internal exception'),
        operation: kCreateTournamentRecurrenceOperation,
      );
      expect(mapped, isNot(contains('secret')));
      expect(mapped, isNot(contains('internal exception')));
      expect(mapped, isNot(contains('Exception')));
      expect(mapped, isNotEmpty);
    });

    test('TOUR-110 Firestore permission: raw 非表示・0件と区別', () {
      final mapped = mapTournamentAdminCallableError(
        FirebaseException(
          plugin: 'cloud_firestore',
          code: 'permission-denied',
          message: 'projects/x/databases/internal',
        ),
      );
      expect(mapped, isNot(contains('projects/')));
      expect(mapped, isNot(contains('databases/internal')));
      expect(mapped, isNotEmpty);
      expect(
        kTournamentAdminCalendarLoadFailedMessage,
        isNot(contains('projects/')),
      );
      expect(
        kTournamentAdminCalendarLoadFailedMessage,
        isNot(equals('選択された期間にスケジュールされたトーナメントがありません')),
      );
    });

    test('TOUR-76/78/85 soft-fail does not surface backend message', () {
      final msg = mapTournamentAdminSoftFail(
        {
          'success': false,
          'message': 'internal stack trace must not show',
          'error': 'raw backend error',
        },
        operation: kDeleteTournamentRecurrenceOperation,
      );
      expect(msg, isNot(contains('internal stack')));
      expect(msg, isNot(contains('raw backend error')));
      expect(msg, isNotEmpty);
    });

    test('success == true only for admin mutations', () {
      expect(isCallableSuccessResponse({'success': true}), isTrue);
      expect(isCallableSuccessResponse({'success': false}), isFalse);
      expect(isCallableSuccessResponse(null), isFalse);
      expect(isCallableSuccessResponse({'success': 'true'}), isFalse);
      expect(isCallableSuccessResponse({}), isFalse);
    });

    test('TOUR-83/98 fail vs empty constants', () {
      expect(
        kTournamentAdminRecurrencesLoadFailedMessage,
        isNot(equals(kTournamentAdminRecurrenceNotFoundMessage)),
      );
      expect(
        kTournamentAdminActionLogsLoadFailedMessage,
        contains('操作履歴'),
      );
      expect(kTournamentAdminActionLogsLoadFailedMessage, isNot(contains('\$e')));
      expect(kTournamentAdminRecurrenceNotFoundMessage, isNot(contains('recurrenceId')));
    });

    testWidgets('TOUR-98/110 fail strings render without raw', (tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: Column(
              children: [
                Text(kTournamentAdminActionLogsLoadFailedMessage),
                Text(kTournamentAdminCalendarLoadFailedMessage),
                Text(kTournamentAdminRecurrencesLoadFailedMessage),
                Text(kTournamentAdminTemplatesLoadFailedMessage),
              ],
            ),
          ),
        ),
      );

      expect(find.text(kTournamentAdminActionLogsLoadFailedMessage), findsOneWidget);
      expect(find.text(kTournamentAdminCalendarLoadFailedMessage), findsOneWidget);
      expect(find.textContaining('Exception'), findsNothing);
      expect(find.textContaining('uid='), findsNothing);
      expect(find.textContaining('projects/'), findsNothing);
    });

    testWidgets('TOUR-100 rollback fail mapping hides secrets', (tester) async {
      final msg = mapTournamentAdminCallableError(
        _TestFirebaseFunctionsException(
          code: 'permission-denied',
          message: 'uid=secret path=/internal',
          details: {'errorKey': 'UNKNOWN_ERROR'},
        ),
        operation: kRollbackTournamentActionOperation,
      );
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(body: Text(msg)),
        ),
      );
      expect(find.textContaining('uid='), findsNothing);
      expect(find.textContaining('/internal'), findsNothing);
      expect(find.text(msg), findsOneWidget);
    });
  });
}
