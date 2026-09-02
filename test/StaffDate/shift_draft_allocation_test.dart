import 'package:flutter_test/flutter_test.dart';
import 'package:amuse_app_template/StaffDate/shift_draft_allocation.dart';

void main() {
  group('requestDisplayRange', () {
    test('uses latest start/end after staff resubmit', () {
      const originalStart = 18 * 60; // 18:00
      const originalEnd = 23 * 60; // 23:00
      const latestStart = 19 * 60; // 19:00
      const latestEnd = 22 * 60; // 22:00

      final display = requestDisplayRange(
        startMinute: latestStart,
        endMinute: latestEnd,
      );

      expect(display.startMinute, latestStart);
      expect(display.endMinute, latestEnd);
      expect(display.startMinute, isNot(originalStart));
      expect(display.endMinute, isNot(originalEnd));
    });
  });

  group('sliderConstraintRange', () {
    test('ignores original audit fields for UI limits', () {
      const latestStart = 19 * 60;
      const latestEnd = 22 * 60;
      const originalStart = 18 * 60;
      const originalEnd = 23 * 60;

      final range = sliderConstraintRange(
        startMinute: latestStart,
        endMinute: latestEnd,
        originalStartMinute: originalStart,
        originalEndMinute: originalEnd,
      );

      expect(range.startMinute, latestStart);
      expect(range.endMinute, latestEnd);
      expect(range.startMinute, isNot(originalStart));
      expect(range.endMinute, isNot(originalEnd));
    });
  });

  group('initialAllocationRange', () {
    test('matches latest request on pending open', () {
      const start = 19 * 60;
      const end = 22 * 60;

      final allocation = initialAllocationRange(
        startMinute: start,
        endMinute: end,
      );

      expect(allocation.startMinute, start);
      expect(allocation.endMinute, end);
    });
  });

  group('clampAllocationWithinRequest', () {
    test('allows allocation inside latest request only', () {
      const requestStart = 19 * 60;
      const requestEnd = 22 * 60;

      final result = clampAllocationWithinRequest(
        requestStartMinute: requestStart,
        requestEndMinute: requestEnd,
        newStartMinute: 19 * 60,
        newEndMinute: 21 * 60,
      );

      expect(result, isNotNull);
      expect(result!.startMinute, 19 * 60);
      expect(result.endMinute, 21 * 60);
    });

    test('clamps allocation to latest request when wider than request (not original)', () {
      const requestStart = 19 * 60;
      const requestEnd = 22 * 60;

      final result = clampAllocationWithinRequest(
        requestStartMinute: requestStart,
        requestEndMinute: requestEnd,
        newStartMinute: 18 * 60,
        newEndMinute: 23 * 60,
      );

      expect(result, isNotNull);
      expect(result!.startMinute, requestStart);
      expect(result.endMinute, requestEnd);
    });

    test('request display unchanged when allocation narrows', () {
      const latestStart = 19 * 60;
      const latestEnd = 22 * 60;

      final request = requestDisplayRange(
        startMinute: latestStart,
        endMinute: latestEnd,
      );

      final allocation = clampAllocationWithinRequest(
        requestStartMinute: latestStart,
        requestEndMinute: latestEnd,
        newStartMinute: 19 * 60,
        newEndMinute: 21 * 60,
      );

      expect(request.startMinute, latestStart);
      expect(request.endMinute, latestEnd);
      expect(allocation!.endMinute, 21 * 60);
      expect(allocation.endMinute, isNot(request.endMinute));
    });
  });
}
