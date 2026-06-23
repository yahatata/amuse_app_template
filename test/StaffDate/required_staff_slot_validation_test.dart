import 'package:amuse_app_template/StaffDate/utils/required_staff_slot_validation.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('validateRequiredStaffByStyle', () {
    test('正常なスロットは null', () {
      expect(
        validateRequiredStaffByStyle({
          'weekday': [
            {'startHour': 18, 'endHour': 22, 'requiredCount': 2},
          ],
        }),
        isNull,
      );
    });

    test('startHour >= endHour はエラー', () {
      final message = validateRequiredStaffByStyle({
        'weekday': [
          {'startHour': 22, 'endHour': 18, 'requiredCount': 2},
        ],
      });
      expect(message, isNotNull);
      expect(message, contains('開始時刻は終了時刻より前'));
    });

    test('requiredCount < 1 はエラー', () {
      final message = validateRequiredStaffByStyle({
        'event': [
          {'startHour': 10, 'endHour': 12, 'requiredCount': 0},
        ],
      });
      expect(message, isNotNull);
      expect(message, contains('必要人数は1人以上'));
    });
  });

  group('endHourOptionsForStart', () {
    test('開始時刻より後の時刻のみ', () {
      expect(endHourOptionsForStart(18), [19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30]);
      expect(endHourOptionsForStart(18).contains(18), isFalse);
    });
  });
}
