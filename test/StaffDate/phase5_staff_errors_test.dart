import 'package:amuse_app_template/StaffDate/errors/staff_shift_errors.dart';
import 'package:amuse_app_template/StaffDate/utils/required_staff_slot_validation.dart';
import 'package:amuse_app_template/core/errors/errors.dart';
import 'package:cloud_functions/cloud_functions.dart';
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

  group('Phase 5 Staff/Shift', () {
    test('STAFF FFE: raw 非表示（共通 mapStaffShiftCallableError）', () {
      final msg = mapStaffShiftCallableError(
        _TestFirebaseFunctionsException(
          code: 'permission-denied',
          message: 'uid=secret path=/internal',
          details: {'errorKey': 'UNKNOWN_ERROR'},
        ),
        operation: 'updateDayAssignments',
      );
      expect(msg, isNot(contains('uid=secret')));
      expect(msg, isNot(contains('/internal')));
      expect(msg, contains('権限'));
    });

    test('STAFF-05 updateDayAssignments Exception: raw 非表示', () {
      final msg = mapStaffShiftCallableError(
        Exception('secret internal exception'),
        operation: 'updateDayAssignments',
      );
      expect(msg, isNot(contains('secret internal')));
    });

    test('STAFF-14 部分成功文言は営業時間保存と初期化失敗を区別', () {
      expect(kBusinessHoursSavedShiftInitFailedMessage, contains('営業時間'));
      expect(kBusinessHoursSavedShiftInitFailedMessage, contains('初期化'));
      expect(kBusinessHoursSavedShiftInitFailedMessage, isNot(contains('toString')));
      expect(kBusinessHoursSavedShiftInitFailedMessage, isNot(contains('\$e')));
    });

    test('STAFF-12/10 Firestore 読込失敗文言は空と区別', () {
      expect(kBusinessHoursLoadFailedMessage, contains('取得できませんでした'));
      expect(kShiftDraftLoadFailedMessage, contains('取得できませんでした'));
      expect(kShiftDayLoadFailedMessage, contains('取得できませんでした'));
    });

    test('STAFF-16 validation: 固定文言のみ（raw なし）', () {
      final err = validateRequiredStaffByStyle({
        'weekday': [
          {'startHour': 10, 'endHour': 9, 'requiredCount': 2},
        ],
      });
      expect(err, isNotNull);
      expect(err, isNot(contains('Exception')));
      expect(err, contains('開始時刻'));
    });

    test('STAFF-15 保存失敗文言に raw を付けない', () {
      expect(kRequiredStaffSaveFailedMessage, isNot(contains('\$e')));
      expect(kRequiredStaffSaveFailedMessage, contains('再度保存'));
    });
  });
}
