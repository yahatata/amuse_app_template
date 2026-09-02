import 'package:amuse_app_template/Accounting/carryover_unsettled.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('isCarryoverUnsettledBillFromCloseSummary', () {
    test('unresolved=true', () {
      expect(
        isCarryoverUnsettledBillFromCloseSummary({'unresolved': true}),
        isTrue,
      );
    });

    test('証跡のみ（settle後）', () {
      expect(
        isCarryoverUnsettledBillFromCloseSummary({
          'unresolved': false,
          'closedBusinessDate': '2026-08-23',
          'lastCloseRunId': 'close-1',
        }),
        isTrue,
      );
    });

    test('証跡なし', () {
      expect(
        isCarryoverUnsettledBillFromCloseSummary({'unresolved': false}),
        isFalse,
      );
      expect(isCarryoverUnsettledBillFromCloseSummary(null), isFalse);
    });
  });
}
