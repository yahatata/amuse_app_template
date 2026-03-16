/// storeMeta/config の購読サービス
///
/// snapshot で storeMeta/config を購読し、各画面は stream から取得。
/// 未存在時はデフォルトにフォールバック。読み取り失敗時は最後の成功値を維持。
///
/// 参照: docs/config_migration/phase1/PHASE1_FALLBACK_BEHAVIOR.md
///       docs/config_migration/phase1/PHASE1_CONFIG_SCHEMA.md
///
/// 注意: Flutter は最終判定を持たない（SSoT は Functions）。表示・入力補助用途に限定。

import 'dart:async';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/foundation.dart';

import 'store_config_defaults.dart';

/// storeMeta/config のデータクラス
/// （const でない理由: categoryPaymentMethods 等のコピーは const では表現できない）
class StoreConfigData {
  final bool dualWriteEnabled;
  final bool enqueueSchedulerEnabled;
  final bool templateBusinessDateCheck;
  final bool settlementAggregatorEnabled;
  final bool tableDeviceRegistrationEnabled;
  final bool createAttendanceByManual;
  final bool attendanceTimeAdjustmentEnabled;
  final int? attendanceTimeAdjustmentMaxFutureMinutes;
  final int? attendanceTimeAdjustmentMaxPastMinutes;
  final bool autoOpenCloseEnabled;
  final int taskCloseOffsetMinutes;
  final int taskOpenOffsetMinutes;
  final int calcBufferMinutes;
  final int entranceFee;
  final String entranceFeeDescription;
  final bool chargeEntranceFeeOnReentry;
  final double sideGameChipRate;
  final Map<String, List<String>> categoryPaymentMethods;
  final List<String> pointPriority;
  final int pointABRoundingUnit;
  final int sideGameChipRoundingUnit;
  final Map<String, Map<String, dynamic>> businessHoursStyles;
  final String linePlan;
  final int shiftSubmissionStartDay;
  final int shiftSubmissionEndDay;
  final int shiftSchedulingStartDay;
  final int payrollStartDay;
  final int payrollEndDay;
  final List<String> menuCategories;
  final List<String> sideGameTypes;
  final double tournamentDefaultPrizeRatio;
  final int tournamentPrizeReceiverPercentage;
  final String tournamentPrizeRoundingMethod;
  final int tournamentPrizeRoundingUnit;
  final Map<int, List<double>> tournamentPrizeDistribution;

  StoreConfigData({
    this.dualWriteEnabled = kDefaultDualWriteEnabled,
    this.enqueueSchedulerEnabled = kDefaultEnqueueSchedulerEnabled,
    this.templateBusinessDateCheck = kDefaultTemplateBusinessDateCheck,
    this.settlementAggregatorEnabled = kDefaultSettlementAggregatorEnabled,
    this.tableDeviceRegistrationEnabled = kDefaultTableDeviceRegistrationEnabled,
    this.createAttendanceByManual = kDefaultCreateAttendanceByManual,
    this.attendanceTimeAdjustmentEnabled =
        kDefaultAttendanceTimeAdjustmentEnabled,
    this.attendanceTimeAdjustmentMaxFutureMinutes =
        kDefaultAttendanceTimeAdjustmentMaxFutureMinutes,
    this.attendanceTimeAdjustmentMaxPastMinutes =
        kDefaultAttendanceTimeAdjustmentMaxPastMinutes,
    this.autoOpenCloseEnabled = kDefaultAutoOpenCloseEnabled,
    this.taskCloseOffsetMinutes = kDefaultTaskCloseOffsetMinutes,
    this.taskOpenOffsetMinutes = kDefaultTaskOpenOffsetMinutes,
    this.calcBufferMinutes = kDefaultCalcBufferMinutes,
    this.entranceFee = kDefaultEntranceFee,
    this.entranceFeeDescription = kDefaultEntranceFeeDescription,
    this.chargeEntranceFeeOnReentry = kDefaultChargeEntranceFeeOnReentry,
    this.sideGameChipRate = kDefaultSideGameChipRate,
    Map<String, List<String>>? categoryPaymentMethods,
    List<String>? pointPriority,
    this.pointABRoundingUnit = kDefaultPointABRoundingUnit,
    this.sideGameChipRoundingUnit = kDefaultSideGameChipRoundingUnit,
    Map<String, Map<String, dynamic>>? businessHoursStyles,
    this.linePlan = kDefaultLinePlan,
    this.shiftSubmissionStartDay = kDefaultShiftSubmissionStartDay,
    this.shiftSubmissionEndDay = kDefaultShiftSubmissionEndDay,
    this.shiftSchedulingStartDay = kDefaultShiftSchedulingStartDay,
    this.payrollStartDay = kDefaultPayrollStartDay,
    this.payrollEndDay = kDefaultPayrollEndDay,
    List<String>? menuCategories,
    List<String>? sideGameTypes,
    double? tournamentDefaultPrizeRatio,
    int? tournamentPrizeReceiverPercentage,
    String? tournamentPrizeRoundingMethod,
    int? tournamentPrizeRoundingUnit,
    Map<int, List<double>>? tournamentPrizeDistribution,
  })  : businessHoursStyles =
            businessHoursStyles ?? Map<String, Map<String, dynamic>>.from(kDefaultBusinessHoursStyles),
        categoryPaymentMethods =
            categoryPaymentMethods ?? Map<String, List<String>>.from(kDefaultCategoryPaymentMethods),
        pointPriority = pointPriority ?? List<String>.from(kDefaultPointPriority),
        menuCategories = menuCategories ?? List<String>.from(kDefaultMenuCategories),
        sideGameTypes = sideGameTypes ?? List<String>.from(kDefaultSideGameTypes),
        tournamentDefaultPrizeRatio =
            tournamentDefaultPrizeRatio ?? kDefaultTournamentPrizeRatio,
        tournamentPrizeReceiverPercentage =
            tournamentPrizeReceiverPercentage ?? kDefaultTournamentPrizeReceiverPercentage,
        tournamentPrizeRoundingMethod =
            tournamentPrizeRoundingMethod ?? kDefaultTournamentPrizeRoundingMethod,
        tournamentPrizeRoundingUnit =
            tournamentPrizeRoundingUnit ?? kDefaultTournamentPrizeRoundingUnit,
        tournamentPrizeDistribution =
            tournamentPrizeDistribution ?? Map<int, List<double>>.from(kDefaultTournamentPrizeDistribution);

  static StoreConfigData fromDefaults() => StoreConfigData();

  Map<String, dynamic>? getBusinessHoursByStyleId(String styleId) {
    return businessHoursStyles[styleId];
  }

  factory StoreConfigData.fromMap(Map<String, dynamic>? data) {
    if (data == null || data.isEmpty) return StoreConfigData.fromDefaults();

    final features = data['features'] as Map<String, dynamic>?;
    final attendanceTimeAdjustment =
        data['attendanceTimeAdjustment'] as Map<String, dynamic>?;
    final autoOpenClose = data['autoOpenClose'] as Map<String, dynamic>?;
    final businessDay = data['businessDay'] as Map<String, dynamic>?;
    final billing = data['billing'] as Map<String, dynamic>?;
    final paymentPolicy = billing?['paymentPolicy'] as Map<String, dynamic>?;
    final roundingUnits = paymentPolicy?['roundingUnits'] as Map<String, dynamic>?;
    final shift = data['shift'] as Map<String, dynamic>?;
    final payroll = data['payroll'] as Map<String, dynamic>?;
    final tournament = data['tournament'] as Map<String, dynamic>?;

    int? parseInt(dynamic v) => v is int ? v : (v is num ? v.toInt() : null);
    double? parseDouble(dynamic v) => v is num ? v.toDouble() : null;
    bool? parseBool(dynamic v) => v is bool ? v : null;
    String? parseString(dynamic v) => v is String ? v : null;

    Map<String, Map<String, dynamic>>? _parseBusinessHoursStyles(dynamic v) {
      if (v is! Map) return null;
      final result = <String, Map<String, dynamic>>{};
      for (final e in v.entries) {
        if (e.value is Map) {
          final m = e.value as Map;
          if (m['styleId'] is String && m['openMinute'] is num && m['closeMinute'] is num && m['isClosed'] is bool) {
            result[e.key.toString()] = {
              'styleId': m['styleId'] as String,
              'openMinute': (m['openMinute'] as num).toInt(),
              'closeMinute': (m['closeMinute'] as num).toInt(),
              'isClosed': m['isClosed'] as bool,
            };
          }
        }
      }
      return result.isNotEmpty ? result : null;
    }

    Map<String, List<String>>? parseCategoryPaymentMethods(dynamic v) {
      if (v is! Map) return null;
      final result = <String, List<String>>{};
      for (final e in v.entries) {
        if (e.value is List) {
          result[e.key.toString()] =
              (e.value as List).map((x) => x.toString()).toList();
        }
      }
      return result.isNotEmpty ? result : null;
    }

    Map<int, List<double>>? _parsePrizeDistribution(dynamic v) {
      if (v is! Map) return null;
      final result = <int, List<double>>{};
      for (final e in v.entries) {
        final key = int.tryParse(e.key.toString());
        if (key == null || key < 1 || key > 10) continue;
        if (e.value is List) {
          final list = (e.value as List)
              .map((x) => x is num ? x.toDouble() : null)
              .whereType<double>()
              .toList();
          if (list.isNotEmpty) result[key] = list;
        }
      }
      return result.isNotEmpty ? result : null;
    }

    final pd = _parsePrizeDistribution(tournament?['prizeDistribution']);
    final prRatio = parseDouble(tournament?['defaultPrizeRatio']);
    final prPct = parseInt(tournament?['prizeReceiverPercentage']);
    final prMethod = parseString(tournament?['prizeRoundingMethod']);
    final prUnit = parseInt(tournament?['prizeRoundingUnit']);

    return StoreConfigData(
      dualWriteEnabled:
          parseBool(features?['dualWriteEnabled']) ?? kDefaultDualWriteEnabled,
      enqueueSchedulerEnabled: parseBool(features?['enqueueSchedulerEnabled']) ??
          kDefaultEnqueueSchedulerEnabled,
      templateBusinessDateCheck:
          parseBool(features?['templateBusinessDateCheck']) ??
              kDefaultTemplateBusinessDateCheck,
      settlementAggregatorEnabled:
          parseBool(features?['settlementAggregatorEnabled']) ??
              kDefaultSettlementAggregatorEnabled,
      tableDeviceRegistrationEnabled:
          parseBool(features?['tableDeviceRegistrationEnabled']) ??
              kDefaultTableDeviceRegistrationEnabled,
      createAttendanceByManual:
          parseBool(features?['createAttendanceByManual']) ??
              kDefaultCreateAttendanceByManual,
      attendanceTimeAdjustmentEnabled:
          parseBool(attendanceTimeAdjustment?['enabled']) ??
              kDefaultAttendanceTimeAdjustmentEnabled,
      attendanceTimeAdjustmentMaxFutureMinutes:
          attendanceTimeAdjustment?['maxFutureMinutes'] == null
              ? null
              : parseInt(attendanceTimeAdjustment?['maxFutureMinutes']),
      attendanceTimeAdjustmentMaxPastMinutes:
          attendanceTimeAdjustment?['maxPastMinutes'] == null
              ? null
              : parseInt(attendanceTimeAdjustment?['maxPastMinutes']),
      autoOpenCloseEnabled:
          parseBool(autoOpenClose?['enabled']) ?? kDefaultAutoOpenCloseEnabled,
      taskCloseOffsetMinutes:
          parseInt(autoOpenClose?['taskCloseOffsetMinutes']) ??
              kDefaultTaskCloseOffsetMinutes,
      taskOpenOffsetMinutes:
          parseInt(autoOpenClose?['taskOpenOffsetMinutes']) ??
              kDefaultTaskOpenOffsetMinutes,
      calcBufferMinutes:
          parseInt(businessDay?['calcBufferMinutes']) ?? kDefaultCalcBufferMinutes,
      entranceFee: parseInt(billing?['entranceFee']) ?? kDefaultEntranceFee,
      entranceFeeDescription: parseString(billing?['entranceFeeDescription']) ??
          kDefaultEntranceFeeDescription,
      chargeEntranceFeeOnReentry:
          parseBool(billing?['chargeEntranceFeeOnReentry']) ??
              kDefaultChargeEntranceFeeOnReentry,
      sideGameChipRate:
          parseDouble(billing?['sideGameChipRate']) ?? kDefaultSideGameChipRate,
      categoryPaymentMethods:
          parseCategoryPaymentMethods(billing?['paymentPolicy']?['categoryPaymentMethods']) ??
              kDefaultCategoryPaymentMethods,
      pointPriority:
          (paymentPolicy?['pointPriority'] as List<dynamic>?)
                  ?.map((e) => e.toString())
                  .toList() ??
              kDefaultPointPriority,
      pointABRoundingUnit:
          parseInt(roundingUnits?['pointAB']) ?? kDefaultPointABRoundingUnit,
      sideGameChipRoundingUnit:
          parseInt(roundingUnits?['sideGameChip']) ??
              kDefaultSideGameChipRoundingUnit,
      businessHoursStyles: _parseBusinessHoursStyles(data['businessHoursStyles']),
      linePlan: (parseString(data['linePlan']) != null &&
              ['communication', 'light', 'standard'].contains(data['linePlan']))
          ? data['linePlan'] as String
          : kDefaultLinePlan,
      shiftSubmissionStartDay:
          parseInt(shift?['submissionStartDay']) ?? kDefaultShiftSubmissionStartDay,
      shiftSubmissionEndDay:
          parseInt(shift?['submissionEndDay']) ?? kDefaultShiftSubmissionEndDay,
      shiftSchedulingStartDay:
          parseInt(shift?['schedulingStartDay']) ?? kDefaultShiftSchedulingStartDay,
      payrollStartDay: parseInt(payroll?['startDay']) ?? kDefaultPayrollStartDay,
      payrollEndDay: parseInt(payroll?['endDay']) ?? kDefaultPayrollEndDay,
      menuCategories: (data['menuCategories'] as List<dynamic>?) != null &&
              (data['menuCategories'] as List).isNotEmpty
          ? (data['menuCategories'] as List).map((e) => e.toString()).toList()
          : kDefaultMenuCategories,
      sideGameTypes: (data['sideGameTypes'] as List<dynamic>?) != null &&
              (data['sideGameTypes'] as List).isNotEmpty
          ? (data['sideGameTypes'] as List).map((e) => e.toString()).toList()
          : kDefaultSideGameTypes,
      tournamentDefaultPrizeRatio: (prRatio != null &&
              prRatio >= 0.0 &&
              prRatio <= 1.0)
          ? prRatio
          : kDefaultTournamentPrizeRatio,
      tournamentPrizeReceiverPercentage: (prPct != null &&
              prPct >= 1 &&
              prPct <= 100)
          ? prPct
          : kDefaultTournamentPrizeReceiverPercentage,
      tournamentPrizeRoundingMethod: (prMethod != null &&
              ['floor', 'ceil', 'round'].contains(prMethod))
          ? prMethod
          : kDefaultTournamentPrizeRoundingMethod,
      tournamentPrizeRoundingUnit: (prUnit != null &&
              [1, 10, 100, 1000].contains(prUnit))
          ? prUnit
          : kDefaultTournamentPrizeRoundingUnit,
      tournamentPrizeDistribution: pd ?? kDefaultTournamentPrizeDistribution,
    );
  }
}

/// storeMeta/config を snapshot で購読するサービス（シングルトン）
class StoreConfigService {
  final FirebaseFirestore _firestore = FirebaseFirestore.instance;
  StreamSubscription<DocumentSnapshot<Map<String, dynamic>>>? _subscription;
  final StreamController<StoreConfigData> _streamController =
      StreamController<StoreConfigData>.broadcast();

  StoreConfigData? _latestData;

  static final StoreConfigService _instance = StoreConfigService._();
  static StoreConfigService get instance => _instance;

  StoreConfigService._() {
    _initializeListener();
  }

  void _logConfigFallback({
    required String configKey,
    required String reason,
    Object? fallbackValue,
  }) {
    debugPrint(
      '[CONFIG_FALLBACK] configKey=$configKey | reason=$reason | '
      'fallbackValue=$fallbackValue',
    );
  }

  void _logConfigReadError(String message) {
    debugPrint('[CONFIG_READ_ERROR] reason=read_error | message=$message');
  }

  void _initializeListener() {
    _subscription = _firestore
        .collection('storeMeta')
        .doc('config')
        .snapshots()
        .listen(
      (snapshot) {
        if (!snapshot.exists) {
          _logConfigFallback(
            configKey: '*',
            reason: 'document_missing',
            fallbackValue: 'defaults',
          );
          final data = StoreConfigData.fromDefaults();
          _latestData = data;
          _streamController.add(data);
          return;
        }
        final raw = snapshot.data();
        final data = StoreConfigData.fromMap(raw);
        _latestData = data;
        _streamController.add(data);
      },
      onError: (error) {
        _logConfigReadError(error.toString());
        // 最後の成功値を維持。デフォルトには切り替えない。
        if (_latestData != null) {
          _streamController.add(_latestData!);
        } else {
          // 初回でキャッシュなしの場合はデフォルトを返す（運用上ほぼ起きない）
          _logConfigFallback(
            configKey: '*',
            reason: 'read_error_no_cache',
            fallbackValue: 'defaults',
          );
          final data = StoreConfigData.fromDefaults();
          _latestData = data;
          _streamController.add(data);
        }
      },
    );
  }

  /// 現在の storeMeta/config の最新値
  StoreConfigData? get latestData => _latestData;

  Stream<StoreConfigData> get stream async* {
    if (_latestData != null) {
      yield _latestData!;
    }
    yield* _streamController.stream;
  }

  void dispose() {
    _subscription?.cancel();
    _streamController.close();
  }
}
