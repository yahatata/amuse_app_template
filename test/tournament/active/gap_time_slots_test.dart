import 'package:amuse_app_template/StaffDate/utils/gap_time_slots.dart';
import 'package:amuse_app_template/StaffDate/utils/merge_consecutive_insufficient_slots.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('findGapTimeSlots', () {
    test('60分刻みで空き時間帯を検出', () {
      final gaps = findGapTimeSlots(
        openMinute: 600,
        closeMinute: 840,
        assignments: [(startMinute: 600, endMinute: 720)],
      );
      expect(gaps, [(start: 720, end: 780), (start: 780, end: 840)]);
    });

    test('assignments が空なら空', () {
      expect(
        findGapTimeSlots(
          openMinute: 600,
          closeMinute: 840,
          assignments: [],
        ),
        isEmpty,
      );
    });
  });

  group('mergeConsecutiveInsufficientSlots', () {
    test('required/current が同じ連続スロットをマージ', () {
      final merged = mergeConsecutiveInsufficientSlots([
        (start: 1080, end: 1140, required: 3, current: 2),
        (start: 1140, end: 1200, required: 3, current: 2),
        (start: 1200, end: 1260, required: 3, current: 1),
      ]);
      expect(merged, [
        (start: 1080, end: 1200, required: 3, current: 2),
        (start: 1200, end: 1260, required: 3, current: 1),
      ]);
    });
  });
}
