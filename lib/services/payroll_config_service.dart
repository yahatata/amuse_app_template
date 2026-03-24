/// storeMeta/payrollConfig の購読サービス
///
/// StoreConfigService と同一パターンのシングルトン。
/// snapshot で storeMeta/payrollConfig を購読し、各画面は stream から取得。
///
/// 参照: docs/config_migration/phase4_3/specs/02_CONFIG_SPEC.md

import 'dart:async';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/foundation.dart';

import 'payroll_config_defaults.dart';

/// storeMeta/payrollConfig のデータクラス
class PayrollConfigData {
  final String? paymentDate;
  final bool bulkPaymentRegistrationEnabled;
  final int maxCandidatesCount;
  final int weekStartDay;
  final int weeklyLegalLimitMinutes;
  final int? legalHolidayWeekday;
  final String calcVersion;
  final double nightPremiumRate;
  final double overtimePremiumRate;
  final double over60PremiumRate;
  final double legalHolidayPremiumRate;
  final String roundingMethod;
  final int roundingPrecision;
  final int schedulerNotificationHour;
  final int reminderStartDaysAfterPeriodEnd;

  PayrollConfigData({
    this.paymentDate = kDefaultPayrollConfigPaymentDate,
    this.bulkPaymentRegistrationEnabled =
        kDefaultPayrollConfigBulkPaymentRegistrationEnabled,
    this.maxCandidatesCount = kDefaultPayrollConfigMaxCandidatesCount,
    this.weekStartDay = kDefaultPayrollConfigWeekStartDay,
    this.weeklyLegalLimitMinutes =
        kDefaultPayrollConfigWeeklyLegalLimitMinutes,
    this.legalHolidayWeekday = kDefaultPayrollConfigLegalHolidayWeekday,
    this.calcVersion = kDefaultPayrollConfigCalcVersion,
    this.nightPremiumRate = kDefaultPayrollConfigNightPremiumRate,
    this.overtimePremiumRate = kDefaultPayrollConfigOvertimePremiumRate,
    this.over60PremiumRate = kDefaultPayrollConfigOver60PremiumRate,
    this.legalHolidayPremiumRate =
        kDefaultPayrollConfigLegalHolidayPremiumRate,
    this.roundingMethod = kDefaultPayrollConfigRoundingMethod,
    this.roundingPrecision = kDefaultPayrollConfigRoundingPrecision,
    this.schedulerNotificationHour =
        kDefaultPayrollConfigSchedulerNotificationHour,
    this.reminderStartDaysAfterPeriodEnd =
        kDefaultPayrollConfigReminderStartDaysAfterPeriodEnd,
  });

  factory PayrollConfigData.fromDefaults() => PayrollConfigData();

  factory PayrollConfigData.fromMap(
    Map<String, dynamic>? data, {
    void Function(List<String> fromConfig, List<String> fromDefaults)?
        onParseComplete,
  }) {
    if (data == null) return PayrollConfigData.fromDefaults();

    final fromConfig = <String>[];
    final fromDefaults = <String>[];

    int? parseInt(dynamic v) => v is int ? v : (v is num ? v.toInt() : null);
    double? parseDouble(dynamic v) => v is num ? v.toDouble() : null;
    bool? parseBool(dynamic v) => v is bool ? v : null;
    String? parseString(dynamic v) => v is String ? v : null;

    T pick<T>(String key, dynamic raw, T defaultVal, T? Function(dynamic) parse) {
      final parsed = parse(raw);
      if (parsed != null) {
        fromConfig.add(key);
        return parsed;
      }
      fromDefaults.add(key);
      return defaultVal;
    }

    // nullable fields need special handling
    String? paymentDate;
    if (data['paymentDate'] is String) {
      paymentDate = data['paymentDate'] as String;
      fromConfig.add('paymentDate');
    } else {
      paymentDate = kDefaultPayrollConfigPaymentDate;
      fromDefaults.add('paymentDate');
    }

    int? legalHolidayWeekday;
    if (data.containsKey('legalHolidayWeekday')) {
      final v = data['legalHolidayWeekday'];
      if (v == null) {
        legalHolidayWeekday = null;
        fromConfig.add('legalHolidayWeekday');
      } else if (v is num && v.toInt() >= 0 && v.toInt() <= 6) {
        legalHolidayWeekday = v.toInt();
        fromConfig.add('legalHolidayWeekday');
      } else {
        legalHolidayWeekday = kDefaultPayrollConfigLegalHolidayWeekday;
        fromDefaults.add('legalHolidayWeekday');
      }
    } else {
      legalHolidayWeekday = kDefaultPayrollConfigLegalHolidayWeekday;
      fromDefaults.add('legalHolidayWeekday');
    }

    final validRoundingMethods = ['ceil', 'floor', 'round'];
    String roundingMethod;
    final rmRaw = data['roundingMethod'];
    if (rmRaw is String && validRoundingMethods.contains(rmRaw)) {
      roundingMethod = rmRaw;
      fromConfig.add('roundingMethod');
    } else {
      roundingMethod = kDefaultPayrollConfigRoundingMethod;
      fromDefaults.add('roundingMethod');
    }

    final result = PayrollConfigData(
      paymentDate: paymentDate,
      bulkPaymentRegistrationEnabled: pick(
        'bulkPaymentRegistrationEnabled',
        data['bulkPaymentRegistrationEnabled'],
        kDefaultPayrollConfigBulkPaymentRegistrationEnabled,
        parseBool,
      ),
      maxCandidatesCount: pick(
        'maxCandidatesCount',
        data['maxCandidatesCount'],
        kDefaultPayrollConfigMaxCandidatesCount,
        parseInt,
      ),
      weekStartDay: pick(
        'weekStartDay',
        data['weekStartDay'],
        kDefaultPayrollConfigWeekStartDay,
        parseInt,
      ),
      weeklyLegalLimitMinutes: pick(
        'weeklyLegalLimitMinutes',
        data['weeklyLegalLimitMinutes'],
        kDefaultPayrollConfigWeeklyLegalLimitMinutes,
        parseInt,
      ),
      legalHolidayWeekday: legalHolidayWeekday,
      calcVersion: pick(
        'calcVersion',
        data['calcVersion'],
        kDefaultPayrollConfigCalcVersion,
        parseString,
      ),
      nightPremiumRate: pick(
        'nightPremiumRate',
        data['nightPremiumRate'],
        kDefaultPayrollConfigNightPremiumRate,
        parseDouble,
      ),
      overtimePremiumRate: pick(
        'overtimePremiumRate',
        data['overtimePremiumRate'],
        kDefaultPayrollConfigOvertimePremiumRate,
        parseDouble,
      ),
      over60PremiumRate: pick(
        'over60PremiumRate',
        data['over60PremiumRate'],
        kDefaultPayrollConfigOver60PremiumRate,
        parseDouble,
      ),
      legalHolidayPremiumRate: pick(
        'legalHolidayPremiumRate',
        data['legalHolidayPremiumRate'],
        kDefaultPayrollConfigLegalHolidayPremiumRate,
        parseDouble,
      ),
      roundingMethod: roundingMethod,
      roundingPrecision: pick(
        'roundingPrecision',
        data['roundingPrecision'],
        kDefaultPayrollConfigRoundingPrecision,
        parseInt,
      ),
      schedulerNotificationHour: pick(
        'schedulerNotificationHour',
        data['schedulerNotificationHour'],
        kDefaultPayrollConfigSchedulerNotificationHour,
        parseInt,
      ),
      reminderStartDaysAfterPeriodEnd: pick(
        'reminderStartDaysAfterPeriodEnd',
        data['reminderStartDaysAfterPeriodEnd'],
        kDefaultPayrollConfigReminderStartDaysAfterPeriodEnd,
        parseInt,
      ),
    );

    onParseComplete?.call(fromConfig..sort(), fromDefaults..sort());
    return result;
  }
}

/// storeMeta/payrollConfig を購読するシングルトンサービス
class PayrollConfigService {
  final _firestore = FirebaseFirestore.instance;
  final _streamController = StreamController<PayrollConfigData>.broadcast();
  StreamSubscription<DocumentSnapshot<Map<String, dynamic>>>? _subscription;

  PayrollConfigData? _latestData;

  static final PayrollConfigService _instance = PayrollConfigService._();
  static PayrollConfigService get instance => _instance;

  PayrollConfigService._() {
    _initializeListener();
  }

  void _initializeListener() {
    debugPrint('[storeMeta/payrollConfig] 購読開始（アプリ起動時）');
    _subscription = _firestore
        .collection('storeMeta')
        .doc('payrollConfig')
        .snapshots()
        .listen(
      (snapshot) {
        if (!snapshot.exists) {
          debugPrint(
            '[payrollConfig] document_missing → defaults にフォールバック',
          );
          final data = PayrollConfigData.fromDefaults();
          _latestData = data;
          _streamController.add(data);
          return;
        }
        final raw = snapshot.data();
        final data = PayrollConfigData.fromMap(
          raw,
          onParseComplete: (fromConfig, fromDefaults) {
            debugPrint(
              '[payroll_config_load_summary] fromConfig=$fromConfig | fromDefaults=$fromDefaults',
            );
          },
        );
        _latestData = data;
        _streamController.add(data);
        debugPrint('[storeMeta/payrollConfig] 取得完了（初回/更新）');
      },
      onError: (error) {
        debugPrint(
          '[PAYROLL_CONFIG_READ_ERROR] reason=read_error | message=$error',
        );
        if (_latestData != null) {
          _streamController.add(_latestData!);
        } else {
          debugPrint(
            '[payrollConfig] read_error_no_cache → defaults にフォールバック',
          );
          final data = PayrollConfigData.fromDefaults();
          _latestData = data;
          _streamController.add(data);
        }
      },
    );
  }

  /// 現在の storeMeta/payrollConfig の最新値
  PayrollConfigData? get latest => _latestData;

  /// storeMeta/payrollConfig の変更ストリーム
  Stream<PayrollConfigData> get stream => _streamController.stream;

  /// テスト用: 購読を停止する
  @visibleForTesting
  Future<void> dispose() async {
    await _subscription?.cancel();
    await _streamController.close();
  }
}
