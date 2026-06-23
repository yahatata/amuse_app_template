/// Functions `findGapTimeSlots` と同等の 60 分刻み gap 判定
List<({int start, int end})> findGapTimeSlots({
  required int openMinute,
  required int closeMinute,
  required List<({int startMinute, int endMinute})> assignments,
}) {
  if (openMinute >= closeMinute || assignments.isEmpty) {
    return [];
  }

  final gapSlots = <({int start, int end})>[];

  for (int hourStart = openMinute; hourStart < closeMinute; hourStart += 60) {
    final hourEnd = hourStart + 60;
    var hasStaff = false;

    for (final assignment in assignments) {
      if (assignment.startMinute < hourEnd && assignment.endMinute > hourStart) {
        hasStaff = true;
        break;
      }
    }

    if (!hasStaff) {
      gapSlots.add((start: hourStart, end: hourEnd));
    }
  }

  return gapSlots;
}
