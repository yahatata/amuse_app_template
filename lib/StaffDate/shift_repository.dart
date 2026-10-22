import 'package:amuse_app_template/core/errors/errors.dart';
import 'package:amuse_app_template/core/utils/functions_client.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter/foundation.dart';
import 'package:intl/intl.dart';
import 'errors/staff_shift_errors.dart';
import 'shiftHomePage.dart';
import 'shiftDraftPage.dart';
import '../services/device_service.dart';
import '../models/device.dart';

/// シフト管理のRepository層（Firestore read + Callable write）
class ShiftRepository {
  final FirebaseFirestore _firestore = FirebaseFirestore.instance;
  final FirebaseFunctions _functions = FunctionsClient.instance;
  final DeviceService _deviceService = DeviceService();

  /// installationIdを取得（admin操作用）
  Future<String?> _getInstallationId() async {
    final device = await _deviceService.getCurrentDevice();
    return device?.installationId;
  }

  /// 年月（YYYY-MM）を取得
  String _getYearMonth(DateTime date) {
    return DateFormat('yyyy-MM').format(date);
  }

  /// 日付キー（YYYY-MM-DD）を取得
  String _getDateKey(DateTime date) {
    return DateFormat('yyyy-MM-dd').format(date);
  }

  /// FirestoreのbusinessHoursをBusinessHoursに変換
  BusinessHours _parseBusinessHours(Map<String, dynamic> data) {
    // 既存データの後方互換性: sourceがnullの場合は"auto"扱い（"manual"ではない）
    final sourceStr = data['source'] as String?;
    final source = sourceStr ?? "auto"; // デフォルトは"auto"
    
    return BusinessHours(
      openMinute: data['openMinute'] as int,
      closeMinute: data['closeMinute'] as int,
      isClosed: data['isClosed'] as bool,
      styleId: data['styleId'] as String?,
      source: source,
    );
  }

  /// FirestoreのassignmentをShiftAssignmentに変換
  ShiftAssignment _parseAssignment(Map<String, dynamic> data) {
    return ShiftAssignment(
      staffId: data['staffId'] as String,
      staffName: data['staffName'] as String,
      startMinute: data['startMinute'] as int,
      endMinute: data['endMinute'] as int,
      sourceRequestId: data['sourceRequestId'] as String?,
    );
  }

  /// FirestoreのdayDocをShiftDayDataに変換
  ShiftDayData _parseShiftDayData(String dateKey, Map<String, dynamic> data) {
    final date = DateTime.parse(dateKey);
    final businessHoursData = data['businessHours'] as Map<String, dynamic>;
    final assignmentsData = (data['assignments'] as List<dynamic>?) ?? [];

    return ShiftDayData(
      date: date,
      businessHours: _parseBusinessHours(businessHoursData),
      isSufficient: data['isSufficient'] as bool? ?? false,
      isFinalized: data['isFinalized'] as bool? ?? false,
      assignments: assignmentsData
          .map((a) => _parseAssignment(a as Map<String, dynamic>))
          .toList(),
      pendingRequestCount: data['pendingRequestCount'] as int? ?? 0,
    );
  }

  /// FirestoreのrequestDocをShiftRequestに変換
  ShiftRequest _parseShiftRequest(String requestId, Map<String, dynamic> data) {
    return ShiftRequest(
      requestId: requestId,
      staffId: data['staffId'] as String,
      staffName: data['staffName'] as String,
      date: data['dateKey'] as String,
      yearMonth: data['yearMonth'] as String,
      startMinute: data['startMinute'] as int,
      endMinute: data['endMinute'] as int,
      status: data['status'] as String,
      originalStartMinute: data['originalStartMinute'] as int?,
      originalEndMinute: data['originalEndMinute'] as int?,
    );
  }

  /// 月のシフト日データを取得（当月・次月）
  Future<Map<String, ShiftDayData>> getShiftDaysForMonths(
    DateTime currentMonth,
    DateTime nextMonth,
  ) async {
    final currentYearMonth = _getYearMonth(currentMonth);
    final nextYearMonth = _getYearMonth(nextMonth);

    final result = <String, ShiftDayData>{};

    // 当月と次月のデータを並列取得
    final futures = [
      _firestore
          .collection('shifts')
          .doc(currentYearMonth)
          .collection('days')
          .get(),
      _firestore
          .collection('shifts')
          .doc(nextYearMonth)
          .collection('days')
          .get(),
    ];

    final snapshots = await Future.wait(futures);

    for (final snapshot in snapshots) {
      for (final doc in snapshot.docs) {
        final dateKey = doc.data()['dateKey'] as String;
        result[dateKey] = _parseShiftDayData(dateKey, doc.data());
      }
    }

    return result;
  }

  /// 次月のpending申請を取得（dateKeyでグルーピング）
  Future<Map<String, List<ShiftRequest>>> getPendingRequestsForMonth(
    String yearMonth,
  ) async {
    final snapshot = await _firestore
        .collection('shiftRequests')
        .where('yearMonth', isEqualTo: yearMonth)
        .where('status', isEqualTo: 'pending')
        .get();

    final result = <String, List<ShiftRequest>>{};

    for (final doc in snapshot.docs) {
      final request = _parseShiftRequest(doc.id, doc.data());
      final dateKey = request.date;

      if (!result.containsKey(dateKey)) {
        result[dateKey] = [];
      }
      result[dateKey]!.add(request);
    }

    return result;
  }

  /// 営業時間を取得（businessHoursMonthlyMapから）
  Future<Map<String, BusinessHours>> getBusinessHoursForMonth(
    String yearMonth,
  ) async {
    final doc = await _firestore
        .collection('businessHoursMonthlyMap')
        .doc(yearMonth)
        .get();

    if (!doc.exists) {
      return {};
    }

    final data = doc.data()!;
    final days = data['days'] as Map<String, dynamic>? ?? {};
    final result = <String, BusinessHours>{};

    for (final entry in days.entries) {
      final dayStr = entry.key;
      final dayData = entry.value as Map<String, dynamic>;
      final dateKey = '$yearMonth-${dayStr.padLeft(2, '0')}';
      result[dateKey] = _parseBusinessHours(dayData);
    }

    return result;
  }

  /// 営業時間を購読（businessHoursMonthlyMap の snapshot、保存後のUI更新はこれで反映）
  Stream<Map<String, BusinessHours>> streamBusinessHoursForMonth(String yearMonth) {
    return _firestore
        .collection('businessHoursMonthlyMap')
        .doc(yearMonth)
        .snapshots()
        .map((doc) {
          if (!doc.exists) return <String, BusinessHours>{};
          final data = doc.data()!;
          final days = data['days'] as Map<String, dynamic>? ?? {};
          final result = <String, BusinessHours>{};
          for (final entry in days.entries) {
            final dayStr = entry.key;
            final dayData = entry.value as Map<String, dynamic>;
            final dateKey = '$yearMonth-${dayStr.padLeft(2, '0')}';
            result[dateKey] = _parseBusinessHours(dayData);
          }
          return result;
        });
  }

  /// 営業時間を初期化
  Future<void> initBusinessHoursForMonth({
    required String yearMonth,
    required List<Map<String, dynamic>> days,
  }) async {
    final installationId = await _getInstallationId();
    if (installationId == null) {
      throw Exception('Device not registered. InstallationId not found.');
    }

    final callable = _functions.httpsCallable('initBusinessHoursForMonth');
    await callable.call({
      'yearMonth': yearMonth,
      'installationId': installationId,
      'days': days,
    });
  }

  /// シフト日を初期化
  Future<void> initShiftDaysForMonth(String yearMonth) async {
    final installationId = await _getInstallationId();
    if (installationId == null) {
      throw Exception('Device not registered. InstallationId not found.');
    }

    final callable = _functions.httpsCallable('initShiftDaysForMonth');
    await callable.call({
      'yearMonth': yearMonth,
      'installationId': installationId,
    });
  }

  /// 申請を中間確定
  Future<void> interimConfirmRequests({
    required String dateKey,
    required List<Map<String, dynamic>> selections,
  }) async {
    final installationId = await _getInstallationId();
    if (installationId == null) {
      throw Exception('Device not registered. InstallationId not found.');
    }

    final callable = _functions.httpsCallable('interimConfirmRequests');
    await callable.call({
      'dateKey': dateKey,
      'selections': selections,
      'installationId': installationId,
    });
  }

  /// 1日のシフトを最終確定
  Future<void> finalizeDay(String dateKey) async {
    final installationId = await _getInstallationId();
    if (installationId == null) {
      throw Exception('Device not registered. InstallationId not found.');
    }

    final callable = _functions.httpsCallable('finalizeDay');
    await callable.call({
      'dateKey': dateKey,
      'installationId': installationId,
    });
  }

  /// 月のシフトを最終確定
  Future<void> finalizeMonth(String yearMonth) async {
    final installationId = await _getInstallationId();
    if (installationId == null) {
      throw Exception('Device not registered. InstallationId not found.');
    }

    final callable = _functions.httpsCallable('finalizeMonth');
    await callable.call({
      'yearMonth': yearMonth,
      'installationId': installationId,
    });
  }

  /// 必要十分フラグを手動設定
  Future<void> setSufficientOverride({
    required String dateKey,
    required String? override, // "on" | "off" | null
  }) async {
    final installationId = await _getInstallationId();
    if (installationId == null) {
      throw Exception('Device not registered. InstallationId not found.');
    }

    final callable = _functions.httpsCallable('setSufficientOverride');
    await callable.call({
      'dateKey': dateKey,
      'override': override,
      'installationId': installationId,
    });
  }

  /// 不足日を集計
  Future<List<String>> calculateInsufficientDays(String yearMonth) async {
    final installationId = await _getInstallationId();
    if (installationId == null) {
      throw Exception('Device not registered. InstallationId not found.');
    }

    final callable = _functions.httpsCallable('calculateInsufficientDays');
    final result = await callable.call({
      'yearMonth': yearMonth,
      'installationId': installationId,
    });

    const operation = 'calculateInsufficientDays';
    final data = result.data;
    if (!isCallableSuccessResponse(data)) {
      throw StaffShiftUserFacingException(
        mapStaffShiftSoftFailMessage(data, operation: operation),
      );
    }
    final dateKeys = (data as Map)['dateKeys'];
    if (dateKeys is! List) {
      throw StaffShiftUserFacingException(
        mapStaffShiftSoftFailMessage(data, operation: operation),
      );
    }
    return List<String>.from(dateKeys.map((e) => e.toString()));
  }

  /// 募集内容を管理者に送信
  Future<void> sendRecruitmentNotification(String yearMonth) async {
    final installationId = await _getInstallationId();
    if (installationId == null) {
      throw Exception('Device not registered. InstallationId not found.');
    }

    final callable = _functions.httpsCallable('sendRecruitmentNotification');
    await callable.call({
      'yearMonth': yearMonth,
      'installationId': installationId,
    });
  }

  /// 募集時間帯を作成
  Future<void> createRecruitments({
    required String yearMonth,
    required List<Map<String, dynamic>> items,
  }) async {
    final installationId = await _getInstallationId();
    if (installationId == null) {
      throw Exception('Device not registered. InstallationId not found.');
    }

    final callable = _functions.httpsCallable('createRecruitments');
    await callable.call({
      'yearMonth': yearMonth,
      'items': items,
      'installationId': installationId,
    });
  }

  /// シフト日の割当を更新
  Future<void> updateDayAssignments({
    required String dateKey,
    required List<ShiftAssignment> assignments,
  }) async {
    final installationId = await _getInstallationId();
    if (installationId == null) {
      throw Exception('Device not registered. InstallationId not found.');
    }

    final callable = _functions.httpsCallable('updateDayAssignments');
    await callable.call({
      'dateKey': dateKey,
      'assignments': assignments.map((a) => <String, dynamic>{
        'staffId': a.staffId,
        'staffName': a.staffName,
        'startMinute': a.startMinute,
        'endMinute': a.endMinute,
        'sourceRequestId': a.sourceRequestId,
      }).toList(),
      'installationId': installationId,
    });
  }

  /// 申請情報を取得（最新申請時間 + original audit 用）
  Future<
      ({
        int? startMinute,
        int? endMinute,
        int? originalStartMinute,
        int? originalEndMinute,
      })?> getShiftRequestById(String requestId) async {
    try {
      final doc = await _firestore.collection('shiftRequests').doc(requestId).get();
      if (!doc.exists) {
        return null;
      }
      
      final data = doc.data()!;
      return (
        startMinute: data['startMinute'] as int?,
        endMinute: data['endMinute'] as int?,
        originalStartMinute: data['originalStartMinute'] as int?,
        originalEndMinute: data['originalEndMinute'] as int?,
      );
    } catch (e) {
      debugPrint('Error fetching shift request: $e');
      return null;
    }
  }

  /// スタイルから営業時間を月単位で自動生成
  Future<void> generateBusinessHoursForMonthFromStyles({
    required String yearMonth,
    bool forceManualOverwrite = false,
  }) async {
    final installationId = await _getInstallationId();
    if (installationId == null) {
      throw Exception('Device not registered. InstallationId not found.');
    }

    final callable = _functions.httpsCallable('generateBusinessHoursForMonthFromStyles');
    await callable.call({
      'yearMonth': yearMonth,
      'installationId': installationId,
      'options': {
        'forceManualOverwrite': forceManualOverwrite,
      },
    });
  }

  /// 特定日の営業時間を手動設定（スタイル選択）
  Future<void> setBusinessHoursManualForDay({
    required String dateKey,
    required String styleId,
    int? openMinute,
    int? closeMinute,
    bool? isClosed,
  }) async {
    final installationId = await _getInstallationId();
    if (installationId == null) {
      throw Exception('Device not registered. InstallationId not found.');
    }

    final callable = _functions.httpsCallable('setBusinessHoursManualForDay');
    final payload = <String, dynamic>{
      'styleId': styleId,
    };
    if (openMinute != null) payload['openMinute'] = openMinute;
    if (closeMinute != null) payload['closeMinute'] = closeMinute;
    if (isClosed != null) payload['isClosed'] = isClosed;

    await callable.call({
      'dateKey': dateKey,
      'installationId': installationId,
      'payload': payload,
    });
  }

  /// 営業スタイル設定を保存
  Future<void> saveBusinessHoursStyles({
    required Map<String, dynamic> businessHoursStyles,
  }) async {
    final installationId = await _getInstallationId();
    if (installationId == null) {
      throw Exception('Device not registered. InstallationId not found.');
    }

    final callable = _functions.httpsCallable('saveBusinessHoursStyles');
    await callable.call({
      'installationId': installationId,
      'businessHoursStyles': businessHoursStyles,
    });
  }

  /// 必要人数設定（v2）を保存
  Future<void> saveRequiredStaffByTimeSlot({
    required Map<String, dynamic> requiredStaffByTimeSlot,
  }) async {
    final installationId = await _getInstallationId();
    if (installationId == null) {
      throw Exception('Device not registered. InstallationId not found.');
    }

    final callable = _functions.httpsCallable('saveRequiredStaffByTimeSlotCallable');
    await callable.call({
      'installationId': installationId,
      'requiredStaffByTimeSlot': requiredStaffByTimeSlot,
    });
  }
}
