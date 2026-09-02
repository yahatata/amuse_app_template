import 'package:amuse_app_template/core/errors/errors.dart';
import 'package:amuse_app_template/dashboard/errors/dashboard_user_facing_errors.dart';
import 'package:amuse_app_template/payroll/errors/payroll_user_facing_errors.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

class _TestFFE extends FirebaseFunctionsException {
  _TestFFE({
    required String message,
    required String code,
    dynamic details,
  }) : super(message: message, code: code, details: details);
}

void main() {
  tearDown(() {
    ErrorMessageRegistry.instance.clear();
  });

  group('Phase 8 Payroll', () {
    test('PAY-01/02 load fail ≠ empty', () {
      expect(
        kPayrollContextLoadFailedMessage,
        isNot(equals(kPayrollCandidatesEmptyMessage)),
      );
      expect(kPayrollCandidatesLoadFailedMessage, isNot(contains('\$e')));
      expect(kPayrollCandidatesEmptyMessage, isNot(contains('Exception')));
    });

    test('PAY-03 execute fail hides UID/path', () {
      final msg = mapPayrollCallableError(
        _TestFFE(
          code: 'permission-denied',
          message: 'uid=secret path=/internal',
          details: {'errorKey': 'UNKNOWN_ERROR'},
        ),
        operation: kExecuteMonthlyPayrollOperation,
      );
      expect(msg, isNot(contains('uid=secret')));
      expect(msg, isNot(contains('/internal')));
      expect(msg, isNotEmpty);
    });

    test('PAY-05/06 cancel/confirm generic Exception', () {
      final cancel = mapPayrollCallableError(
        Exception('secret internal exception'),
        operation: kCancelPayrollRunOperation,
      );
      final confirm = mapPayrollCallableError(
        Exception('secret internal exception'),
        operation: kConfirmPayrollRunOperation,
      );
      expect(cancel, isNot(contains('secret')));
      expect(confirm, isNot(contains('Exception')));
    });

    test('PAY-10 stream first vs stale', () {
      const secret = 'projects/x/databases/internal';
      expect(
        payrollNotificationsStreamMessage(hasStaleData: false, error: secret),
        kPayrollNotificationsLoadFailedMessage,
      );
      expect(
        payrollNotificationsStreamMessage(hasStaleData: true, error: secret),
        kPayrollNotificationsStaleUpdateFailedMessage,
      );
      expect(
        payrollNotificationsStreamMessage(hasStaleData: false, error: secret),
        isNot(contains('projects/')),
      );
    });
  });

  group('Phase 8 Dashboard', () {
    test('DASH-01 fail ≠ empty', () {
      expect(kDashboardLoadFailedMessage, isNot(equals(kDashboardEmptyMessage)));
      expect(kDashboardLoadFailedMessage, isNot(contains('\$error')));
    });

    test('DASH-05 partial vs full', () {
      expect(
        dashboardStreamErrorMessage(hasStaleData: false, isPartial: true),
        kDashboardPartialLoadFailedMessage,
      );
      expect(
        dashboardStreamErrorMessage(hasStaleData: false, isPartial: false),
        kDashboardLoadFailedMessage,
      );
      expect(
        dashboardStreamErrorMessage(hasStaleData: true, error: 'raw'),
        kDashboardStaleUpdateFailedMessage,
      );
    });

    test('DASH-10 Firestore permission raw hidden', () {
      final msg = mapDashboardLoadError(
        FirebaseException(
          plugin: 'cloud_firestore',
          code: 'permission-denied',
          message: 'projects/x/databases/internal',
        ),
      );
      expect(msg, isNot(contains('projects/')));
      expect(msg, isNotEmpty);
    });

    testWidgets('dashboard fail strings render without raw', (tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: Column(
              children: [
                Text(kDashboardLoadFailedMessage),
                Text(kDashboardPartialLoadFailedMessage),
                Text(kDashboardEmptyMessage),
              ],
            ),
          ),
        ),
      );
      expect(find.textContaining('Exception'), findsNothing);
      expect(find.textContaining('uid='), findsNothing);
    });
  });

  group('Phase 8 MISC-01', () {
    test('init Exception hides raw', () {
      final msg = mapAppInitializeError(Exception('secret internal exception'));
      expect(msg, isNot(contains('secret')));
      expect(msg, isNot(contains('Exception')));
      expect(msg, isNotEmpty);
    });

    test('init FFE permission hides UID/path', () {
      final msg = mapAppInitializeError(
        _TestFFE(
          code: 'permission-denied',
          message: 'uid=secret path=/internal',
          details: {'errorKey': 'UNKNOWN_ERROR'},
        ),
      );
      expect(msg, isNot(contains('uid=secret')));
      expect(msg, isNot(contains('/internal')));
    });

    testWidgets('retry label present', (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: Column(
              children: [
                Text(kAppInitializeFailedMessage),
                Text(kAppInitializeRetryLabel),
              ],
            ),
          ),
        ),
      );
      expect(find.text(kAppInitializeRetryLabel), findsOneWidget);
    });
  });

  group('Phase 8 Auth residuals', () {
    test('AUTH-02/07 generic Exception', () {
      final msg = mapCallableError(Exception('secret internal exception')).message;
      expect(msg, isNot(contains('secret')));
      expect(msg, kFinalFallbackErrorMessage);
    });

    test('AUTH-06 permission-denied', () {
      final msg = mapCallableError(
        _TestFFE(
          code: 'permission-denied',
          message: 'uid=secret path=/internal',
          details: {'errorKey': 'UNKNOWN_ERROR'},
        ),
      ).message;
      expect(msg, isNot(contains('uid=')));
      expect(msg, isNot(contains('/internal')));
      expect(msg, isNotEmpty);
    });

    test('AUTH-10 FFE hides email-like raw', () {
      final msg = mapCallableError(
        _TestFFE(
          code: 'already-exists',
          message: 'email=secret@example.com uid=u1',
          details: {'errorKey': 'UNKNOWN_ERROR'},
        ),
      ).message;
      expect(msg, isNot(contains('secret@example.com')));
      expect(msg, isNot(contains('uid=u1')));
    });
  });

  group('Phase 8 Accounting residuals (representative)', () {
    test('permission-denied via mapCallableError', () {
      final msg = mapCallableError(
        _TestFFE(
          code: 'permission-denied',
          message: 'uid=secret path=/internal',
          details: {'errorKey': 'UNKNOWN_ERROR'},
        ),
        operation: 'reopenAccountedBill',
      ).message;
      expect(msg, isNot(contains('uid=secret')));
      expect(msg, isNot(contains('/internal')));
    });

    test('success contract', () {
      expect(isCallableSuccessResponse({'success': true}), isTrue);
      expect(isCallableSuccessResponse({'success': false}), isFalse);
      expect(isCallableSuccessResponse(null), isFalse);
      expect(isCallableSuccessResponse({}), isFalse);
    });
  });
}
