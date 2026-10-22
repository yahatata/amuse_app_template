import 'package:amuse_app_template/services/store_config_service.dart';
import 'package:amuse_app_template/user/point_conversion.dart';
import 'package:amuse_app_template/user/side_game_chip_display.dart';
import 'package:flutter_test/flutter_test.dart';

StoreConfigData _chipConfig({required int referenceUnits, required int balanceUnits}) {
  return StoreConfigData(
    balancePaymentSettings: {
      'sideGameChip': {
        'conversion': {
          'referenceUnits': referenceUnits,
          'balanceUnits': balanceUnits,
        },
      },
    },
  );
}

void main() {
  group('formatSideGameChipPaymentFromReference', () {
    test('1:1 conversion', () {
      const conv = BalanceConversion(referenceUnits: 1, balanceUnits: 1);
      expect(
        formatSideGameChipPaymentFromReference(500, conversion: conv),
        'サイドゲームチップ 500枚 (¥500相当)',
      );
    });

    test('10:1 (¥10 per chip)', () {
      const conv = BalanceConversion(referenceUnits: 10, balanceUnits: 1);
      expect(
        formatSideGameChipPaymentFromReference(100, conversion: conv),
        'サイドゲームチップ 10枚 (¥100相当)',
      );
    });
  });

  group('formatSideGameChipBalanceDisplay', () {
    test('1:1 conversion', () {
      const conv = BalanceConversion(referenceUnits: 1, balanceUnits: 1);
      expect(
        formatSideGameChipBalanceDisplay(42, conversion: conv),
        '42枚 (¥42相当)',
      );
    });

    test('10:1 (¥10 per chip)', () {
      const conv = BalanceConversion(referenceUnits: 10, balanceUnits: 1);
      expect(
        formatSideGameChipBalanceDisplay(10, conversion: conv),
        '10枚 (¥100相当)',
      );
    });
  });

  group('sideGameChipBalanceToReferenceYen / sideGameChipReferenceToBalance', () {
    test('1:1', () {
      final config = _chipConfig(referenceUnits: 1, balanceUnits: 1);
      expect(sideGameChipBalanceToReferenceYen(7, config: config), 7);
      expect(sideGameChipReferenceToBalance(7, config: config), 7);
    });

    test('10:1', () {
      final config = _chipConfig(referenceUnits: 10, balanceUnits: 1);
      expect(sideGameChipBalanceToReferenceYen(3, config: config), 30);
      expect(sideGameChipReferenceToBalance(30, config: config), 3);
    });
  });
}
