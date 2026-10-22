import 'package:amuse_app_template/Accounting/okibake_remote_payment_display_amount.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('resolveBillClaimDisplayAmountIncl', () {
    test('新規正常 bill: amounts=5000 / remote=4000 → 主表示は claim 5000', () {
      final amount = resolveBillClaimDisplayAmountIncl({
        'billType': 'okibake_remote_payment',
        'amounts': {'grandTotalIncl': 5000, 'grandTotalRounded': 5000},
        'settlementSnapshot': {
          'amounts': {'grandTotalIncl': 5000},
        },
        'remotePayment': {'amountIncl': 4000},
      });
      expect(amount, 5000);
    });

    test('legacy okibake: amounts/snapshot 欠落・remote=5000 → fallback 5000', () {
      final amount = resolveBillClaimDisplayAmountIncl({
        'billType': 'okibake_remote_payment',
        'settlementSnapshot': {'amounts': null},
        'remotePayment': {'amountIncl': 5000},
      });
      expect(amount, 5000);
    });

    test('legacy okibake: grandTotal 0・remote=5000 → fallback 5000', () {
      final amount = resolveBillClaimDisplayAmountIncl({
        'billType': 'okibake_remote_payment',
        'amounts': {'grandTotalIncl': 0, 'grandTotalRounded': 0},
        'remotePayment': {'amountIncl': 5000},
      });
      expect(amount, 5000);
    });

    test('通常 settled bill: remote 無し・amounts=1200 → 1200', () {
      final amount = resolveBillClaimDisplayAmountIncl({
        'billType': null,
        'amounts': {'grandTotalIncl': 1200},
        'settlementSnapshot': {
          'amounts': {'grandTotalIncl': 1200},
        },
      });
      expect(amount, 1200);
    });
  });
}
