import 'package:amuse_app_template/services/store_config_defaults.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('getDefaultPrizeDistributionForCount', () {
    test('11人入賞は暫定比率表を返す', () {
      final ratios = getDefaultPrizeDistributionForCount(11);

      expect(ratios, [29.0, 18.0, 12.0, 8.0, 7.0, 6.0, 5.0, 4.0, 4.0, 4.0, 3.0]);
      expect(ratios.length, 11);
      expect(ratios.fold<double>(0, (sum, value) => sum + value), 100.0);
    });

    test('25人入賞は暫定比率表を返す', () {
      final ratios = getDefaultPrizeDistributionForCount(25);

      expect(ratios.first, 13.0);
      expect(ratios.last, 1.0);
      expect(ratios.length, 25);
      expect(ratios.fold<double>(0, (sum, value) => sum + value), 100.0);
    });

    test('30人入賞は暫定比率表を返す', () {
      final ratios = getDefaultPrizeDistributionForCount(30);

      expect(ratios.first, 11.0);
      expect(ratios.length, 30);
      expect(ratios.fold<double>(0, (sum, value) => sum + value), 100.0);
    });

    test('31人入賞は均等配分にフォールバックする', () {
      final ratios = getDefaultPrizeDistributionForCount(31);

      expect(ratios, List.filled(31, 100.0 / 31));
      expect(ratios.fold<double>(0, (sum, value) => sum + value), closeTo(100.0, 0.0001));
    });

    test('1〜30人入賞は定義件数と順位数が一致し合計100%', () {
      for (var count = 1; count <= 30; count++) {
        final ratios = getDefaultPrizeDistributionForCount(count);

        expect(ratios.length, count, reason: '$count人入賞');
        expect(
          ratios.fold<double>(0, (sum, value) => sum + value),
          100.0,
          reason: '$count人入賞',
        );
      }
    });
  });
}
