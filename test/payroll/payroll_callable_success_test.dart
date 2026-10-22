import 'package:amuse_app_template/core/errors/errors.dart';
import 'package:amuse_app_template/payroll/errors/payroll_user_facing_errors.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter_test/flutter_test.dart';

class _TestFirebaseFunctionsException extends FirebaseFunctionsException {
  _TestFirebaseFunctionsException({
    required super.code,
    super.details,
  }) : super(message: 'dev-only');
}

void main() {
  tearDown(() {
    ErrorMessageRegistry.instance.clear();
  });

  group('isPayrollCallableSuccess — success key contract', () {
    test("{'success': true} → 成功", () {
      expect(isPayrollCallableSuccess({'success': true}), isTrue);
    });

    test("{'success': false} → 失敗", () {
      expect(isPayrollCallableSuccess({'success': false}), isFalse);
    });

    test('{} → 失敗（shapeValidator なし）', () {
      expect(isPayrollCallableSuccess({}), isFalse);
    });

    test("{'success': 'true'} → 失敗", () {
      expect(isPayrollCallableSuccess({'success': 'true'}), isFalse);
    });

    test('malformed / null / List → 失敗', () {
      expect(isPayrollCallableSuccess(null), isFalse);
      expect(isPayrollCallableSuccess('ok'), isFalse);
      expect(isPayrollCallableSuccess([1]), isFalse);
      expect(isPayrollCallableSuccess(true), isFalse);
    });

    test('success:false は runId があっても失敗', () {
      expect(
        isPayrollCallableSuccess(
          {'success': false, 'runId': 'run-1', 'paymentPeriodKey': 'a_b'},
          shapeValidator: isExecuteMonthlyPayrollShape,
        ),
        isFalse,
      );
    });
  });

  group('Payroll domain shape validators（success なし契約）', () {
    test('getPayrollCalcDisplayContext 正規 → 成功', () {
      final map = {
        'asOfDateJst': '2026-08-06',
        'paymentPeriodKey': '2026-07-21_2026-08-20',
        'periodStart': '2026-07-21',
        'periodEnd': '2026-08-20',
        'paymentDayOfMonth': '25',
        'paymentMonthOffset': 1,
        'actualPaymentDate': '2026-09-25',
        'paymentDateDisplay': '2026-09-25',
        'isConfirmed': false,
      };
      expect(
        isPayrollCallableSuccess(
          map,
          shapeValidator: isPayrollCalcDisplayContextShape,
        ),
        isTrue,
      );
    });

    test('getPayrollCalcDisplayContext 欠損 → 失敗', () {
      expect(
        isPayrollCallableSuccess(
          {'paymentPeriodKey': 'a_b'},
          shapeValidator: isPayrollCalcDisplayContextShape,
        ),
        isFalse,
      );
      expect(
        isPayrollCallableSuccess(
          {},
          shapeValidator: isPayrollCalcDisplayContextShape,
        ),
        isFalse,
      );
    });

    test('getPayrollCandidates 正規／空グループ → 成功、欠損 → 失敗', () {
      final ok = {
        'periodStart': '2026-07-21',
        'periodEnd': '2026-08-20',
        'group1': <dynamic>[],
        'group2': <dynamic>[],
        'group3': <dynamic>[],
        'isConfirmed': false,
      };
      expect(
        isPayrollCallableSuccess(ok, shapeValidator: isPayrollCandidatesShape),
        isTrue,
      );
      expect(
        isPayrollCallableSuccess(
          {'group1': []},
          shapeValidator: isPayrollCandidatesShape,
        ),
        isFalse,
      );
    });

    test('executeMonthlyPayroll: runId+period 必須、status単独は不可', () {
      expect(
        isPayrollCallableSuccess(
          {
            'runId': 'run-1',
            'paymentPeriodKey': 'a_b',
            'status': 'processing',
          },
          shapeValidator: isExecuteMonthlyPayrollShape,
        ),
        isTrue,
      );
      expect(
        isPayrollCallableSuccess(
          {'status': 'processing'},
          shapeValidator: isExecuteMonthlyPayrollShape,
        ),
        isFalse,
      );
      expect(
        isPayrollCallableSuccess(
          {'runId': ''},
          shapeValidator: isExecuteMonthlyPayrollShape,
        ),
        isFalse,
      );
    });

    test('retry / cancel / confirm / registerPayment shapes', () {
      expect(
        isPayrollCallableSuccess(
          {'retriedCount': 0, 'failedStaffIds': <String>[]},
          shapeValidator: isRetryFailedStaffTasksShape,
        ),
        isTrue,
      );
      expect(
        isPayrollCallableSuccess(
          {'retriedCount': '1'},
          shapeValidator: isRetryFailedStaffTasksShape,
        ),
        isFalse,
      );

      expect(
        isPayrollCallableSuccess(
          {'runId': 'r1', 'cancelledAt': '2026-08-06T00:00:00.000Z'},
          shapeValidator: isCancelPayrollRunShape,
        ),
        isTrue,
      );
      expect(
        isPayrollCallableSuccess(
          {'runId': 'r1'},
          shapeValidator: isCancelPayrollRunShape,
        ),
        isFalse,
      );

      expect(
        isPayrollCallableSuccess(
          {
            'paymentPeriodKey': 'a_b',
            'runId': 'r1',
            'confirmedAt': '2026-08-06T00:00:00.000Z',
          },
          shapeValidator: isConfirmPayrollRunShape,
        ),
        isTrue,
      );

      expect(
        isPayrollCallableSuccess(
          {'updatedCount': 2, 'monthlyPayrollStatus': 'paid'},
          shapeValidator: isRegisterPaymentStatusShape,
        ),
        isTrue,
      );
      expect(
        isPayrollCallableSuccess(
          {'updatedCount': 2},
          shapeValidator: isRegisterPaymentStatusShape,
        ),
        isFalse,
      );
    });

    test('(_) => true 相当の無条件成功は shapeValidator 未指定で不可', () {
      expect(
        isPayrollCallableSuccess({'anything': 1}),
        isFalse,
      );
    });

    test('getPayrollCandidates wageMissingStaff 付き → 成功', () {
      expect(
        isPayrollCallableSuccess(
          {
            'group1': [],
            'group2': [],
            'group3': [],
            'wageMissingStaff': [
              {'staffId': 's1', 'staffName': 'A'},
            ],
            'periodStart': '2026-07-01',
            'periodEnd': '2026-07-31',
            'isConfirmed': false,
          },
          shapeValidator: isPayrollCandidatesShape,
        ),
        isTrue,
      );
    });
  });

  group('mapPayrollCallableError — hourly wage missing', () {
    test('PAYROLL_HOURLY_WAGE_MISSING → 固定文言', () {
      final message = mapPayrollCallableError(
        _TestFirebaseFunctionsException(
          code: 'failed-precondition',
          details: {
            'errorKey': 'PAYROLL_HOURLY_WAGE_MISSING',
            'context': {
              'staffIds': ['s1'],
              'staffNames': ['A'],
            },
          },
        ),
        operation: kExecuteMonthlyPayrollOperation,
      );
      expect(message, kPayrollHourlyWageMissingMessage);
      expect(message.contains('s1'), isFalse);
    });
  });
}
