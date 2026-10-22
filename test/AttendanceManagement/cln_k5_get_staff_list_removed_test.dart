import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  group('CLN-K5 attendanceService.getStaffList removed', () {
    test('Dart getStaffList method / helper types が無い', () {
      final src =
          File('lib/AttendanceManagement/attendanceService.dart').readAsStringSync();
      expect(src.contains('Future<GetStaffListResult> getStaffList'), isFalse);
      expect(src.contains('class GetStaffListResult'), isFalse);
      expect(src.contains('class StaffData'), isFalse);
    });

    test('Functions callable 名は Dart から消えても source export は残る', () {
      final dart =
          File('lib/AttendanceManagement/attendanceService.dart').readAsStringSync();
      expect(dart.contains("httpsCallable('getStaffListForAttendance')"), isFalse);

      final export = File(
        'functions/src/domains/attendance/index.ts',
      ).readAsStringSync();
      expect(export.contains('getStaffListForAttendance'), isTrue);
    });

    test('正式打刻経路 clockIn / clockOut は残る', () {
      final src =
          File('lib/AttendanceManagement/attendanceService.dart').readAsStringSync();
      expect(src.contains("httpsCallable('clockIn')"), isTrue);
      expect(src.contains("httpsCallable('clockOut')"), isTrue);
      final qr = File('lib/AttendanceManagement/qrScanPage.dart').readAsStringSync();
      expect(qr.contains('_attendanceService.clockIn'), isTrue);
      expect(qr.contains('_attendanceService.clockOut'), isTrue);
    });
  });
}
