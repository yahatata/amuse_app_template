import 'package:amuse_app_template/payroll/utils/payment_date_utils.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('computeActualPaymentDate', () {
    test('offset=0 の同月払い', () {
      expect(
        computeActualPaymentDate(
          periodEnd: '2026-03-25',
          paymentDayOfMonth: '31',
          paymentMonthOffset: 0,
        ),
        '2026-03-31',
      );
    });

    test('offset=1 の翌月払い', () {
      expect(
        computeActualPaymentDate(
          periodEnd: '2026-03-25',
          paymentDayOfMonth: '25',
          paymentMonthOffset: 1,
        ),
        '2026-04-25',
      );
    });

    test('offset=2 の翌々月払い', () {
      expect(
        computeActualPaymentDate(
          periodEnd: '2026-03-25',
          paymentDayOfMonth: '10',
          paymentMonthOffset: 2,
        ),
        '2026-05-10',
      );
    });

    test('0 は月末扱い', () {
      expect(
        computeActualPaymentDate(
          periodEnd: '2026-03-25',
          paymentDayOfMonth: '0',
          paymentMonthOffset: 1,
        ),
        '2026-04-30',
      );
    });

    test('存在しない日は月末へクランプ', () {
      expect(
        computeActualPaymentDate(
          periodEnd: '2026-01-25',
          paymentDayOfMonth: '31',
          paymentMonthOffset: 1,
        ),
        '2026-02-28',
      );
    });

    test('年跨ぎを処理する', () {
      expect(
        computeActualPaymentDate(
          periodEnd: '2026-12-25',
          paymentDayOfMonth: '31',
          paymentMonthOffset: 1,
        ),
        '2027-01-31',
      );
    });

    test('paymentDayOfMonth=null は null', () {
      expect(
        computeActualPaymentDate(
          periodEnd: '2026-03-25',
          paymentDayOfMonth: null,
          paymentMonthOffset: 1,
        ),
        isNull,
      );
    });

    test('不正値は null', () {
      expect(
        computeActualPaymentDate(
          periodEnd: '2026-03-25',
          paymentDayOfMonth: 'abc',
          paymentMonthOffset: 1,
        ),
        isNull,
      );
    });
  });

  group('formatIsoYmdToSlash', () {
    test('YYYY-MM-DD をスラッシュ区切りにする', () {
      expect(formatIsoYmdToSlash('2026-03-25'), '2026/03/25');
    });

    test('想定外はそのまま', () {
      expect(formatIsoYmdToSlash('bad'), 'bad');
    });
  });
}
