import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

/// shiftDateDialog / shiftHomePage が gap 表示に merge を通すことを静的確認
void main() {
  test('shiftDateDialog merges gap slots before display', () {
    final source = File('lib/StaffDate/shiftDateDialog.dart').readAsStringSync();
    expect(source, contains("import 'utils/merge_consecutive_gap_slots.dart';"));
    expect(source, contains('mergeConsecutiveGapSlots('));
    expect(source, contains('findGapTimeSlots('));
  });

  test('shiftHomePage merges gap slots before display', () {
    final source = File('lib/StaffDate/shiftHomePage.dart').readAsStringSync();
    expect(source, contains("import 'utils/merge_consecutive_gap_slots.dart';"));
    expect(source, contains('mergeConsecutiveGapSlots('));
    expect(source, contains('findGapTimeSlots('));
  });
}
