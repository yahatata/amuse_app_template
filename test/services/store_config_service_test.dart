/// StoreConfigData の単体テスト
///
/// 参照: docs/config_migration/phase1/PHASE1_FALLBACK_BEHAVIOR.md
/// StoreConfigService は Firestore に依存するため、StoreConfigData.fromMap / fromDefaults のみテスト

import 'package:flutter_test/flutter_test.dart';

import 'package:amuse_app_template/services/store_config_defaults.dart';
import 'package:amuse_app_template/services/store_config_service.dart';

void main() {
  group('StoreConfigData', () {
    test('fromDefaults でデフォルト値を返す', () {
      final config = StoreConfigData.fromDefaults();
      expect(config.entranceFee, kDefaultEntranceFee);
      expect(config.entranceFeeDescription, kDefaultEntranceFeeDescription);
      expect(config.chargeEntranceFeeOnReentry, kDefaultChargeEntranceFeeOnReentry);
      expect(config.autoOpenCloseEnabled, kDefaultAutoOpenCloseEnabled);
      expect(config.linePlan, kDefaultLinePlan);
      expect(config.payrollStartDay, kDefaultPayrollStartDay);
      expect(config.payrollEndDay, kDefaultPayrollEndDay);
    });

    test('fromMap(null) でデフォルトを返す', () {
      final config = StoreConfigData.fromMap(null);
      expect(config.entranceFee, kDefaultEntranceFee);
    });

    test('fromMap(空) でデフォルトを返す', () {
      final config = StoreConfigData.fromMap({});
      expect(config.entranceFee, kDefaultEntranceFee);
    });

    test('fromMap で Firestore の値で上書きできる', () {
      final config = StoreConfigData.fromMap({
        'billing': {'entranceFee': 2000, 'entranceFeeDescription': '入場料'},
        'autoOpenClose': {'enabled': false},
        'linePlan': 'light',
      });
      expect(config.entranceFee, 2000);
      expect(config.entranceFeeDescription, '入場料');
      expect(config.autoOpenCloseEnabled, false);
      expect(config.linePlan, 'light');
    });
  });
}
