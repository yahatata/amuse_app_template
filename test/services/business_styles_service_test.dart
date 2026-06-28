import 'package:amuse_app_template/services/business_styles_service.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('BusinessStylesData', () {
    test('businessHoursStyles / requiredStaffByStyle を styles から導出できる', () {
      const data = BusinessStylesData(
        version: 2,
        styles: {
          'weekday': BusinessStyleData(
            styleId: 'weekday',
            openMinute: 600,
            closeMinute: 1440,
            isClosed: false,
            requiredStaffByTimeSlot: [
              {'startHour': 18, 'endHour': 22, 'requiredCount': 4},
            ],
          ),
        },
      );

      expect(data.businessHoursStyles['weekday']!['openMinute'], 600);
      expect(data.requiredStaffByStyle['weekday'], hasLength(1));
      expect(data.toRequiredStaffV2().byStyle['weekday'], hasLength(1));
    });
  });
}
