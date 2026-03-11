/// Phase2 移行検証テスト（Flutter側）
///
/// StoreConfigData.fromMap が全フィールドを正しくパース・フォールバックすることを検証。
/// Phase2 で GlobalConstants → StoreConfigService に切り替えた全設定項目が対象。
///
/// 参照: docs/config_migration/phase2/ALL_ID_STATUS.md

import 'package:flutter_test/flutter_test.dart';

import 'package:amuse_app_template/services/store_config_defaults.dart';
import 'package:amuse_app_template/services/store_config_service.dart';

void main() {
  // ===================================================================
  // 1. fromDefaults: 全フィールドがデフォルト値で埋まること
  // ===================================================================
  group('fromDefaults: 全フィールド網羅', () {
    final config = StoreConfigData.fromDefaults();

    test('features フラグ', () {
      expect(config.dualWriteEnabled, kDefaultDualWriteEnabled);
      expect(config.enqueueSchedulerEnabled, kDefaultEnqueueSchedulerEnabled);
      expect(config.templateBusinessDateCheck, kDefaultTemplateBusinessDateCheck);
      expect(config.settlementAggregatorEnabled, kDefaultSettlementAggregatorEnabled);
      expect(config.tableDeviceRegistrationEnabled, kDefaultTableDeviceRegistrationEnabled);
    });

    test('autoOpenClose', () {
      expect(config.autoOpenCloseEnabled, kDefaultAutoOpenCloseEnabled);
      expect(config.taskCloseOffsetMinutes, kDefaultTaskCloseOffsetMinutes);
      expect(config.taskOpenOffsetMinutes, kDefaultTaskOpenOffsetMinutes);
    });

    test('businessDay', () {
      expect(config.calcBufferMinutes, kDefaultCalcBufferMinutes);
    });

    test('billing (R-06)', () {
      expect(config.entranceFee, kDefaultEntranceFee);
      expect(config.entranceFeeDescription, kDefaultEntranceFeeDescription);
      expect(config.chargeEntranceFeeOnReentry, kDefaultChargeEntranceFeeOnReentry);
    });

    test('billing (R-11/R-12)', () {
      expect(config.sideGameChipRate, kDefaultSideGameChipRate);
      expect(config.categoryPaymentMethods, kDefaultCategoryPaymentMethods);
      expect(config.pointPriority, kDefaultPointPriority);
      expect(config.pointABRoundingUnit, kDefaultPointABRoundingUnit);
      expect(config.sideGameChipRoundingUnit, kDefaultSideGameChipRoundingUnit);
    });

    test('businessHoursStyles (R-10)', () {
      expect(config.businessHoursStyles.containsKey('weekday'), true);
      expect(config.businessHoursStyles.containsKey('closed'), true);
      expect(config.businessHoursStyles['weekday']!['openMinute'], 900);
      expect(config.businessHoursStyles['closed']!['isClosed'], true);
    });

    test('linePlan (D-04)', () {
      expect(config.linePlan, kDefaultLinePlan);
    });

    test('shift (R-08)', () {
      expect(config.shiftSubmissionStartDay, kDefaultShiftSubmissionStartDay);
      expect(config.shiftSubmissionEndDay, kDefaultShiftSubmissionEndDay);
      expect(config.shiftSchedulingStartDay, kDefaultShiftSchedulingStartDay);
    });

    test('payroll (R-07)', () {
      expect(config.payrollStartDay, kDefaultPayrollStartDay);
      expect(config.payrollEndDay, kDefaultPayrollEndDay);
    });
  });

  // ===================================================================
  // 2. fromMap(null / empty): デフォルトにフォールバック
  // ===================================================================
  group('fromMap: null/empty', () {
    test('null → デフォルト', () {
      final config = StoreConfigData.fromMap(null);
      expect(config.entranceFee, kDefaultEntranceFee);
      expect(config.linePlan, kDefaultLinePlan);
      expect(config.dualWriteEnabled, kDefaultDualWriteEnabled);
    });

    test('空 Map → デフォルト', () {
      final config = StoreConfigData.fromMap({});
      expect(config.sideGameChipRate, kDefaultSideGameChipRate);
      expect(config.payrollStartDay, kDefaultPayrollStartDay);
    });
  });

  // ===================================================================
  // 3. fromMap: Firestore 値で上書き
  // ===================================================================
  group('fromMap: Firestore 値上書き', () {
    test('features フラグ上書き', () {
      final config = StoreConfigData.fromMap({
        'features': {
          'dualWriteEnabled': true,
          'enqueueSchedulerEnabled': true,
          'settlementAggregatorEnabled': false,
        },
      });
      expect(config.dualWriteEnabled, true);
      expect(config.enqueueSchedulerEnabled, true);
      expect(config.settlementAggregatorEnabled, false);
      expect(config.templateBusinessDateCheck, kDefaultTemplateBusinessDateCheck);
    });

    test('autoOpenClose 上書き', () {
      final config = StoreConfigData.fromMap({
        'autoOpenClose': {
          'enabled': false,
          'taskCloseOffsetMinutes': 60,
          'taskOpenOffsetMinutes': -10,
        },
      });
      expect(config.autoOpenCloseEnabled, false);
      expect(config.taskCloseOffsetMinutes, 60);
      expect(config.taskOpenOffsetMinutes, -10);
    });

    test('billing 系部分上書き', () {
      final config = StoreConfigData.fromMap({
        'billing': {
          'entranceFee': 2000,
          'entranceFeeDescription': 'テスト入場料',
          'chargeEntranceFeeOnReentry': true,
          'sideGameChipRate': 25.0,
        },
      });
      expect(config.entranceFee, 2000);
      expect(config.entranceFeeDescription, 'テスト入場料');
      expect(config.chargeEntranceFeeOnReentry, true);
      expect(config.sideGameChipRate, 25.0);
    });

    test('billing.paymentPolicy 上書き', () {
      final config = StoreConfigData.fromMap({
        'billing': {
          'paymentPolicy': {
            'categoryPaymentMethods': {
              'extraCost': ['cash'],
              'items': ['cash', 'credit_card'],
            },
            'pointPriority': ['pointB', 'pointA'],
            'roundingUnits': {'pointAB': 500, 'sideGameChip': 50},
          },
        },
      });
      expect(config.categoryPaymentMethods['extraCost'], ['cash']);
      expect(config.pointPriority, ['pointB', 'pointA']);
      expect(config.pointABRoundingUnit, 500);
      expect(config.sideGameChipRoundingUnit, 50);
    });

    test('linePlan 有効値上書き', () {
      final config = StoreConfigData.fromMap({'linePlan': 'standard'});
      expect(config.linePlan, 'standard');
    });

    test('linePlan 無効値 → デフォルト', () {
      final config = StoreConfigData.fromMap({'linePlan': 'invalid'});
      expect(config.linePlan, kDefaultLinePlan);
    });

    test('shift 系上書き', () {
      final config = StoreConfigData.fromMap({
        'shift': {
          'submissionStartDay': 5,
          'submissionEndDay': 20,
          'schedulingStartDay': 21,
        },
      });
      expect(config.shiftSubmissionStartDay, 5);
      expect(config.shiftSubmissionEndDay, 20);
      expect(config.shiftSchedulingStartDay, 21);
    });

    test('payroll 系上書き', () {
      final config = StoreConfigData.fromMap({
        'payroll': {'startDay': 1, 'endDay': 31},
      });
      expect(config.payrollStartDay, 1);
      expect(config.payrollEndDay, 31);
    });

    test('businessDay.calcBufferMinutes 上書き', () {
      final config = StoreConfigData.fromMap({
        'businessDay': {'calcBufferMinutes': 120},
      });
      expect(config.calcBufferMinutes, 120);
    });

    test('businessHoursStyles 上書き', () {
      final config = StoreConfigData.fromMap({
        'businessHoursStyles': {
          'weekday': {
            'styleId': 'weekday',
            'openMinute': 600,
            'closeMinute': 1440,
            'isClosed': false,
          },
          'closed': {
            'styleId': 'closed',
            'openMinute': 0,
            'closeMinute': 0,
            'isClosed': true,
          },
        },
      });
      expect(config.businessHoursStyles['weekday']!['openMinute'], 600);
      expect(config.businessHoursStyles['closed']!['isClosed'], true);
    });
  });

  // ===================================================================
  // 4. fromMap: 不正な型 → デフォルトにフォールバック
  // ===================================================================
  group('fromMap: 不正な型のフォールバック', () {
    test('entranceFee が文字列 → デフォルト', () {
      final config = StoreConfigData.fromMap({
        'billing': {'entranceFee': 'not_a_number'},
      });
      expect(config.entranceFee, kDefaultEntranceFee);
    });

    test('autoOpenClose.enabled が文字列 → デフォルト', () {
      final config = StoreConfigData.fromMap({
        'autoOpenClose': {'enabled': 'yes'},
      });
      expect(config.autoOpenCloseEnabled, kDefaultAutoOpenCloseEnabled);
    });

    test('sideGameChipRate が null → デフォルト', () {
      final config = StoreConfigData.fromMap({
        'billing': {'sideGameChipRate': null},
      });
      expect(config.sideGameChipRate, kDefaultSideGameChipRate);
    });

    test('businessHoursStyles 不正構造 → デフォルト', () {
      final config = StoreConfigData.fromMap({
        'businessHoursStyles': 'not_a_map',
      });
      expect(config.businessHoursStyles.containsKey('weekday'), true);
      expect(config.businessHoursStyles['weekday']!['openMinute'], 900);
    });
  });

  // ===================================================================
  // 5. getBusinessHoursByStyleId
  // ===================================================================
  group('getBusinessHoursByStyleId', () {
    test('存在する styleId → 正しい値', () {
      final config = StoreConfigData.fromDefaults();
      final style = config.getBusinessHoursByStyleId('weekday');
      expect(style, isNotNull);
      expect(style!['styleId'], 'weekday');
      expect(style['openMinute'], 900);
    });

    test('存在しない styleId → null', () {
      final config = StoreConfigData.fromDefaults();
      final style = config.getBusinessHoursByStyleId('nonexistent');
      expect(style, isNull);
    });
  });

  // ===================================================================
  // 6. 全フィールド上書き同時テスト
  // ===================================================================
  test('全フィールド同時上書き', () {
    final config = StoreConfigData.fromMap({
      'features': {
        'dualWriteEnabled': true,
        'enqueueSchedulerEnabled': true,
        'templateBusinessDateCheck': true,
        'settlementAggregatorEnabled': false,
        'tableDeviceRegistrationEnabled': false,
      },
      'autoOpenClose': {
        'enabled': false,
        'taskCloseOffsetMinutes': 90,
        'taskOpenOffsetMinutes': -15,
      },
      'businessDay': {'calcBufferMinutes': 30},
      'billing': {
        'entranceFee': 0,
        'entranceFeeDescription': '無料',
        'chargeEntranceFeeOnReentry': true,
        'sideGameChipRate': 5.0,
        'paymentPolicy': {
          'categoryPaymentMethods': {
            'extraCost': ['cash'],
            'sideGameChip': ['cash'],
            'items': ['cash'],
            'tournaments': ['cash'],
          },
          'pointPriority': ['pointB'],
          'roundingUnits': {'pointAB': 100, 'sideGameChip': 10},
        },
      },
      'businessHoursStyles': {
        'weekday': {
          'styleId': 'weekday',
          'openMinute': 480,
          'closeMinute': 1200,
          'isClosed': false,
        },
      },
      'linePlan': 'light',
      'shift': {
        'submissionStartDay': 3,
        'submissionEndDay': 18,
        'schedulingStartDay': 19,
      },
      'payroll': {'startDay': 1, 'endDay': 28},
    });

    expect(config.dualWriteEnabled, true);
    expect(config.settlementAggregatorEnabled, false);
    expect(config.autoOpenCloseEnabled, false);
    expect(config.taskCloseOffsetMinutes, 90);
    expect(config.calcBufferMinutes, 30);
    expect(config.entranceFee, 0);
    expect(config.entranceFeeDescription, '無料');
    expect(config.chargeEntranceFeeOnReentry, true);
    expect(config.sideGameChipRate, 5.0);
    expect(config.categoryPaymentMethods['extraCost'], ['cash']);
    expect(config.pointPriority, ['pointB']);
    expect(config.pointABRoundingUnit, 100);
    expect(config.sideGameChipRoundingUnit, 10);
    expect(config.businessHoursStyles['weekday']!['openMinute'], 480);
    expect(config.linePlan, 'light');
    expect(config.shiftSubmissionStartDay, 3);
    expect(config.payrollStartDay, 1);
    expect(config.payrollEndDay, 28);
  });
}
