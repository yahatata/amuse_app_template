import 'dart:io';

import 'package:amuse_app_template/AttendanceManagement/attendanceService.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('CLN-E6 admin attendance wall-clock → UTC ISO', () {
    test('JST 12:00–18:00 local wall clock → 03:00Z–09:00Z payload', () {
      // 端末 TZ に依存しないよう、明示 offset 付きローカル相当を作る。
      // DateTime の「壁時計」入力は form が DateTime(y,m,d,h,min) で組み立てる想定。
      final clockIn = DateTime.parse('2026-08-22T12:00:00+09:00');
      final clockOut = DateTime.parse('2026-08-22T18:00:00+09:00');

      final inIso = attendanceWallClockToUtcIso(clockIn);
      final outIso = attendanceWallClockToUtcIso(clockOut);

      expect(inIso, '2026-08-22T03:00:00.000Z');
      expect(outIso, '2026-08-22T09:00:00.000Z');

      // Functions `new Date(iso)` + UI `toDate()` 相当の往復で壁時計が戻る
      expect(DateTime.parse(inIso).toUtc().add(const Duration(hours: 9)).hour, 12);
      expect(DateTime.parse(outIso).toUtc().add(const Duration(hours: 9)).hour, 18);
    });

    test('naive local DateTime uses toUtc (Z present, not offset-less local)', () {
      final local = DateTime(2026, 8, 22, 12, 0);
      final iso = attendanceWallClockToUtcIso(local);
      expect(iso.endsWith('Z'), isTrue);
      expect(iso.contains('+'), isFalse);
      // 旧バグ: toIso8601String() は Z 無しで Functions が UTC 誤解釈する
      expect(local.toIso8601String().endsWith('Z'), isFalse);
    });
  });

  group('CLN-E6 attendanceService wiring', () {
    final src = File(
      'lib/AttendanceManagement/attendanceService.dart',
    ).readAsStringSync();

    test('create/update use attendanceWallClockToUtcIso', () {
      expect(src.contains('attendanceWallClockToUtcIso(clockIn)'), isTrue);
      expect(src.contains('attendanceWallClockToUtcIso(clockOut)'), isTrue);
      expect(
        src.contains("attendanceWallClockToUtcIso(b['startedAt'] as DateTime)"),
        isTrue,
      );
      expect(
        src.contains("attendanceWallClockToUtcIso(b['endedAt'] as DateTime)"),
        isTrue,
      );
    });

    test('create/update do not send offset-less toIso8601String for wall clocks', () {
      // markDeleted 以外の clockIn/Out/breaks 送信経路は helper 経由のみ
      expect(src.contains("params['clockIn'] = clockIn.toIso8601String()"), isFalse);
      expect(
        src.contains("'clockIn': clockIn.toIso8601String()"),
        isFalse,
      );
      expect(
        src.contains("'startedAt': (b['startedAt'] as DateTime).toIso8601String()"),
        isFalse,
      );
    });
  });

  group('CLN-E6 AdminAttendanceFormPage loading wiring', () {
    final src = File(
      'lib/AttendanceManagement/admin_attendance_editAndCreate_page.dart',
    ).readAsStringSync();

    test('fullscreen overlay + AbsorbPointer while _isSaving', () {
      expect(src.contains('if (_isSaving)'), isTrue);
      expect(src.contains('AbsorbPointer'), isTrue);
      expect(src.contains('Colors.black.withValues(alpha: 0.35)'), isTrue);
      expect(src.contains('CircularProgressIndicator()'), isTrue);
      expect(src.contains('canPop: !_isSaving'), isTrue);
    });

    test('submit and delete buttons disable while saving', () {
      expect(src.contains('onPressed: _isSaving ? null : _onSubmit'), isTrue);
      expect(src.contains('onPressed: _isSaving ? null : _onMarkDeleted'), isTrue);
    });

    test('_isSaving cleared in finally for mutations', () {
      expect(src.contains('setState(() => _isSaving = false)'), isTrue);
      expect(src.contains('finally'), isTrue);
    });

    test('showTimePicker kept (no picker redesign)', () {
      expect(src.contains('showTimePicker'), isTrue);
    });
  });

  group('CLN-E6 AdminAttendanceListPage hides logical deletes', () {
    final src = File(
      'lib/AttendanceManagement/admin_attendance_list_page.dart',
    ).readAsStringSync();

    test('filters isDeleted == true out of normal list', () {
      expect(
        src.contains(".where((d) => d.data()['isDeleted'] != true)"),
        isTrue,
      );
    });

    test('does not render 削除済み status row in list UI', () {
      expect(src.contains("status = '削除済み'"), isFalse);
      expect(src.contains('（論理削除済み）'), isFalse);
    });

    test('still queries by date only (DB docs retained; no schema change)', () {
      expect(src.contains(".where('date', isEqualTo: dateKey)"), isTrue);
      expect(src.contains("collection('attendances')"), isTrue);
    });
  });
}
