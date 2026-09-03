import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  group('Unclocked attendance list production query', () {
    test('debug query-test residue is gone', () {
      final src =
          File('lib/Home/unclocked_attendance_list_page.dart').readAsStringSync();
      expect(src.contains('_QueryTestMode'), isFalse);
      expect(src.contains('_queryTestMode'), isFalse);
      expect(src.contains('UNCLOCKED_LIST_INDEX_DEBUG'), isFalse);
      expect(src.contains('testA'), isFalse);
      expect(src.contains('testB'), isFalse);
      expect(src.contains('testC'), isFalse);
    });

    test('keeps former testA Firestore semantics', () {
      final src =
          File('lib/Home/unclocked_attendance_list_page.dart').readAsStringSync();
      expect(src.contains("collection('attendances')"), isTrue);
      expect(
        src.contains(".where('closedStoreWithoutClockOut', isEqualTo: true)"),
        isTrue,
      );
      expect(src.contains('static const _limit = 200'), isTrue);
      expect(src.contains('.limit(_limit)'), isTrue);
      expect(src.contains("orderBy('date'"), isFalse);
      expect(src.contains("orderBy('clockIn'"), isFalse);
      expect(src.contains('_sortItems('), isTrue);
    });

    test('UI still maps snapshot errors to user-facing copy', () {
      final src =
          File('lib/Home/unclocked_attendance_list_page.dart').readAsStringSync();
      expect(src.contains('kAttendanceDataLoadFailedMessage'), isTrue);
    });
  });
}
