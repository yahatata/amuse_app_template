import 'package:amuse_app_template/StaffDate/errors/staff_shift_errors.dart';
import 'package:amuse_app_template/StaffDate/utils/required_staff_slot_validation.dart';
import 'package:amuse_app_template/core/errors/errors.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter_test/flutter_test.dart';

class _TestFirebaseFunctionsException implements FirebaseFunctionsException {
  _TestFirebaseFunctionsException({
    required this.code,
    this.message,
    this.details,
  });

  @override
  final String code;
  @override
  final String? message;
  @override
  final dynamic details;
  @override
  String get plugin => 'cloud_functions';
  @override
  StackTrace? get stackTrace => null;
}

void main() {
  tearDown(() {
    ErrorMessageRegistry.instance.clear();
  });

  group('STAFF create / shift callable mapping', () {
    test('STAFF FFE raw message 非表示（共通 mapStaffShiftCallableError）', () {
      final msg = mapStaffShiftCallableError(
        _TestFirebaseFunctionsException(
          code: 'invalid-argument',
          message: 'uid=secret path=/staffs/abc',
          details: {'errorKey': 'UNKNOWN_ERROR'},
        ),
        operation: 'updateDayAssignments',
      );
      expect(msg, isNot(contains('uid=secret')));
      expect(msg, isNot(contains('/staffs/')));
      expect(msg, isNot(contains('path=')));
    });

    test('STAFF 通常 Exception raw 非表示', () {
      final msg = mapStaffShiftCallableError(
        Exception('secret create failure'),
        operation: 'updateDayAssignments',
      );
      expect(msg, kFinalFallbackErrorMessage);
      expect(msg, isNot(contains('secret create')));
    });

    test('STAFF-05 updateDayAssignments: raw 非表示', () {
      final msg = mapStaffShiftCallableError(
        _TestFirebaseFunctionsException(
          code: 'failed-precondition',
          message: 'assignment leak uid=x',
        ),
        operation: 'updateDayAssignments',
      );
      expect(msg, isNot(contains('uid=x')));
      expect(msg, isNot(contains('assignment leak')));
      expect(msg, contains('状態'));
    });
  });

  group('STAFF-14 partial success', () {
    test('hours saved + shift init fail → partial outcome', () {
      final outcome = resolveBusinessHoursShiftInitOutcome(
        hoursSaved: true,
        shiftInitSucceeded: false,
      );
      expect(outcome, BusinessHoursShiftInitOutcome.hoursSavedShiftInitFailed);
      final msg = messageForBusinessHoursShiftInitOutcome(outcome);
      expect(msg, kBusinessHoursSavedShiftInitFailedMessage);
      expect(msg, contains('営業時間は保存'));
      expect(msg, contains('シフト日の初期化'));
      expect(msg, isNot(contains('Exception')));
      expect(msg, isNot(contains('uid=')));
    });

    test('hours fail → not partial success', () {
      final outcome = resolveBusinessHoursShiftInitOutcome(
        hoursSaved: false,
        shiftInitSucceeded: false,
      );
      expect(outcome, BusinessHoursShiftInitOutcome.hoursSaveFailed);
      expect(messageForBusinessHoursShiftInitOutcome(outcome), isNull);
    });

    test('both succeed → no failure message', () {
      final outcome = resolveBusinessHoursShiftInitOutcome(
        hoursSaved: true,
        shiftInitSucceeded: true,
      );
      expect(outcome, BusinessHoursShiftInitOutcome.bothSucceeded);
      expect(messageForBusinessHoursShiftInitOutcome(outcome), isNull);
    });

    test('initShiftDaysForMonth fail mapping: raw 非表示', () {
      final msg = mapStaffShiftCallableError(
        Exception('init failed path=/shifts/2026-09'),
        operation: 'initShiftDaysForMonth',
      );
      expect(msg, kFinalFallbackErrorMessage);
      expect(msg, isNot(contains('/shifts/')));
      expect(msg, isNot(contains('init failed')));
    });
  });

  group('STAFF Firestore load fail messages', () {
    test('shift / staff list / draft / business hours: fixed, no path', () {
      expect(kShiftDayLoadFailedMessage, contains('シフト'));
      expect(kStaffListLoadFailedMessage, contains('スタッフ一覧'));
      expect(kShiftDraftLoadFailedMessage, contains('下書き'));
      expect(kBusinessHoursLoadFailedMessage, contains('営業時間'));
      for (final msg in [
        kShiftDayLoadFailedMessage,
        kStaffListLoadFailedMessage,
        kShiftDraftLoadFailedMessage,
        kBusinessHoursLoadFailedMessage,
      ]) {
        expect(msg, isNot(contains('projects/')));
        expect(msg, isNot(contains('Exception')));
      }
    });
  });

  group('STAFF-15/16 required staff', () {
    test('STAFF-15 save fail message has no \$e placeholder text', () {
      expect(kRequiredStaffSaveFailedMessage, contains('設定の保存'));
      expect(kRequiredStaffSaveFailedMessage, isNot(contains('(\$')));
      expect(kRequiredStaffSaveFailedMessage, isNot(contains('Exception')));
    });

    test('STAFF-16 local validation messages are fixed (no raw)', () {
      final overlapping = validateRequiredStaffByStyle({
        'weekday': [
          {'startHour': 10, 'endHour': 9, 'requiredCount': 2},
        ],
        'weekendHoliday': [],
        'event': [],
        'allDay': [],
        'closed': [],
      });
      expect(overlapping, isNotNull);
      expect(overlapping, contains('開始時刻'));
      expect(overlapping, isNot(contains('Exception')));

      final missing = validateRequiredStaffByStyle({
        'weekday': [
          {'startHour': 10},
        ],
        'weekendHoliday': [],
        'event': [],
        'allDay': [],
        'closed': [],
      });
      expect(missing, contains('未入力'));
    });
  });
}
