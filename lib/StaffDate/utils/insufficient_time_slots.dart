/// Functions `findInsufficientTimeSlots` と同等の 1 時間刻み不足判定
List<({int start, int end, int required, int current})> findInsufficientTimeSlots({
  required int openMinute,
  required int closeMinute,
  required List<({int startMinute, int endMinute})> assignments,
  required List<Map<String, int>> requiredStaffByTimeSlot,
}) {
  if (openMinute >= closeMinute || requiredStaffByTimeSlot.isEmpty) {
    return [];
  }

  final insufficientSlots = <({int start, int end, int required, int current})>[];

  for (final slot in requiredStaffByTimeSlot) {
    final startHour = slot['startHour']!;
    final endHour = slot['endHour']!;
    final requiredCount = slot['requiredCount']!;

    final slotStartMinutes = startHour * 60;
    final slotEndMinutes = endHour * 60;

    if (slotEndMinutes <= openMinute || slotStartMinutes >= closeMinute) {
      continue;
    }

    for (int hour = startHour; hour < endHour; hour++) {
      final hourStartMinutes = hour * 60;
      final hourEndMinutes = (hour + 1) * 60;

      final hourCheckStart =
          hourStartMinutes > openMinute ? hourStartMinutes : openMinute;
      final hourCheckEnd =
          hourEndMinutes < closeMinute ? hourEndMinutes : closeMinute;

      if (hourCheckStart >= hourCheckEnd) {
        continue;
      }

      var currentCount = 0;
      for (final assignment in assignments) {
        if (assignment.startMinute < hourEndMinutes &&
            assignment.endMinute > hourStartMinutes) {
          currentCount++;
        }
      }

      if (currentCount < requiredCount) {
        insufficientSlots.add((
          start: hourStartMinutes,
          end: hourEndMinutes,
          required: requiredCount,
          current: currentCount,
        ));
      }
    }
  }

  insufficientSlots.sort((a, b) => a.start.compareTo(b.start));
  return insufficientSlots;
}
