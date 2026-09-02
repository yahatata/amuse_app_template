import 'package:amuse_app_template/payroll/utils/staff_results_summary.dart';
import 'package:amuse_app_template/payroll/widgets/staff_card.dart';
import 'package:flutter_test/flutter_test.dart';

StaffCardData _staff({
  required String id,
  required int minutes,
  required int grossPay,
  int overtime = 0,
  int holiday = 0,
}) {
  return StaffCardData(
    staffId: id,
    staffName: id,
    totalActualWorkMinutes: minutes,
    grossPay: grossPay,
    totalLegalOvertimeMinutes: overtime,
    totalLegalHolidayWorkMinutes: holiday,
    over60OvertimeMinutes: 0,
    carryOverAttendanceCount: 0,
    carryOverGrossPay: 0,
    baseHourlyWage: 0,
    totalNightWorkMinutes: 0,
    totalNonLegalHolidayWorkMinutes: 0,
    basePay: 0,
    lateNightPremiumPay: 0,
    overtimePremiumPay: 0,
    over60PremiumPay: 0,
    legalHolidayPremiumPay: 0,
  );
}

void main() {
  group('staff results summary bug fix', () {
    test('grossPay=0 only → visible cards 0, summary minutes 1081', () {
      final all = [
        _staff(id: 'a', minutes: 502, grossPay: 0),
        _staff(id: 'b', minutes: 579, grossPay: 0),
      ];
      final visible = visibleStaffResultCards(all);
      final summary = summarizeStaffResultsTime(all);

      expect(visible, isEmpty);
      expect(summary.totalActualWorkMinutes, 1081);
    });

    test('mixed grossPay → summary sums all, cards exclude zero pay', () {
      final all = [
        _staff(id: 'paid', minutes: 300, grossPay: 5000, overtime: 10),
        _staff(id: 'zero', minutes: 200, grossPay: 0, holiday: 5),
      ];
      final visible = visibleStaffResultCards(all);
      final summary = summarizeStaffResultsTime(all);

      expect(visible, hasLength(1));
      expect(visible.first.staffId, 'paid');
      expect(summary.totalActualWorkMinutes, 500);
      expect(summary.totalLegalOvertimeMinutes, 10);
      expect(summary.totalLegalHolidayWorkMinutes, 5);
    });
  });
}
