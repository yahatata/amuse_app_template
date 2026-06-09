import 'package:amuse_app_template/Accounting/bill_line_items_for_edit.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('buildBillLineItemsForEdit', () {
    test('サブコレクションのフィールドを修正ダイアログ形式へ変換する', () {
      final result = buildBillLineItemsForEdit(
        extrasDocs: [
          {'name': '入店料', 'amountIncl': 1000},
        ],
        tournamentDocs: [
          MapEntry('tournament-1', {
            'templateName': 'NLH',
            'entryFeeIncl': 3000,
            'entryCount': 1,
            'reentryFeeIncl': 2000,
            'reentryCount': 1,
            'addonFeeIncl': 1000,
            'addonCount': 0,
          }),
        ],
        itemDocs: [
          {
            'name': 'コーラ',
            'unitPriceIncl': 500,
            'quantity': 2,
            'voided': false,
          },
          {
            'name': '取消済み',
            'unitPriceIncl': 100,
            'quantity': 1,
            'voided': true,
          },
        ],
        sideGameChipDocs: [
          {
            'action': 'purchase',
            'name': '1000チップ',
            'amountIncl': 1000,
          },
          {
            'action': 'withdraw',
            'name': '出金',
            'amountIncl': 500,
          },
        ],
      );

      expect(result.extraCosts, [
        {'name': '入店料', 'price': 1000},
      ]);
      expect(result.tournaments['tournament-1'], {
        'entryFee': 5000,
        'tournamentName': 'NLH',
      });
      expect(result.items, [
        {'name': 'コーラ', 'price': 500, 'quantity': 2},
      ]);
      expect(result.sideGameChips, [
        {'name': '1000チップ', 'price': 1000},
      ]);
    });
  });
}
