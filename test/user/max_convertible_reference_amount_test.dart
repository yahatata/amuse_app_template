import 'package:amuse_app_template/user/max_convertible_reference_amount.dart';
import 'package:amuse_app_template/user/point_conversion.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('1:1', () {
    final r = computeMaxConvertibleReferenceAmount(
      remainingReferenceAmount: 3000,
      availableBalance: 2500,
      conversion: const BalanceConversion(referenceUnits: 1, balanceUnits: 1),
      usageUnit: 1000,
    );
    expect(r.ok, isTrue);
    expect(r.referenceAmount, 2000);
    expect(r.balanceAmount, 2000);
  });

  test('残高1＝基準値10 usageUnit 100', () {
    final r = computeMaxConvertibleReferenceAmount(
      remainingReferenceAmount: 500,
      availableBalance: 50,
      conversion: const BalanceConversion(referenceUnits: 10, balanceUnits: 1),
      usageUnit: 100,
    );
    expect(r.ok, isTrue);
    expect(r.referenceAmount, 500);
    expect(r.balanceAmount, 50);
  });

  test('残高2＝基準値1', () {
    final r = computeMaxConvertibleReferenceAmount(
      remainingReferenceAmount: 100,
      availableBalance: 100,
      conversion: const BalanceConversion(referenceUnits: 1, balanceUnits: 2),
      usageUnit: 10,
    );
    expect(r.ok, isTrue);
    expect(r.referenceAmount, 50);
    expect(r.balanceAmount, 100);
  });

  test('正の充当額なし', () {
    final r = computeMaxConvertibleReferenceAmount(
      remainingReferenceAmount: 500,
      availableBalance: 10000,
      conversion: const BalanceConversion(referenceUnits: 1, balanceUnits: 1),
      usageUnit: 1000,
    );
    expect(r.ok, isFalse);
    expect(r.reason, MaxConvertibleReason.zeroAllocation);
  });

  test('大きな値でも高速', () {
    final sw = Stopwatch()..start();
    final r = computeMaxConvertibleReferenceAmount(
      remainingReferenceAmount: 1000000000,
      availableBalance: 1000000000,
      conversion: const BalanceConversion(referenceUnits: 1, balanceUnits: 1),
      usageUnit: 1,
    );
    sw.stop();
    expect(sw.elapsedMilliseconds, lessThan(50));
    expect(r.ok, isTrue);
  });
}
