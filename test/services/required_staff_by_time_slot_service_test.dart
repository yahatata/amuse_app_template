import 'package:amuse_app_template/StaffDate/utils/required_staff_resolution.dart';
import 'package:amuse_app_template/services/required_staff_by_time_slot_service.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('resolveRequiredStaffForStyle', () {
    test('休業日は notApplicable', () {
      final resolution = resolveRequiredStaffForStyle(
        docStatus: RequiredStaffDocStatus.ready,
        v2: null,
        styleId: 'closed',
        isClosed: true,
      );
      expect(resolution.status, RequiredStaffStyleStatus.notApplicable);
    });

    test('doc 未完了は docNotReady', () {
      final resolution = resolveRequiredStaffForStyle(
        docStatus: RequiredStaffDocStatus.docMissing,
        v2: null,
        styleId: 'weekday',
        isClosed: false,
      );
      expect(resolution.status, RequiredStaffStyleStatus.docNotReady);
    });

    test('style キーなしは styleNotConfigured', () {
      final resolution = resolveRequiredStaffForStyle(
        docStatus: RequiredStaffDocStatus.ready,
        v2: const RequiredStaffByTimeSlotV2Data(
          version: 2,
          byStyle: {
            'weekday': [
              {'startHour': 19, 'endHour': 22, 'requiredCount': 2},
            ],
          },
        ),
        styleId: 'event',
        isClosed: false,
      );
      expect(resolution.status, RequiredStaffStyleStatus.styleNotConfigured);
    });

    test('[] は disabledByEmptyList', () {
      final resolution = resolveRequiredStaffForStyle(
        docStatus: RequiredStaffDocStatus.ready,
        v2: const RequiredStaffByTimeSlotV2Data(
          version: 2,
          byStyle: {
            'weekendHoliday': [],
          },
        ),
        styleId: 'weekendHoliday',
        isClosed: false,
      );
      expect(resolution.status, RequiredStaffStyleStatus.disabledByEmptyList);
    });

    test('active はスロットを返す', () {
      final resolution = resolveRequiredStaffForStyle(
        docStatus: RequiredStaffDocStatus.ready,
        v2: const RequiredStaffByTimeSlotV2Data(
          version: 2,
          byStyle: {
            'weekday': [
              {'startHour': 19, 'endHour': 22, 'requiredCount': 2},
            ],
          },
        ),
        styleId: 'weekday',
        isClosed: false,
      );
      expect(resolution.status, RequiredStaffStyleStatus.active);
      expect(resolution.slots, hasLength(1));
    });
  });
}
