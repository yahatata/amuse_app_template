/// requiredStaffByTimeSlot 関連のテスト（R-09 分離）
///
/// - デフォルト値の妥当性を検証
/// - RequiredStaffByTimeSlotService の Firestore 購読は integration で検証
import 'package:flutter_test/flutter_test.dart';

import 'package:amuse_app_template/services/store_config_defaults.dart';

void main() {
  group('requiredStaffByTimeSlot デフォルト値', () {
    test('kDefaultRequiredStaffByTimeSlot が妥当', () {
      expect(
        kDefaultRequiredStaffByTimeSlot.length,
        greaterThanOrEqualTo(1),
      );
      for (final slot in kDefaultRequiredStaffByTimeSlot) {
        expect(slot['startHour'], isNotNull);
        expect(slot['endHour'], isNotNull);
        expect(slot['requiredCount'], isNotNull);
      }
    });
  });
}
