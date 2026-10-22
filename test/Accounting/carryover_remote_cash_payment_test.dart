import 'package:flutter_test/flutter_test.dart';
import 'package:amuse_app_template/Accounting/carryover_remote_cash_payment.dart';

void main() {
  group('isCarryoverRemoteCashAmountExact', () {
    test('exact match', () {
      expect(
        isCarryoverRemoteCashAmountExact(
          claimTotalIncl: 5000,
          inputAmountIncl: 5000,
        ),
        isTrue,
      );
    });

    test('underpayment', () {
      expect(
        isCarryoverRemoteCashAmountExact(
          claimTotalIncl: 5000,
          inputAmountIncl: 4000,
        ),
        isFalse,
      );
    });

    test('overpayment', () {
      expect(
        isCarryoverRemoteCashAmountExact(
          claimTotalIncl: 5000,
          inputAmountIncl: 6000,
        ),
        isFalse,
      );
    });

    test('zero yen exact', () {
      expect(
        isCarryoverRemoteCashAmountExact(
          claimTotalIncl: 0,
          inputAmountIncl: 0,
        ),
        isTrue,
      );
    });
  });

  group('buildAllCashPaymentMethodsByCategory', () {
    test('positive categories become cash; zero omitted', () {
      expect(
        buildAllCashPaymentMethodsByCategory({
          'extraCost': 1000,
          'items': 0,
          'tournaments': 2000,
          'sideGameChip': 0,
        }),
        {
          'extraCost': 'cash',
          'tournaments': 'cash',
        },
      );
    });

    test('all zero → empty', () {
      expect(
        buildAllCashPaymentMethodsByCategory({
          'extraCost': 0,
          'items': 0,
        }),
        isEmpty,
      );
    });
  });
}
