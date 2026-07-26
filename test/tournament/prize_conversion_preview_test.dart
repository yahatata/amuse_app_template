import 'package:amuse_app_template/tournament/prize_conversion_preview.dart';
import 'package:amuse_app_template/user/point_conversion.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('prize_conversion_preview', () {
    test('pointA 1:1 は基準値と同額の付与予定', () {
      const c = BalanceConversion(referenceUnits: 1, balanceUnits: 1);
      expect(previewAwardedBalanceAmount(1000, c), 1000);
      expect(conversionErrorMessage(1000, c), isNull);
    });

    test('pointB 10:1 は基準値1000 → 100', () {
      const c = BalanceConversion(referenceUnits: 10, balanceUnits: 1);
      expect(previewAwardedBalanceAmount(1000, c), 100);
      expect(previewAwardedBalanceAmount(1005, c), isNull);
      expect(conversionErrorMessage(1005, c), isNotNull);
    });

    test('conversion null はエラー', () {
      expect(previewAwardedBalanceAmount(100, null), isNull);
      expect(conversionErrorMessage(100, null), isNotNull);
    });

    test('prizeConversionFromMainView を読む', () {
      final c = prizeConversionFromMainView({
        'prizeConversion': {'referenceUnits': 10, 'balanceUnits': 1},
      });
      expect(c?.referenceUnits, 10);
      expect(c?.balanceUnits, 1);
      expect(prizeConversionFromMainView({}), isNull);
    });
  });
}
