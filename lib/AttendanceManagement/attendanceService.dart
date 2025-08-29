import 'package:cloud_functions/cloud_functions.dart';
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
  final FirebaseFunctions _functions = FirebaseFunctions.instance;

  /// 出勤・退勤モードを自動判定
  Future<AttendanceJudgmentResult> determineAttendanceMode(String qrData) async {
    try {
      // QRコードデータの検証
      final staffId = extractStaffIdFromQR(qrData);
      
      // Cloud Functionsで出勤・退勤を判定
      final result = await _functions
          .httpsCallable('determineAttendanceMode')
          .call({'staffId': staffId});

      // より安全な型変換
      final responseData = result.data;
      if (responseData is! Map) {
        throw Exception('予期しないレスポンス形式です: ${responseData.runtimeType}');
      }
      
      final data = Map<String, dynamic>.from(responseData);
      
      if (data['success'] == true) {
        // dataフィールドの安全な型変換
        final resultData = data['data'];
        
        Map<String, dynamic> safeData;
        if (resultData is Map) {
          safeData = Map<String, dynamic>.from(resultData);
        } else {
          safeData = <String, dynamic>{};
        }
        
        return AttendanceJudgmentResult(
          isClockIn: data['isClockIn'],
          staffName: data['staffName'],
          existingDocId: data['existingDocId'],
          date: data['date'],
          message: data['message'],
        );
      } else {
        throw Exception('判定処理に失敗しました');
      }
    } on FirebaseFunctionsException catch (e) {
      throw _handleFirebaseFunctionsException(e);
    } catch (e) {
      throw Exception('予期しないエラーが発生しました: $e');
    }
  }

  /// 出勤記録を作成
  Future<ClockInResult> createClockInRecord(String staffId, String staffName) async {
    try {
      final result = await _functions
          .httpsCallable('createClockInRecord')
          .call({
            'staffId': staffId,
            'staffName': staffName,
          });

      // より安全な型変換
      final responseData = result.data;
      if (responseData is! Map) {
        throw Exception('予期しないレスポンス形式です: ${responseData.runtimeType}');
      }
      
      final data = Map<String, dynamic>.from(responseData);
      
      if (data['success'] == true) {
        // dataフィールドの安全な型変換
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
        );
      } else {
        throw Exception('出勤記録の作成に失敗しました');
      }
    } on FirebaseFunctionsException catch (e) {
      throw _handleFirebaseFunctionsException(e);
    } catch (e) {
      throw Exception('予期しないエラーが発生しました: $e');
    }
  }

  /// 退勤記録を更新
  Future<ClockOutResult> updateClockOutRecord(String docId) async {
    try {
      final result = await _functions
          .httpsCallable('updateClockOutRecord')
          .call({'docId': docId});

      // より安全な型変換
      final responseData = result.data;
      if (responseData is! Map) {
        throw Exception('予期しないレスポンス形式です: ${responseData.runtimeType}');
      }
      
      final data = Map<String, dynamic>.from(responseData);
      
      if (data['success'] == true) {
        // dataフィールドの安全な型変換
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
        );
      } else {
        throw Exception('退勤記録の更新に失敗しました');
      }
    } on FirebaseFunctionsException catch (e) {
      throw _handleFirebaseFunctionsException(e);
    } catch (e) {
      throw Exception('予期しないエラーが発生しました: $e');
    }
  }

  /// 手動出勤記録を作成
  Future<ClockInResult> createManualClockInRecord(String staffId, String staffName) async {
    try {
      final result = await _functions
          .httpsCallable('createManualClockInRecord')
          .call({
            'staffId': staffId,
            'staffName': staffName,
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
          message: data['docId'],
          data: safeData,
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
  Future<ClockOutResult> updateManualClockOutRecord(String docId) async {
    try {
      final result = await _functions
          .httpsCallable('updateManualClockOutRecord')
          .call({'docId': docId});

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

  /// スタッフ一覧を取得（出勤・退勤モード別）
  Future<List<StaffData>> getStaffList(bool isClockInMode) async {
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
        
        return staffList.map((staff) {
          // 型を明示的にキャスト
          final staffMap = Map<String, dynamic>.from(staff as Map);
          return StaffData.fromMap(staffMap);
        }).toList();
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
      final callable = FirebaseFunctions.instance.httpsCallable('getAllStaffAttendance');
      final result = await callable.call({
        'month': month,
        'year': year,
        'startDay': startDay,
        'endDay': endDay,
      });

      return result.data;
    } catch (e) {
      print('勤怠記録取得エラー: $e');
      throw Exception('勤怠記録の取得に失敗しました: $e');
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

/// 出勤・退勤判定結果
class AttendanceJudgmentResult {
  final bool isClockIn;
  final String staffName;
  final String? existingDocId;
  final String date;
  final String message;

  AttendanceJudgmentResult({
    required this.isClockIn,
    required this.staffName,
    this.existingDocId,
    required this.date,
    required this.message,
  });
}

/// 出勤記録作成結果
class ClockInResult {
  final String docId;
  final String message;
  final Map<String, dynamic> data;

  ClockInResult({
    required this.docId,
    required this.message,
    required this.data,
  });
}

/// 退勤記録更新結果
class ClockOutResult {
  final String docId;
  final String message;
  final Map<String, dynamic> data;

  ClockOutResult({
    required this.docId,
    required this.message,
    required this.data,
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
