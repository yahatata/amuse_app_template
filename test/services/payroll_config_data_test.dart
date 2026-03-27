import 'package:amuse_app_template/services/payroll_config_service.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('PayrollConfigData.fromMap', () {
    test('新フィールドをそのまま読み込む', () {
      final data = PayrollConfigData.fromMap({
        'paymentDayOfMonth': '25',
        'paymentMonthOffset': 0,
      });

      expect(data.paymentDayOfMonth, '25');
      expect(data.paymentMonthOffset, 0);
    });

    test('旧 paymentDate を paymentDayOfMonth に読み替える', () {
      final data = PayrollConfigData.fromMap({
        'paymentDate': '2026-04-25',
      });

      expect(data.paymentDayOfMonth, '25');
      expect(data.paymentMonthOffset, 1);
    });

    test('0 はそのまま保持する', () {
      final data = PayrollConfigData.fromMap({
        'paymentDate': '0',
      });

      expect(data.paymentDayOfMonth, '0');
    });

    test('無効な paymentMonthOffset はデフォルトへフォールバック', () {
      final data = PayrollConfigData.fromMap({
        'paymentDayOfMonth': '25',
        'paymentMonthOffset': 3,
      });

      expect(data.paymentMonthOffset, 1);
    });

    test('無効な paymentDayOfMonth は null にフォールバック', () {
      final data = PayrollConfigData.fromMap({
        'paymentDayOfMonth': '99',
      });

      expect(data.paymentDayOfMonth, isNull);
    });
  });
}
