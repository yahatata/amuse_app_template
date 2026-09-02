import 'package:amuse_app_template/Accounting/errors/accounting_load_user_facing_errors.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('resolveAccountingReopenSuccessMessage', () {
    test('C1-A: unsettled_list → 未会計一覧', () {
      expect(
        resolveAccountingReopenSuccessMessage({
          'success': true,
          'reopenDestination': 'unsettled_list',
        }),
        kAccountingReopenSuccessMessageUnsettled,
      );
    });

    test('C1-B/C: special_attention → 要対応の会計', () {
      expect(
        resolveAccountingReopenSuccessMessage({
          'success': true,
          'reopenDestination': 'special_attention',
        }),
        kAccountingReopenSuccessMessageSpecialAttention,
      );
    });

    test('reopenDestination 欠損時は未会計一覧（後方互換）', () {
      expect(
        resolveAccountingReopenSuccessMessage({'success': true}),
        kAccountingReopenSuccessMessageUnsettled,
      );
    });
  });
}
