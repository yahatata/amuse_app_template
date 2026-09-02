import 'package:flutter_test/flutter_test.dart';
import 'package:amuse_app_template/StaffDate/utils/merge_consecutive_gap_slots.dart';
import 'package:amuse_app_template/StaffDate/utils/merge_consecutive_insufficient_slots.dart';

void main() {
  group('mergeConsecutiveGapSlots', () {
    test('empty → empty', () {
      expect(mergeConsecutiveGapSlots([]), isEmpty);
    });

    test('single → unchanged', () {
      final slots = [(start: 1320, end: 1380)];
      expect(mergeConsecutiveGapSlots(slots), [(start: 1320, end: 1380)]);
    });

    test('two consecutive → one', () {
      final slots = [
        (start: 1320, end: 1380),
        (start: 1380, end: 1440),
      ];
      expect(mergeConsecutiveGapSlots(slots), [(start: 1320, end: 1440)]);
    });

    test('three consecutive → one', () {
      final slots = [
        (start: 1320, end: 1380),
        (start: 1380, end: 1440),
        (start: 1440, end: 1500),
      ];
      expect(mergeConsecutiveGapSlots(slots), [(start: 1320, end: 1500)]);
    });

    test('non-adjacent mid gap → two ranges', () {
      final slots = [
        (start: 1080, end: 1140), // 18-19
        (start: 1140, end: 1200), // 19-20
        (start: 1320, end: 1380), // 22-23 (gap in between)
      ];
      expect(mergeConsecutiveGapSlots(slots), [
        (start: 1080, end: 1200),
        (start: 1320, end: 1380),
      ]);
    });

    test('midnight-crossing minutes merge to single range', () {
      final slots = [
        (start: 1320, end: 1380),
        (start: 1380, end: 1440),
        (start: 1440, end: 1500),
      ];
      expect(mergeConsecutiveGapSlots(slots), [(start: 1320, end: 1500)]);
    });

    test('unsorted input is sorted before merge', () {
      final slots = [
        (start: 1380, end: 1440),
        (start: 1320, end: 1380),
      ];
      expect(mergeConsecutiveGapSlots(slots), [(start: 1320, end: 1440)]);
    });
  });

  group('mergeConsecutiveInsufficientSlots regression', () {
    test('same required/current adjacent slots still merge', () {
      final slots = [
        (start: 18 * 60, end: 19 * 60, required: 3, current: 2),
        (start: 19 * 60, end: 20 * 60, required: 3, current: 2),
      ];
      expect(mergeConsecutiveInsufficientSlots(slots), [
        (start: 18 * 60, end: 20 * 60, required: 3, current: 2),
      ]);
    });

    test('different current does not merge', () {
      final slots = [
        (start: 18 * 60, end: 19 * 60, required: 3, current: 2),
        (start: 19 * 60, end: 20 * 60, required: 3, current: 1),
      ];
      expect(mergeConsecutiveInsufficientSlots(slots), slots);
    });
  });
}
