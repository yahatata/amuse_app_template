import 'package:cloud_functions/cloud_functions.dart';
import 'package:amuse_app_template/core/utils/functions_client.dart';
import 'dart:convert';

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
        throw Exception('予期しないレスポンス形式です: ${responseData.runtimeType}');
      }

      final data = Map<String, dynamic>.from(responseData);

      if (data['success'] == true) {
        return ClockInResult(
          docId: data['docId'] as String? ?? '',
          message: data['message'] as String? ?? '',
          data: data,
          warning: data['warning'] as String?,
        );
      } else {
        throw Exception(data['message'] as String? ?? '出勤登録に失敗しました');
      }
    } on FirebaseFunctionsException catch (e) {
      throw _handleFirebaseFunctionsException(e);
    } catch (e) {
      throw Exception('予期しないエラーが発生しました: $e');
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
        throw Exception('予期しないレスポンス形式です: ${responseData.runtimeType}');
      }

      final data = Map<String, dynamic>.from(responseData);

      if (data['success'] == true) {
        return ClockOutResult(
          docId: data['docId'] as String? ?? '',
          message: data['message'] as String? ?? '',
          data: data,
          warning: data['warning'] as String?,
        );
      } else {
        throw Exception(data['message'] as String? ?? '退勤登録に失敗しました');
      }
    } on FirebaseFunctionsException catch (e) {
      throw _handleFirebaseFunctionsException(e);
    } catch (e) {
      throw Exception('予期しないエラーが発生しました: $e');
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
        throw Exception('予期しないレスポンス形式です: ${responseData.runtimeType}');
      }
      
      final data = Map<String, dynamic>.from(responseData);
      
      if (data['success'] == true) {
        final resultData = data['data'];
        
        Map<String, dynamic> safeData;
        if (resultData is Map) {
          safeData = Map<String, dynamic>.from(resultData);
        } else {
          safeData = <String, dynamic>{};
        }
        
        return ClockInResult(
          docId: data['docId'],
          message: data['message'],
          data: safeData,
          warning: data['warning'] as String?,
        );
      } else {
        throw Exception('手動出勤記録の作成に失敗しました');
      }
    } on FirebaseFunctionsException catch (e) {
      throw _handleFirebaseFunctionsException(e);
    } catch (e) {
      throw Exception('予期しないエラーが発生しました: $e');
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
        throw Exception('予期しないレスポンス形式です: ${responseData.runtimeType}');
      }
      
      final data = Map<String, dynamic>.from(responseData);
      
      if (data['success'] == true) {
        final resultData = data['data'];
        
        Map<String, dynamic> safeData;
        if (resultData is Map) {
          safeData = Map<String, dynamic>.from(resultData);
        } else {
          safeData = <String, dynamic>{};
        }
        
        return ClockOutResult(
          docId: data['docId'],
          message: data['message'],
          data: safeData,
          warning: data['warning'] as String?,
        );
      } else {
        throw Exception('手動退勤記録の更新に失敗しました');
      }
    } on FirebaseFunctionsException catch (e) {
      throw _handleFirebaseFunctionsException(e);
    } catch (e) {
      throw Exception('予期しないエラーが発生しました: $e');
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
      if (data is Map && data['success'] == true) {
        return Map<String, dynamic>.from(data);
      }
      throw Exception(data['message'] as String? ?? '休憩開始に失敗しました');
    } on FirebaseFunctionsException catch (e) {
      throw _handleFirebaseFunctionsException(e);
    } catch (e) {
      throw Exception('休憩開始に失敗しました: $e');
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
      if (data is Map && data['success'] == true) {
        return Map<String, dynamic>.from(data);
      }
      throw Exception(data['message'] as String? ?? '休憩終了に失敗しました');
    } on FirebaseFunctionsException catch (e) {
      throw _handleFirebaseFunctionsException(e);
    } catch (e) {
      throw Exception('休憩終了に失敗しました: $e');
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
        'clockIn': clockIn.toIso8601String(),
        if (clockOut != null) 'clockOut': clockOut.toIso8601String(),
      });
      final data = result.data;
      if (data is Map && data['success'] == true) {
        return Map<String, dynamic>.from(data);
      }
      throw Exception('勤怠の作成に失敗しました');
    } on FirebaseFunctionsException catch (e) {
      throw _handleFirebaseFunctionsException(e);
    } catch (e) {
      throw Exception('勤怠の作成に失敗しました: $e');
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
        final hasOverviewUpdate = clockIn != null || (updateBreaks != null && updateBreaks!.isNotEmpty);
        if (hasOverviewUpdate) {
          if (clockIn != null) params['clockIn'] = clockIn.toIso8601String();
          params['clockOut'] = clockOut != null ? clockOut.toIso8601String() : null;
        }
        if (updateBreaks != null && updateBreaks.isNotEmpty) {
          params['updateBreaks'] = updateBreaks.map((b) => {
            'breakId': b['breakId'],
            'startedAt': (b['startedAt'] as DateTime).toIso8601String(),
            'endedAt': (b['endedAt'] as DateTime).toIso8601String(),
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
      if (data is Map && data['success'] == true) {
        return Map<String, dynamic>.from(data);
      }
      throw Exception('勤怠の更新に失敗しました');
    } on FirebaseFunctionsException catch (e) {
      throw _handleFirebaseFunctionsException(e);
    } catch (e) {
      throw Exception('勤怠の更新に失敗しました: $e');
    }
  }

  /// スタッフ一覧を取得（出勤・退勤モード別）
  /// CHANGESPEC 6-4: 退勤モード時は separateSectionStaff（別枠）も返す
  Future<GetStaffListResult> getStaffList(bool isClockInMode) async {
    try {
      final result = await _functions
          .httpsCallable('getStaffListForAttendance')
          .call({'isClockInMode': isClockInMode});

      final responseData = result.data;

      if (responseData is! Map) {
        throw Exception('予期しないレスポンス形式です: ${responseData.runtimeType}');
      }

      final data = Map<String, dynamic>.from(responseData);

      if (data['success'] == true) {
        final staffList = data['staffList'] as List;
        final mainList = staffList
            .map((staff) {
              final staffMap = Map<String, dynamic>.from(staff as Map);
              return StaffData.fromMap(staffMap);
            })
            .toList();

        List<StaffData> separateSection = [];
        final raw = data['separateSectionStaff'];
        if (raw is List && raw.isNotEmpty) {
          separateSection = raw
              .map((staff) {
                final staffMap = Map<String, dynamic>.from(staff as Map);
                return StaffData.fromMap(staffMap);
              })
              .toList();
        }

        return GetStaffListResult(
          staffList: mainList,
          separateSectionStaff: separateSection,
          date: data['date'] as String? ?? '',
          attendanceDate: data['attendanceDate'] as String? ?? data['date'] as String? ?? '',
          shiftDate: data['shiftDate'] as String? ?? data['date'] as String? ?? '',
        );
      } else {
        throw Exception('スタッフ一覧の取得に失敗しました');
      }
    } on FirebaseFunctionsException catch (e) {
      throw _handleFirebaseFunctionsException(e);
    } catch (e) {
      throw Exception('予期しないエラーが発生しました: $e');
    }
  }

  /// QRコードからスタッフIDを抽出
  String extractStaffIdFromQR(String qrData) {
    try {
      final Map<String, dynamic> qrDataMap = json.decode(qrData);
      
      // 必須フィールドのチェック
      if (!qrDataMap.containsKey('uid') || 
          !qrDataMap.containsKey('type') || 
          !qrDataMap.containsKey('timestamp')) {
        throw Exception('QRコードに必要な情報が含まれていません');
      }
      
      // スタッフタイプの確認
      if (qrDataMap['type'] != 'staff') {
        throw Exception('このQRコードはスタッフ用ではありません');
      }
      
      // 有効期限のチェック（10分）
      final timestamp = qrDataMap['timestamp'] as int;
      final now = DateTime.now().millisecondsSinceEpoch;
      final expiryTime = timestamp + (10 * 60 * 1000); // 10分
      
      if (now > expiryTime) {
        throw Exception('QRコードの有効期限が切れています');
      }
      
      return qrDataMap['uid'] as String;
    } catch (e) {
      if (e is FormatException) {
        throw Exception('QRコードデータの形式が正しくありません');
      }
      throw Exception('QRコードデータの解析に失敗しました: $e');
    }
  }

  /// Firebase Functionsのエラーハンドリング
  Exception _handleFirebaseFunctionsException(FirebaseFunctionsException e) {
    switch (e.code) {
      case 'invalid-argument':
        return Exception('無効なパラメータです: ${e.message}');
      case 'not-found':
        return Exception('スタッフが見つかりません: ${e.message}');
      case 'already-exists':
        return Exception('既に記録が存在します: ${e.message}');
      case 'failed-precondition':
        return Exception('処理の前提条件が満たされていません: ${e.message}');
      case 'unauthenticated':
        return Exception('認証が必要です: ${e.message}');
      case 'permission-denied':
        return Exception('権限がありません: ${e.message}');
      case 'resource-exhausted':
        return Exception('リソースが不足しています: ${e.message}');
      case 'internal':
        return Exception('サーバー内部エラーが発生しました: ${e.message}');
      case 'unavailable':
        return Exception('サービスが利用できません: ${e.message}');
      case 'deadline-exceeded':
        return Exception('処理がタイムアウトしました: ${e.message}');
      default:
        return Exception('エラーが発生しました: ${e.message}');
    }
  }

  // 全スタッフの勤怠記録を取得
  static Future<Map<String, dynamic>> getAllStaffAttendance({
    required int month,
    required int year,
    required int startDay,
    required int endDay,
  }) async {
    try {
      final callable = FunctionsClient.instance.httpsCallable('getAllStaffAttendance');
      final result = await callable.call({
        'month': month,
        'year': year,
        'startDay': startDay,
        'endDay': endDay,
      });

      return result.data;
    } catch (e) {
      throw Exception('勤怠記録の取得に失敗しました: $e');
    }
  }

  // 期間内の給与データを取得
  static Future<List<Map<String, dynamic>>> getPayrollData({
    required int month,
    required int year,
    required int startDay,
    required int endDay,
  }) async {
    try {
      final callable = FunctionsClient.instance.httpsCallable('getPayrollData');
      
      final result = await callable.call({
        'month': month,
        'year': year,
        'startDay': startDay,
        'endDay': endDay,
      });
      
      final responseData = result.data;
      
      if (responseData is! Map) {
        throw Exception('予期しないレスポンス形式です: ${responseData.runtimeType}');
      }
      
      final data = Map<String, dynamic>.from(responseData);
      
      if (data['success'] == true) {
        final payrollData = data['payrollData'];
        
        if (payrollData is List) {
          // CastListを避けて実体化 + キーをStringに統一
          final List<dynamic> raw = List<dynamic>.from(payrollData);
          return raw
              .whereType<Map>() // Map<Object?, Object?>でも通る
              .map<Map<String, dynamic>>((m) => m.map((k, v) => MapEntry(k.toString(), v)))
              .toList(growable: false);
        } else {
          return [];
        }
      } else {
        throw Exception('給与データの取得に失敗しました: ${data['error'] ?? '不明なエラー'}');
      }
    } catch (e) {
      throw Exception('給与データの取得中にエラーが発生しました: $e');
    }
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
  final String docId;
  final String message;
  final Map<String, dynamic> data;
  final String? warning;

  ClockInResult({
    required this.docId,
    required this.message,
    required this.data,
    this.warning,
  });
}

/// 退勤記録更新結果
class ClockOutResult {
  final String docId;
  final String message;
  final Map<String, dynamic> data;
  final String? warning;

  ClockOutResult({
    required this.docId,
    required this.message,
    required this.data,
    this.warning,
  });
}

/// getStaffList の戻り値（CHANGESPEC 6-4 別枠対応）
class GetStaffListResult {
  final List<StaffData> staffList;
  final List<StaffData> separateSectionStaff;
  final String date;
  final String attendanceDate;
  final String shiftDate;

  GetStaffListResult({
    required this.staffList,
    required this.separateSectionStaff,
    required this.date,
    required this.attendanceDate,
    required this.shiftDate,
  });
}

/// スタッフデータ
class StaffData {
  final String uid;
  final String fullName;
  final String fullNameKana;
  final String? position;
  final String? shiftStart;
  final String? clockIn;
  final bool hasShiftToday;
  final String? attendanceDocId; // 退勤時に使用する出勤記録のドキュメントID

  StaffData({
    required this.uid,
    required this.fullName,
    required this.fullNameKana,
    this.position,
    this.shiftStart,
    this.clockIn,
    required this.hasShiftToday,
    this.attendanceDocId,
  });

  factory StaffData.fromMap(Map<String, dynamic> map) {
    return StaffData(
      uid: map['uid'] ?? '',
      fullName: map['fullName'] ?? '',
      fullNameKana: map['fullNameKana'] ?? '',
      position: map['position'],
      shiftStart: map['shiftStart'],
      clockIn: map['clockIn'],
      hasShiftToday: map['hasShiftToday'] ?? false,
      attendanceDocId: map['attendanceDocId'],
    );
  }
}
