import 'package:amuse_app_template/payroll/utils/payroll_calc_window.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('isPayrollPeriodClosedForCalculation', () {
    test('翌日から true', () {
      expect(
        isPayrollPeriodClosedForCalculation('2026-03-26', '2026-03-25'),
        isTrue,
      );
    });
    test('締め当日は false', () {
      expect(
        isPayrollPeriodClosedForCalculation('2026-03-25', '2026-03-25'),
        isFalse,
      );
    });
  });

  group('isInPayrollCalculationWindow', () {
    test('締め後かつ draft は true', () {
      expect(
        isInPayrollCalculationWindow('2026-03-26', '2026-03-25', 'draft'),
        isTrue,
      );
    });
    test('締め後だが confirmed は false', () {
      expect(
        isInPayrollCalculationWindow('2026-03-26', '2026-03-25', 'confirmed'),
        isFalse,
      );
    });
    test('締め前は false', () {
      expect(
        isInPayrollCalculationWindow('2026-03-24', '2026-03-25', null),
        isFalse,
      );
    });
  });

  group('previousPayrollPeriodRange', () {
    test('26日始まり〜翌月25日終わりの直前期間', () {
      final r = previousPayrollPeriodRange('2026-02-26', '2026-03-25');
      expect(r.start, '2026-01-29');
      expect(r.end, '2026-02-25');
    });
  });

  group('payrollCalculationBlockedBeforePeriodEndMessage', () {
    test('スラッシュ表記で文言を組み立てる', () {
      expect(
        payrollCalculationBlockedBeforePeriodEndMessage(
          periodStartIso: '2026-02-26',
          periodEndIso: '2026-03-25',
        ),
        '「2026/01/29 〜 2026/02/25」は確定済み、「2026/02/26 〜 2026/03/25」はまだ終了していないため、現在計算を行えません。',
      );
    });
  });

  group('payrollMonthlyCycleStatusLine', () {
    test('締め前は期間付きの説明文', () {
      expect(
        payrollMonthlyCycleStatusLine(
          monthlyPayrollStatus: 'draft',
          periodClosedForCalculation: false,
          periodStartIso: '2026-02-26',
          periodEndIso: '2026-03-25',
        ),
        payrollCalculationBlockedBeforePeriodEndMessage(
          periodStartIso: '2026-02-26',
          periodEndIso: '2026-03-25',
        ),
      );
    });
  });
}
