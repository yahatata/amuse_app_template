import '../widgets/staff_card.dart';

/// §4-1: 全 staffResults から時間系サマリを合算する。
class StaffResultsTimeSummary {
  final int totalActualWorkMinutes;
  final int totalLegalOvertimeMinutes;
  final int totalLegalHolidayWorkMinutes;

  const StaffResultsTimeSummary({
    required this.totalActualWorkMinutes,
    required this.totalLegalOvertimeMinutes,
    required this.totalLegalHolidayWorkMinutes,
  });
}

StaffResultsTimeSummary summarizeStaffResultsTime(
  Iterable<StaffCardData> allStaffResults,
) {
  var actual = 0;
  var overtime = 0;
  var holiday = 0;
  for (final staff in allStaffResults) {
    actual += staff.totalActualWorkMinutes;
    overtime += staff.totalLegalOvertimeMinutes;
    holiday += staff.totalLegalHolidayWorkMinutes;
  }
  return StaffResultsTimeSummary(
    totalActualWorkMinutes: actual,
    totalLegalOvertimeMinutes: overtime,
    totalLegalHolidayWorkMinutes: holiday,
  );
}

/// §4-2: grossPay=0 の staff card は非表示。
List<StaffCardData> visibleStaffResultCards(
  Iterable<StaffCardData> allStaffResults,
) {
  return allStaffResults.where((s) => s.grossPay != 0).toList();
}
