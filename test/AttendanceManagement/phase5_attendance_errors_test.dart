import 'package:amuse_app_template/AttendanceManagement/attendance_user_facing_errors.dart';
import 'package:amuse_app_template/core/errors/errors.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

class _TestFirebaseFunctionsException extends FirebaseFunctionsException {
  _TestFirebaseFunctionsException({
    required String message,
    required String code,
    dynamic details,
  }) : super(message: message, code: code, details: details);
}

void main() {
  tearDown(() {
    ErrorMessageRegistry.instance.clear();
  });

  group('Phase 5 Attendance', () {
    test('ATT-01 QR parse: raw 非表示・固定文言', () {
      expect(
        mapAttendanceQrParseError(Exception('qr=SECRET uid=x')),
        kAttendanceQrParseFailedMessage,
      );
      expect(
        mapAttendanceQrParseError(
          const AttendanceQrParseException(kAttendanceQrNotStaffMessage),
        ),
        kAttendanceQrNotStaffMessage,
      );
      expect(
        mapAttendanceQrParseError(Exception('qr=SECRET')),
        isNot(contains('SECRET')),
      );
    });

    test('ATT-09 load fail 文言は 0件表示と別', () {
      expect(kAttendanceDataLoadFailedMessage, isNot(contains('ありません')));
      expect(kAttendanceDataLoadFailedMessage, contains('取得できませんでした'));
    });

    test('ATT-19 Callable FFE: UID/path/raw 非表示', () {
      final msg = mapAttendanceCallableError(
        _TestFirebaseFunctionsException(
          code: 'permission-denied',
          message: 'uid=secret path=/internal',
          details: {'errorKey': 'UNKNOWN_ERROR'},
        ),
        operation: 'updateUnclockedAttendanceWithAuth',
      );
      expect(msg, isNot(contains('uid=secret')));
      expect(msg, isNot(contains('/internal')));
      expect(msg, contains('権限'));
    });

    test('通常 Exception: raw 非表示', () {
      final msg = mapAttendanceCallableError(
        Exception('secret internal exception'),
        operation: 'updateUnclockedAttendanceWithAuth',
      );
      expect(msg, isNot(contains('secret internal')));
    });

    testWidgets('ATT-20 Stream error UI: raw 非表示', (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: Text(attendanceListStreamErrorMessage(
              Exception('projects/x/databases/internal'),
            )),
          ),
        ),
      );
      expect(find.text(kAttendanceListStreamFailedMessage), findsOneWidget);
      expect(find.textContaining('projects/'), findsNothing);
    });
  });
}
