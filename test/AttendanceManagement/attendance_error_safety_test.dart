import 'dart:convert';

import 'package:amuse_app_template/AttendanceManagement/attendance_user_facing_errors.dart';
import 'package:amuse_app_template/core/errors/errors.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  tearDown(() {
    ErrorMessageRegistry.instance.clear();
  });

  group('ATT-01 QR parse safety', () {
    test('不正 JSON は固定文言（QR 本文・内部例外を出さない）', () {
      const bad = '{not-json uid=secret-staff-xyz}';
      expect(
        () => extractStaffIdFromAttendanceQr(bad),
        throwsA(isA<AttendanceQrParseException>()),
      );
      try {
        extractStaffIdFromAttendanceQr(bad);
      } catch (e) {
        final msg = mapAttendanceQrParseError(e);
        expect(msg, kAttendanceQrInvalidFormatMessage);
        expect(msg, isNot(contains('secret-staff')));
        expect(msg, isNot(contains(bad)));
        expect(msg, isNot(contains('FormatException')));
      }
    });

    test('スタッフ以外 type は固定文言', () {
      final payload = jsonEncode({
        'uid': 'staff-should-not-leak',
        'type': 'guest',
        'timestamp': DateTime.now().millisecondsSinceEpoch,
      });
      try {
        extractStaffIdFromAttendanceQr(payload);
        fail('expected AttendanceQrParseException');
      } catch (e) {
        final msg = mapAttendanceQrParseError(e);
        expect(msg, kAttendanceQrNotStaffMessage);
        expect(msg, isNot(contains('staff-should-not-leak')));
        expect(msg, isNot(contains(payload)));
      }
    });

    test('未知例外も最終固定文言へ（toString 非表示）', () {
      final msg = mapAttendanceQrParseError(
        Exception('raw qr body {"uid":"x"} path=/staffs/y'),
      );
      expect(msg, kAttendanceQrParseFailedMessage);
      expect(msg, isNot(contains('raw qr')));
      expect(msg, isNot(contains('/staffs/')));
    });
  });

  group('ATT-09 getAllStaffAttendance fail vs empty', () {
    test('空一覧成功と読込失敗は別契約', () {
      const emptySuccessUiHint = '該当する勤怠記録がありません';
      expect(kAttendanceDataLoadFailedMessage, isNot(emptySuccessUiHint));
      expect(kAttendanceDataLoadFailedMessage, contains('取得できませんでした'));
      expect(kAttendanceDataLoadFailedMessage, isNot(contains('Firebase')));
      expect(kAttendanceDataLoadFailedMessage, isNot(contains('attendances/')));
    });

    test('hard-fail は raw message / path を出さない', () {
      const secret = 'uid=secret path=/attendances/abc';
      final mapped = mapAttendanceCallableError(
        FirebaseFunctionsException(
          code: 'permission-denied',
          message: secret,
        ),
        operation: 'getAllStaffAttendance',
      );
      expect(mapped, 'この操作の権限がありません。');
      expect(mapped, isNot(contains(secret)));
      expect(mapped, isNot(contains('uid=')));
      expect(mapped, isNot(contains('/attendances/')));
    });

    test('soft-fail は message/error を出さない', () {
      const rawMessage = 'backend attendance raw';
      const rawError = 'internal getAllStaffAttendance';
      final mapped = mapAttendanceCallableSoftFail(
        {
          'success': false,
          'message': rawMessage,
          'error': rawError,
        },
        operation: 'getAllStaffAttendance',
      );
      expect(mapped, kFinalFallbackErrorMessage);
      expect(mapped, isNot(contains(rawMessage)));
      expect(mapped, isNot(contains(rawError)));
      expect(isCallableSuccessResponse({'success': false}), isFalse);
      expect(isCallableSuccessResponse({'success': true, 'attendances': []}), isTrue);
    });
  });

  group('ATT-19 updateUnclockedAttendanceWithAuth', () {
    test('success==true のみ成功', () {
      expect(
        isCallableSuccessResponse({'success': true}),
        isTrue,
      );
      expect(
        isCallableSuccessResponse({'success': false}),
        isFalse,
      );
      expect(
        isCallableSuccessResponse({'success': 'true'}),
        isFalse,
      );
      expect(isCallableSuccessResponse(null), isFalse);
      expect(isCallableSuccessResponse('ok'), isFalse);
    });

    test('hard-fail は e.message / toString を出さない', () {
      const secret = 'password=leak path=/attendances/x';
      final mapped = mapAttendanceCallableError(
        FirebaseFunctionsException(
          code: 'unauthenticated',
          message: secret,
        ),
        operation: 'updateUnclockedAttendanceWithAuth',
      );
      expect(mapped, '認証情報を確認できませんでした。再度ログインしてください。');
      expect(mapped, isNot(contains(secret)));
      expect(mapped, isNot(contains('password=')));
    });

    test('soft-fail は raw message 非表示', () {
      final mapped = mapAttendanceCallableSoftFail(
        {
          'success': false,
          'message': 'adminPassword mismatch detail',
          'error': 'AUTH_FAIL',
        },
        operation: 'updateUnclockedAttendanceWithAuth',
      );
      expect(mapped, isNot(contains('adminPassword')));
      expect(mapped, isNot(contains('AUTH_FAIL')));
    });
  });

  group('ATT-20 admin attendance list stream', () {
    test('hasError=true は true', () {
      final snapshot = AsyncSnapshot<Object?>.withError(
        ConnectionState.active,
        Exception('secret-firestore-path /attendances/uid-xyz'),
      );
      expect(attendanceListStreamHasError(snapshot), isTrue);
    });

    test('hasError=false は false', () {
      const snapshot = AsyncSnapshot<Object?>.withData(
        ConnectionState.active,
        Object(),
      );
      expect(attendanceListStreamHasError(snapshot), isFalse);
    });

    test('waiting のみでは error 扱いにしない', () {
      const snapshot = AsyncSnapshot<Object?>.nothing();
      expect(attendanceListStreamHasError(snapshot), isFalse);
    });

    test('文言は固定で raw error を出さない', () {
      final secret = Exception('SHOULD_NOT_APPEAR /attendances/doc');
      final msg = attendanceListStreamErrorMessage(secret);
      expect(msg, kAttendanceListStreamFailedMessage);
      expect(msg, contains('取得できませんでした'));
      expect(msg, isNot(contains('SHOULD_NOT_APPEAR')));
      expect(msg, isNot(contains('/attendances/')));
    });
  });
}
