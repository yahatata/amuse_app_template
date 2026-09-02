import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter/foundation.dart';
import 'package:amuse_app_template/AttendanceManagement/attendance_user_facing_errors.dart';
import 'package:amuse_app_template/core/errors/errors.dart';
import 'package:amuse_app_template/core/utils/functions_client.dart';

/// Admin create/update 用。壁時計 DateTime を UTC ISO（Z 付き）へ正規化する。
///
/// offset 無しの `toIso8601String()` は Functions 側 `new Date(iso)` で UTC 誤解釈され +9h ずれる。
/// 未退勤修正の `toUtc().toIso8601String()` と同じ契約。
@visibleForTesting
String attendanceWallClockToUtcIso(DateTime wallClock) =>
    wallClock.toUtc().toIso8601String();

/// 時刻を日本時間の文字列に変換するユーティリティ関数
String formatToJST(String? timeString) {
  if (timeString == null || timeString.isEmpty) return '不明';
  
  try {
    // ISO 8601形式の時刻文字列をパース
    final dateTime = DateTime.parse(timeString);
    
    // UTCからJST（+9時間）に変換
    final jstDateTime = dateTime.toUtc().add(const Duration(hours: 9));
    
    // 日本時間形式でフォーマット
    return '${jstDateTime.year}年${jstDateTime.month}月${jstDateTime.day}日 '
           '${jstDateTime.hour.toString().padLeft(2, '0')}:'
           '${jstDateTime.minute.toString().padLeft(2, '0')}';
  } catch (e) {
    // パースに失敗した場合は元の文字列を返す
    return timeString;
  }
}

class AttendanceService {
  final FirebaseFunctions _functions = FunctionsClient.instance;

  /// 出勤打刻（Phase4 01: clockIn Callable）
  Future<ClockInResult> clockIn(
    String staffId, {
    String? staffName,
    int? adjustmentOffsetMinutes,
  }) async {
    try {
      final params = <String, dynamic>{'staffId': staffId};
      if (staffName != null) params['staffName'] = staffName;
      if (adjustmentOffsetMinutes != null) {
        params['adjustmentOffsetMinutes'] = adjustmentOffsetMinutes;
      }

      final result = await _functions.httpsCallable('clockIn').call(params);

      final responseData = result.data;
      if (responseData is! Map) {
        return ClockInResult(
          success: false,
          docId: '',
          message: mapCallableSoftFailMessage(responseData, operation: 'clockIn'),
          data: const {},
        );
      }

      final data = Map<String, dynamic>.from(responseData);

      if (isCallableSuccessResponse(data)) {
        return ClockInResult(
          docId: data['docId'] as String? ?? '',
          message: data['message'] as String? ?? '',
          data: data,
          warning: data['warning'] as String?,
        );
      }
      return ClockInResult(
        success: false,
        docId: '',
        message: mapCallableSoftFailMessage(data, operation: 'clockIn'),
        data: data,
      );
    } on FirebaseFunctionsException catch (e) {
      throw _handleFirebaseFunctionsException(e, operation: 'clockIn');
    } catch (e) {
      throw Exception(mapCallableError(e, operation: 'clockIn').message);
    }
  }

  /// 退勤打刻（Phase4 01: clockOut Callable）
  /// staffId または docId のいずれかを指定。docId がある場合は docId を優先。
  Future<ClockOutResult> clockOut(
    String staffId, {
    String? docId,
    int? adjustmentOffsetMinutes,
  }) async {
    try {
      final params = <String, dynamic>{
        if (docId != null && docId.isNotEmpty) 'docId': docId else 'staffId': staffId,
        if (adjustmentOffsetMinutes != null)
          'adjustmentOffsetMinutes': adjustmentOffsetMinutes,
      };
      final result =
          await _functions.httpsCallable('clockOut').call(params);

      final responseData = result.data;
      if (responseData is! Map) {
        return ClockOutResult(
          success: false,
          docId: '',
          message: mapCallableSoftFailMessage(responseData, operation: 'clockOut'),
          data: const {},
        );
      }

      final data = Map<String, dynamic>.from(responseData);

      if (isCallableSuccessResponse(data)) {
        return ClockOutResult(
          docId: data['docId'] as String? ?? '',
          message: data['message'] as String? ?? '',
          data: data,
          warning: data['warning'] as String?,
        );
      }
      return ClockOutResult(
        success: false,
        docId: '',
        message: mapCallableSoftFailMessage(data, operation: 'clockOut'),
        data: data,
      );
    } on FirebaseFunctionsException catch (e) {
      throw _handleFirebaseFunctionsException(e, operation: 'clockOut');
    } catch (e) {
      throw Exception(mapCallableError(e, operation: 'clockOut').message);
    }
  }

  /// 手動出勤記録を作成
  Future<ClockInResult> createManualClockInRecord(
    String staffId,
    String staffName, {
    int? adjustmentOffsetMinutes,
  }) async {
    try {
      final result = await _functions
          .httpsCallable('createManualClockInRecord')
          .call({
            'staffId': staffId,
            'staffName': staffName,
            if (adjustmentOffsetMinutes != null)
              'adjustmentOffsetMinutes': adjustmentOffsetMinutes,
          });

      final responseData = result.data;
      if (responseData is! Map) {
        return ClockInResult(
          success: false,
          docId: '',
          message: mapCallableSoftFailMessage(
            responseData,
            operation: 'createManualClockInRecord',
          ),
          data: const {},
        );
      }
      
      final data = Map<String, dynamic>.from(responseData);
      
      if (isCallableSuccessResponse(data)) {
        final resultData = data['data'];
        
        Map<String, dynamic> safeData;
        if (resultData is Map) {
          safeData = Map<String, dynamic>.from(resultData);
        } else {
          safeData = <String, dynamic>{};
        }
        
        return ClockInResult(
          docId: data['docId'] as String? ?? '',
          message: data['message'] as String? ?? '',
          data: safeData,
          warning: data['warning'] as String?,
        );
      }
      return ClockInResult(
        success: false,
        docId: '',
        message: mapCallableSoftFailMessage(
          data,
          operation: 'createManualClockInRecord',
        ),
        data: data,
      );
    } on FirebaseFunctionsException catch (e) {
      throw _handleFirebaseFunctionsException(
        e,
        operation: 'createManualClockInRecord',
      );
    } catch (e) {
      throw Exception(
        mapCallableError(e, operation: 'createManualClockInRecord').message,
      );
    }
  }

  /// 手動退勤記録を更新
  Future<ClockOutResult> updateManualClockOutRecord(
    String docId, {
    int? adjustmentOffsetMinutes,
  }) async {
    try {
      final result = await _functions
          .httpsCallable('updateManualClockOutRecord')
          .call({
            'docId': docId,
            if (adjustmentOffsetMinutes != null)
              'adjustmentOffsetMinutes': adjustmentOffsetMinutes,
          });

      final responseData = result.data;
      if (responseData is! Map) {
        return ClockOutResult(
          success: false,
          docId: '',
          message: mapCallableSoftFailMessage(
            responseData,
            operation: 'updateManualClockOutRecord',
          ),
          data: const {},
        );
      }
      
      final data = Map<String, dynamic>.from(responseData);
      
      if (isCallableSuccessResponse(data)) {
        final resultData = data['data'];
        
        Map<String, dynamic> safeData;
        if (resultData is Map) {
          safeData = Map<String, dynamic>.from(resultData);
        } else {
          safeData = <String, dynamic>{};
        }
        
        return ClockOutResult(
          docId: data['docId'] as String? ?? '',
          message: data['message'] as String? ?? '',
          data: safeData,
          warning: data['warning'] as String?,
        );
      }
      return ClockOutResult(
        success: false,
        docId: '',
        message: mapCallableSoftFailMessage(
          data,
          operation: 'updateManualClockOutRecord',
        ),
        data: data,
      );
    } on FirebaseFunctionsException catch (e) {
      throw _handleFirebaseFunctionsException(
        e,
        operation: 'updateManualClockOutRecord',
      );
    } catch (e) {
      throw Exception(
        mapCallableError(e, operation: 'updateManualClockOutRecord').message,
      );
    }
  }

  /// Phase4.1-F: 休憩開始（startBreak Callable）
  Future<Map<String, dynamic>> startBreak(
    String attendanceId, {
    int? adjustmentOffsetMinutes,
  }) async {
    try {
      final params = <String, dynamic>{'attendanceId': attendanceId};
      if (adjustmentOffsetMinutes != null) {
        params['adjustmentOffsetMinutes'] = adjustmentOffsetMinutes;
      }
      final result = await _functions
          .httpsCallable('startBreak')
          .call(params);
      final data = result.data;
      if (data is Map && isCallableSuccessResponse(data)) {
        return Map<String, dynamic>.from(data);
      }
      return {
        'success': false,
        'message': mapCallableSoftFailMessage(data, operation: 'startBreak'),
      };
    } on FirebaseFunctionsException catch (e) {
      throw _handleFirebaseFunctionsException(e, operation: 'startBreak');
    } catch (e) {
      throw Exception(mapCallableError(e, operation: 'startBreak').message);
    }
  }

  /// Phase4.1-F: 休憩終了（endBreak Callable）
  /// breakId が null の場合はサーバー側で endedAt==null の break を検索して終了する。
  Future<Map<String, dynamic>> endBreak(
    String attendanceId, {
    String? breakId,
    int? adjustmentOffsetMinutes,
  }) async {
    try {
      final params = <String, dynamic>{'attendanceId': attendanceId};
      if (breakId != null) params['breakId'] = breakId;
      if (adjustmentOffsetMinutes != null) {
        params['adjustmentOffsetMinutes'] = adjustmentOffsetMinutes;
      }
      final result = await _functions
          .httpsCallable('endBreak')
          .call(params);
      final data = result.data;
      if (data is Map && isCallableSuccessResponse(data)) {
        return Map<String, dynamic>.from(data);
      }
      return {
        'success': false,
        'message': mapCallableSoftFailMessage(data, operation: 'endBreak'),
      };
    } on FirebaseFunctionsException catch (e) {
      throw _handleFirebaseFunctionsException(e, operation: 'endBreak');
    } catch (e) {
      throw Exception(mapCallableError(e, operation: 'endBreak').message);
    }
  }

  /// Phase4.1-F: 休憩中の attendance を終了する（breakId はサーバー側で検索）
  Future<Map<String, dynamic>> endBreakForAttendance(
    String attendanceId, {
    int? adjustmentOffsetMinutes,
  }) async {
    return endBreak(
      attendanceId,
      adjustmentOffsetMinutes: adjustmentOffsetMinutes,
    );
  }

  /// Phase4.1-E: 管理者用勤怠作成
  Future<Map<String, dynamic>> createAttendance({
    required String staffId,
    required String staffName,
    required String date,
    required DateTime clockIn,
    DateTime? clockOut,
  }) async {
    try {
      final result = await _functions.httpsCallable('createAttendance').call({
        'staffId': staffId,
        'staffName': staffName,
        'date': date,
        'clockIn': attendanceWallClockToUtcIso(clockIn),
        if (clockOut != null) 'clockOut': attendanceWallClockToUtcIso(clockOut),
      });
      final data = result.data;
      if (data is Map && isCallableSuccessResponse(data)) {
        return Map<String, dynamic>.from(data);
      }
      return {
        'success': false,
        'message': mapCallableSoftFailMessage(data, operation: 'createAttendance'),
      };
    } on FirebaseFunctionsException catch (e) {
      throw _handleFirebaseFunctionsException(e, operation: 'createAttendance');
    } catch (e) {
      throw Exception(mapCallableError(e, operation: 'createAttendance').message);
    }
  }

  /// Phase4.1-E: 管理者用勤怠更新
  /// updateBreaks: 休憩の startedAt/endedAt を編集する場合 [{ breakId, startedAt, endedAt }, ...]
  /// deleteBreakIds: 論理削除する休憩IDのリスト
  /// restoreBreakIds: 論理削除を復元する休憩IDのリスト（isDeleted: false に戻す）
  Future<Map<String, dynamic>> updateAttendance({
    required String attendanceId,
    DateTime? clockIn,
    DateTime? clockOut,
    List<Map<String, dynamic>>? updateBreaks,
    List<String>? deleteBreakIds,
    List<String>? restoreBreakIds,
    bool markDeleted = false,
  }) async {
    try {
      final params = <String, dynamic>{'attendanceId': attendanceId};
      if (markDeleted) {
        params['markDeleted'] = true;
      } else {
        // clockIn/clockOut は勤怠概要の更新時のみ送信（休憩削除のみの場合は既存値を保持）
        final hasOverviewUpdate =
            clockIn != null || (updateBreaks != null && updateBreaks.isNotEmpty);
        if (hasOverviewUpdate) {
          if (clockIn != null) {
            params['clockIn'] = attendanceWallClockToUtcIso(clockIn);
          }
          params['clockOut'] = clockOut != null
              ? attendanceWallClockToUtcIso(clockOut)
              : null;
        }
        if (updateBreaks != null && updateBreaks.isNotEmpty) {
          params['updateBreaks'] = updateBreaks.map((b) => {
            'breakId': b['breakId'],
            'startedAt':
                attendanceWallClockToUtcIso(b['startedAt'] as DateTime),
            'endedAt': attendanceWallClockToUtcIso(b['endedAt'] as DateTime),
          }).toList();
        }
        if (deleteBreakIds != null && deleteBreakIds.isNotEmpty) {
          params['deleteBreakIds'] = deleteBreakIds;
        }
        if (restoreBreakIds != null && restoreBreakIds.isNotEmpty) {
          params['restoreBreakIds'] = restoreBreakIds;
        }
      }
      final result = await _functions.httpsCallable('updateAttendance').call(params);
      final data = result.data;
      if (data is Map && isCallableSuccessResponse(data)) {
        return Map<String, dynamic>.from(data);
      }
      return {
        'success': false,
        'message': mapCallableSoftFailMessage(data, operation: 'updateAttendance'),
      };
    } on FirebaseFunctionsException catch (e) {
      throw _handleFirebaseFunctionsException(e, operation: 'updateAttendance');
    } catch (e) {
      throw Exception(mapCallableError(e, operation: 'updateAttendance').message);
    }
  }

  /// QRコードからスタッフIDを抽出
  ///
  /// 失敗時は [AttendanceQrParseException]（利用者向け固定文言のみ）。
  /// QR 本文・内部例外は含めない（ATT-01）。
  String extractStaffIdFromQR(String qrData) {
    return extractStaffIdFromAttendanceQr(qrData);
  }

  /// Firebase Functions の hard-fail を利用者向け文言のみの [Exception] に変換する。
  Exception _handleFirebaseFunctionsException(
    FirebaseFunctionsException e, {
    String? operation,
  }) {
    return Exception(mapCallableError(e, operation: operation).message);
  }

  // 全スタッフの勤怠記録を取得（ATT-09: raw 例外をラップしない）
  static Future<Map<String, dynamic>> getAllStaffAttendance({
    required int month,
    required int year,
    required int startDay,
    required int endDay,
  }) async {
    try {
      final callable =
          FunctionsClient.instance.httpsCallable('getAllStaffAttendance');
      final result = await callable.call({
        'month': month,
        'year': year,
        'startDay': startDay,
        'endDay': endDay,
      });

      final data = result.data;
      if (data is Map) {
        return Map<String, dynamic>.from(data);
      }
      return <String, dynamic>{'success': false};
    } on FirebaseFunctionsException {
      rethrow;
    } catch (_) {
      // ATT-09: raw を wrap しない。呼び出し側で D-1 / 固定文言へ。
      rethrow;
    }
  }

  // 期間内の給与データを取得
  static Future<List<Map<String, dynamic>>> getPayrollData({
    required int month,
    required int year,
    required int startDay,
    required int endDay,
  }) async {
    const operation = 'getPayrollData';
    final callable = FunctionsClient.instance.httpsCallable('getPayrollData');

    final result = await callable.call({
      'month': month,
      'year': year,
      'startDay': startDay,
      'endDay': endDay,
    });

    final responseData = result.data;

    if (responseData is! Map) {
      throw AttendanceUserFacingException(
        mapAttendanceCallableSoftFail(null, operation: operation),
      );
    }

    final data = Map<String, dynamic>.from(responseData);

    if (!isCallableSuccessResponse(data)) {
      throw AttendanceUserFacingException(
        mapAttendanceCallableSoftFail(data, operation: operation),
      );
    }

    final payrollData = data['payrollData'];

    if (payrollData is List) {
      final List<dynamic> raw = List<dynamic>.from(payrollData);
      return raw
          .whereType<Map>()
          .map<Map<String, dynamic>>(
            (m) => m.map((k, v) => MapEntry(k.toString(), v)),
          )
          .toList(growable: false);
    }
    return [];
  }

  // 勤務時間を計算（時間:分形式）
  static String calculateWorkHours(DateTime? clockIn, DateTime? clockOut) {
    if (clockIn == null || clockOut == null) return '0時間0分';
    
    final difference = clockOut.difference(clockIn);
    final hours = difference.inHours;
    final minutes = difference.inMinutes % 60;
    
    if (hours > 0 && minutes > 0) {
      return '${hours}時間${minutes}分';
    } else if (hours > 0) {
      return '${hours}時間';
    } else {
      return '${minutes}分';
    }
  }

  // 深夜時間を計算（時間:分形式）
  static String calculateNightTimeHours(double nightTimeHours) {
    if (nightTimeHours <= 0) return '0時間0分';
    
    final hours = nightTimeHours.floor();
    final minutes = ((nightTimeHours - hours) * 60).round();
    
    if (hours > 0 && minutes > 0) {
      return '${hours}時間${minutes}分';
    } else if (hours > 0) {
      return '${hours}時間';
    } else {
      return '${minutes}分';
    }
  }

  // 日付を日本語形式でフォーマット
  static String formatDate(DateTime date) {
    final weekdays = ['月', '火', '水', '木', '金', '土', '日'];
    return '${date.month}月${date.day}日 (${weekdays[date.weekday - 1]})';
  }

  // 時刻を日本語形式でフォーマット
  static String formatTime(DateTime time) {
    return '${time.hour.toString().padLeft(2, '0')}:${time.minute.toString().padLeft(2, '0')}';
  }
}

/// 出勤記録作成結果
class ClockInResult {
  final bool success;
  final String docId;
  final String message;
  final Map<String, dynamic> data;
  final String? warning;

  ClockInResult({
    this.success = true,
    required this.docId,
    required this.message,
    required this.data,
    this.warning,
  });
}

/// 退勤記録更新結果
class ClockOutResult {
  final bool success;
  final String docId;
  final String message;
  final Map<String, dynamic> data;
  final String? warning;

  ClockOutResult({
    this.success = true,
    required this.docId,
    required this.message,
    required this.data,
    this.warning,
  });
}
