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
import '../user/validate_point_config.dart';

/// storeMeta/config のデータクラス
/// （const でない理由: categoryPaymentMethods 等のコピーは const では表現できない）
class StoreConfigData {
  final bool dualWriteEnabled;
  final bool enqueueSchedulerEnabled;
  final bool templateBusinessDateCheck;
  final bool settlementAggregatorEnabled;
  final bool reportingAggregatorEnabled;
  final bool tableDeviceRegistrationEnabled;
  final String tableDeviceForceClearPasscode;
  final bool tableDeviceTournamentSeatAssignmentEnabled;
  final bool tableDeviceActionHistoryViewEnabled;
  final bool tableDeviceActionHistoryRollbackEnabled;
  final bool createAttendanceByManual;
  final bool attendanceTimeAdjustmentEnabled;
  final int? attendanceTimeAdjustmentMaxFutureMinutes;
  final int? attendanceTimeAdjustmentMaxPastMinutes;
  final bool autoOpenCloseEnabled;
  final int taskCloseOffsetMinutes;
  final int taskOpenOffsetMinutes;
  final int alreadyRunningDifferentDateRecheckMinutes;
  final int calcBufferMinutes;
  final int entranceFee;
  final String entranceFeeDescription;
  final bool chargeEntranceFeeOnReentry;
  final double sideGameChipRate;
  final Map<String, List<String>> categoryPaymentMethods;
  final List<String> pointPriority;
  final int pointABRoundingUnit;
  final int sideGameChipRoundingUnit;
  final String linePlan;

  /// storeMeta/config.okibake.loginPromptMode（詳細仕様書 §14.15）
  final String okibakeLoginPromptMode;
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
  final bool tournamentLiffRegistrationEnabled;
  final bool tournamentLiffCalendarEnabled;

  /// A-7: 未設定は null（default 補完しない）
  final Map<String, dynamic>? pointSettings;

  /// A-7: 未設定は null
  final Map<String, dynamic>? sideGameChipSettings;

  /// A-7: キー欠落は null。存在時は List（空可）または不正生値。
  final Object? rankingRewardPointTypes;

  /// A-7: 未設定は null
  final Map<String, dynamic>? balancePaymentSettings;

  /// A-7: billing.paymentPolicy.categoryOrder。未設定は null（ハードコード順 fallback 禁止）
  final List<String>? categoryOrder;

  StoreConfigData({
    this.dualWriteEnabled = kDefaultDualWriteEnabled,
    this.enqueueSchedulerEnabled = kDefaultEnqueueSchedulerEnabled,
    this.templateBusinessDateCheck = kDefaultTemplateBusinessDateCheck,
    this.settlementAggregatorEnabled = kDefaultSettlementAggregatorEnabled,
    this.reportingAggregatorEnabled = kDefaultReportingAggregatorEnabled,
    this.tableDeviceRegistrationEnabled =
        kDefaultTableDeviceRegistrationEnabled,
    this.tableDeviceForceClearPasscode = kDefaultTableDeviceForceClearPasscode,
    this.tableDeviceTournamentSeatAssignmentEnabled =
        kDefaultTableDeviceTournamentSeatAssignmentEnabled,
    this.tableDeviceActionHistoryViewEnabled =
        kDefaultTableDeviceActionHistoryViewEnabled,
    this.tableDeviceActionHistoryRollbackEnabled =
        kDefaultTableDeviceActionHistoryRollbackEnabled,
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
    this.alreadyRunningDifferentDateRecheckMinutes =
        kDefaultAlreadyRunningDifferentDateRecheckMinutes,
    this.calcBufferMinutes = kDefaultCalcBufferMinutes,
    this.entranceFee = kDefaultEntranceFee,
    this.entranceFeeDescription = kDefaultEntranceFeeDescription,
    this.chargeEntranceFeeOnReentry = kDefaultChargeEntranceFeeOnReentry,
    this.sideGameChipRate = kDefaultSideGameChipRate,
    Map<String, List<String>>? categoryPaymentMethods,
    List<String>? pointPriority,
    this.pointABRoundingUnit = kDefaultPointABRoundingUnit,
    this.sideGameChipRoundingUnit = kDefaultSideGameChipRoundingUnit,
    this.linePlan = kDefaultLinePlan,
    this.okibakeLoginPromptMode = kDefaultOkibakeLoginPromptMode,
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
    bool? tournamentLiffRegistrationEnabled,
    bool? tournamentLiffCalendarEnabled,
    this.pointSettings,
    this.sideGameChipSettings,
    this.rankingRewardPointTypes,
    this.balancePaymentSettings,
    this.categoryOrder,
  }) : categoryPaymentMethods =
           categoryPaymentMethods ??
           Map<String, List<String>>.from(kDefaultCategoryPaymentMethods),
       pointPriority =
           pointPriority ?? List<String>.from(kDefaultPointPriority),
       menuCategories =
           menuCategories ?? List<String>.from(kDefaultMenuCategories),
       sideGameTypes =
           sideGameTypes ?? List<String>.from(kDefaultSideGameTypes),
       tournamentDefaultPrizeRatio =
           tournamentDefaultPrizeRatio ?? kDefaultTournamentPrizeRatio,
       tournamentPrizeReceiverPercentage =
           tournamentPrizeReceiverPercentage ??
           kDefaultTournamentPrizeReceiverPercentage,
       tournamentPrizeRoundingMethod =
           tournamentPrizeRoundingMethod ??
           kDefaultTournamentPrizeRoundingMethod,
       tournamentPrizeRoundingUnit =
           tournamentPrizeRoundingUnit ?? kDefaultTournamentPrizeRoundingUnit,
       tournamentPrizeDistribution =
           tournamentPrizeDistribution ??
           Map<int, List<double>>.from(kDefaultTournamentPrizeDistribution),
       tournamentLiffRegistrationEnabled =
           tournamentLiffRegistrationEnabled ??
           kDefaultTournamentLiffRegistrationEnabled,
       tournamentLiffCalendarEnabled =
           tournamentLiffCalendarEnabled ??
           kDefaultTournamentLiffCalendarEnabled;

  /// A-7 ポイント config 整合性。失敗しても起動は落とさない（画面側で参照）。
  PointConfigValidationResult validatePointConfigA7() {
    return tryValidatePointConfig(
      pointSettings: pointSettings,
      sideGameChipSettings: sideGameChipSettings,
      rankingRewardPointTypes: rankingRewardPointTypes,
      categoryPaymentMethods: categoryPaymentMethods,
      pointPriority: pointPriority,
      balancePaymentSettings: balancePaymentSettings,
      categoryOrder: categoryOrder,
    );
  }

  static StoreConfigData fromDefaults() => StoreConfigData();

  /// [onParseComplete] が指定された場合、パース完了時に fromConfig/fromDefaults を渡す。
  factory StoreConfigData.fromMap(
    Map<String, dynamic>? data, {
    void Function(List<String> fromConfig, List<String> fromDefaults)?
    onParseComplete,
  }) {
    if (data == null || data.isEmpty) {
      if (onParseComplete != null) onParseComplete([], ['*']);
      return StoreConfigData.fromDefaults();
    }

    final fromConfig = <String>[];
    final fromDefaults = <String>[];
    void track(String key, bool fromCfg) {
      if (fromCfg) {
        fromConfig.add(key);
      } else {
        fromDefaults.add(key);
      }
    }

    final features = data['features'] as Map<String, dynamic>?;
    final tableDevice = data['tableDevice'] as Map<String, dynamic>?;
    final attendanceTimeAdjustment =
        data['attendanceTimeAdjustment'] as Map<String, dynamic>?;
    final autoOpenClose = data['autoOpenClose'] as Map<String, dynamic>?;
    final businessDay = data['businessDay'] as Map<String, dynamic>?;
    final billing = data['billing'] as Map<String, dynamic>?;
    final paymentPolicy = billing?['paymentPolicy'] as Map<String, dynamic>?;
    final roundingUnits =
        paymentPolicy?['roundingUnits'] as Map<String, dynamic>?;
    final shift = data['shift'] as Map<String, dynamic>?;
    final payroll = data['payroll'] as Map<String, dynamic>?;
    final tournament = data['tournament'] as Map<String, dynamic>?;

    int? parseInt(dynamic v) => v is int ? v : (v is num ? v.toInt() : null);
    double? parseDouble(dynamic v) => v is num ? v.toDouble() : null;
    bool? parseBool(dynamic v) => v is bool ? v : null;
    String? parseString(dynamic v) => v is String ? v : null;

    Map<String, List<String>>? parseCategoryPaymentMethods(dynamic v) {
      if (v is! Map) return null;
      final result = <String, List<String>>{};
      for (final e in v.entries) {
        if (e.value is List) {
          result[e.key.toString()] = (e.value as List)
              .map((x) => x.toString())
              .toList();
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

    final result = StoreConfigData(
      dualWriteEnabled:
          parseBool(features?['dualWriteEnabled']) ?? kDefaultDualWriteEnabled,
      enqueueSchedulerEnabled:
          parseBool(features?['enqueueSchedulerEnabled']) ??
          kDefaultEnqueueSchedulerEnabled,
      templateBusinessDateCheck:
          parseBool(features?['templateBusinessDateCheck']) ??
          kDefaultTemplateBusinessDateCheck,
      settlementAggregatorEnabled:
          parseBool(features?['settlementAggregatorEnabled']) ??
          kDefaultSettlementAggregatorEnabled,
      reportingAggregatorEnabled:
          parseBool(features?['reportingAggregatorEnabled']) ??
          kDefaultReportingAggregatorEnabled,
      tableDeviceRegistrationEnabled:
          parseBool(features?['tableDeviceRegistrationEnabled']) ??
          kDefaultTableDeviceRegistrationEnabled,
      tableDeviceForceClearPasscode: () {
        final value = parseString(tableDevice?['forceClearPasscode']);
        final normalized = value != null && RegExp(r'^\d{4}$').hasMatch(value)
            ? value
            : null;
        track('tableDevice.forceClearPasscode', normalized != null);
        return normalized ?? kDefaultTableDeviceForceClearPasscode;
      }(),
      tableDeviceTournamentSeatAssignmentEnabled: () {
        final value = parseBool(
          tableDevice?['tournamentSeatAssignmentEnabled'],
        );
        track('tableDevice.tournamentSeatAssignmentEnabled', value != null);
        return value ?? kDefaultTableDeviceTournamentSeatAssignmentEnabled;
      }(),
      tableDeviceActionHistoryViewEnabled: () {
        final value = parseBool(tableDevice?['actionHistoryViewEnabled']);
        track('tableDevice.actionHistoryViewEnabled', value != null);
        return value ?? kDefaultTableDeviceActionHistoryViewEnabled;
      }(),
      tableDeviceActionHistoryRollbackEnabled: () {
        final value = parseBool(tableDevice?['actionHistoryRollbackEnabled']);
        track('tableDevice.actionHistoryRollbackEnabled', value != null);
        return value ?? kDefaultTableDeviceActionHistoryRollbackEnabled;
      }(),
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
      autoOpenCloseEnabled: () {
        final v = parseBool(autoOpenClose?['enabled']);
        final r = v ?? kDefaultAutoOpenCloseEnabled;
        track('autoOpenClose.enabled', v != null);
        return r;
      }(),
      taskCloseOffsetMinutes:
          parseInt(autoOpenClose?['taskCloseOffsetMinutes']) ??
          kDefaultTaskCloseOffsetMinutes,
      taskOpenOffsetMinutes:
          parseInt(autoOpenClose?['taskOpenOffsetMinutes']) ??
          kDefaultTaskOpenOffsetMinutes,
      alreadyRunningDifferentDateRecheckMinutes: () {
        final v = parseInt(
          autoOpenClose?['alreadyRunningDifferentDateRecheckMinutes'],
        );
        final ok = v != null && v >= 1 && v <= 180;
        track('autoOpenClose.alreadyRunningDifferentDateRecheckMinutes', ok);
        return ok ? v : kDefaultAlreadyRunningDifferentDateRecheckMinutes;
      }(),
      calcBufferMinutes:
          parseInt(businessDay?['calcBufferMinutes']) ??
          kDefaultCalcBufferMinutes,
      entranceFee: parseInt(billing?['entranceFee']) ?? kDefaultEntranceFee,
      entranceFeeDescription:
          parseString(billing?['entranceFeeDescription']) ??
          kDefaultEntranceFeeDescription,
      chargeEntranceFeeOnReentry:
          parseBool(billing?['chargeEntranceFeeOnReentry']) ??
          kDefaultChargeEntranceFeeOnReentry,
      sideGameChipRate:
          parseDouble(billing?['sideGameChipRate']) ?? kDefaultSideGameChipRate,
      categoryPaymentMethods:
          parseCategoryPaymentMethods(
            billing?['paymentPolicy']?['categoryPaymentMethods'],
          ) ??
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
      linePlan:
          (parseString(data['linePlan']) != null &&
              ['communication', 'light', 'standard'].contains(data['linePlan']))
          ? data['linePlan'] as String
          : kDefaultLinePlan,
      okibakeLoginPromptMode: () {
        final okibake = data['okibake'];
        if (okibake is Map) {
          final modeRaw = okibake['loginPromptMode'];
          if (modeRaw is String &&
              (modeRaw == kOkibakeLoginPromptModeNone ||
                  modeRaw == kOkibakeLoginPromptModeNoticeOnly ||
                  modeRaw == kOkibakeLoginPromptModeLinkPrompt)) {
            track('okibake.loginPromptMode', true);
            return modeRaw;
          }
        }
        track('okibake.loginPromptMode', false);
        return kDefaultOkibakeLoginPromptMode;
      }(),
      shiftSubmissionStartDay:
          parseInt(shift?['submissionStartDay']) ??
          kDefaultShiftSubmissionStartDay,
      shiftSubmissionEndDay:
          parseInt(shift?['submissionEndDay']) ?? kDefaultShiftSubmissionEndDay,
      shiftSchedulingStartDay:
          parseInt(shift?['schedulingStartDay']) ??
          kDefaultShiftSchedulingStartDay,
      payrollStartDay:
          parseInt(payroll?['startDay']) ?? kDefaultPayrollStartDay,
      payrollEndDay: parseInt(payroll?['endDay']) ?? kDefaultPayrollEndDay,
      menuCategories: () {
        final raw = data['menuCategories'] as List<dynamic>?;
        final ok = raw != null && (raw as List).isNotEmpty;
        track('menuCategories', ok);
        return ok
            ? (raw as List).map((e) => e.toString()).toList()
            : kDefaultMenuCategories;
      }(),
      sideGameTypes: () {
        final raw = data['sideGameTypes'] as List<dynamic>?;
        final ok = raw != null && (raw as List).isNotEmpty;
        track('sideGameTypes', ok);
        return ok
            ? (raw as List).map((e) => e.toString()).toList()
            : kDefaultSideGameTypes;
      }(),
      tournamentDefaultPrizeRatio: () {
        final ok = prRatio != null && prRatio >= 0.0 && prRatio <= 1.0;
        track('tournament.defaultPrizeRatio', ok);
        return ok ? prRatio! : kDefaultTournamentPrizeRatio;
      }(),
      tournamentPrizeReceiverPercentage: () {
        final ok = prPct != null && prPct >= 1 && prPct <= 100;
        track('tournament.prizeReceiverPercentage', ok);
        return ok ? prPct! : kDefaultTournamentPrizeReceiverPercentage;
      }(),
      tournamentPrizeRoundingMethod: () {
        final ok =
            prMethod != null && ['floor', 'ceil', 'round'].contains(prMethod);
        track('tournament.prizeRoundingMethod', ok);
        return ok ? prMethod! : kDefaultTournamentPrizeRoundingMethod;
      }(),
      tournamentPrizeRoundingUnit: () {
        final ok = prUnit != null && [1, 10, 100, 1000].contains(prUnit);
        track('tournament.prizeRoundingUnit', ok);
        return ok ? prUnit! : kDefaultTournamentPrizeRoundingUnit;
      }(),
      tournamentPrizeDistribution: () {
        final ok = pd != null;
        track('tournament.prizeDistribution', ok);
        return pd ?? kDefaultTournamentPrizeDistribution;
      }(),
      tournamentLiffRegistrationEnabled: () {
        final val = parseBool(tournament?['liffRegistrationEnabled']);
        track('tournament.liffRegistrationEnabled', val != null);
        return val ?? kDefaultTournamentLiffRegistrationEnabled;
      }(),
      tournamentLiffCalendarEnabled: () {
        final val = parseBool(tournament?['liffCalendarEnabled']);
        track('tournament.liffCalendarEnabled', val != null);
        return val ?? kDefaultTournamentLiffCalendarEnabled;
      }(),
      pointSettings: () {
        final raw = data['pointSettings'];
        if (raw is Map) {
          track('pointSettings', true);
          return Map<String, dynamic>.from(raw);
        }
        track('pointSettings', false);
        return null;
      }(),
      sideGameChipSettings: () {
        final raw = data['sideGameChipSettings'];
        if (raw is Map) {
          track('sideGameChipSettings', true);
          return Map<String, dynamic>.from(raw);
        }
        track('sideGameChipSettings', false);
        return null;
      }(),
      rankingRewardPointTypes: () {
        final t = tournament;
        if (t == null || !t.containsKey('rankingRewardPointTypes')) {
          track('tournament.rankingRewardPointTypes', false);
          return null;
        }
        final raw = t['rankingRewardPointTypes'];
        track('tournament.rankingRewardPointTypes', true);
        if (raw is List) {
          return raw.map((e) => e.toString()).toList();
        }
        return raw;
      }(),
      balancePaymentSettings: () {
        final raw = paymentPolicy?['balancePaymentSettings'];
        if (raw is Map) {
          track('billing.paymentPolicy.balancePaymentSettings', true);
          return Map<String, dynamic>.from(raw);
        }
        track('billing.paymentPolicy.balancePaymentSettings', false);
        return null;
      }(),
      categoryOrder: () {
        final raw = paymentPolicy?['categoryOrder'];
        if (raw is List && raw.isNotEmpty) {
          track('billing.paymentPolicy.categoryOrder', true);
          return raw.map((e) => e.toString()).toList();
        }
        track('billing.paymentPolicy.categoryOrder', false);
        return null;
      }(),
    );
    if (onParseComplete != null) {
      fromConfig.sort();
      fromDefaults.sort();
      onParseComplete(fromConfig, fromDefaults);
    }
    return result;
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
    debugPrint('[storeMeta/config] 購読開始（アプリ起動時）');
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
              debugPrint(
                '[config_load_summary] fromConfig=[] | fromDefaults=[*]',
              );
              final data = StoreConfigData.fromDefaults();
              _latestData = data;
              _streamController.add(data);
              return;
            }
            final raw = snapshot.data();
            final data = StoreConfigData.fromMap(
              raw,
              onParseComplete: (fromConfig, fromDefaults) {
                debugPrint(
                  '[config_load_summary] fromConfig=$fromConfig | fromDefaults=$fromDefaults',
                );
              },
            );
            _latestData = data;
            _streamController.add(data);
            debugPrint('[storeMeta/config] 取得完了（初回/更新）');
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
              debugPrint(
                '[config_load_summary] fromConfig=[] | fromDefaults=[*]',
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
