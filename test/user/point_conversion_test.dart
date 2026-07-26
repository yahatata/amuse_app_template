import 'package:amuse_app_template/user/point_conversion.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('1:1', () {
    const c = BalanceConversion(referenceUnits: 1, balanceUnits: 1);
    expect(referenceToBalanceAmount(1000, c).amount, 1000);
    expect(balanceToReferenceAmount(1000, c).amount, 1000);
  });

  test('残高1＝基準値10', () {
    const c = BalanceConversion(referenceUnits: 10, balanceUnits: 1);
    expect(referenceToBalanceAmount(100, c).amount, 10);
    expect(balanceToReferenceAmount(10, c).amount, 100);
  });

  test('残高2＝基準値1', () {
    const c = BalanceConversion(referenceUnits: 1, balanceUnits: 2);
    expect(referenceToBalanceAmount(5, c).amount, 10);
  });

  test('割り切れない', () {
    const c = BalanceConversion(referenceUnits: 10, balanceUnits: 1);
    final r = referenceToBalanceAmount(15, c);
    expect(r.ok, isFalse);
    expect(r.errorKey, ConversionErrorKey.conversionNotInteger);
  });

  test('未約分比率', () {
    const c = BalanceConversion(referenceUnits: 20, balanceUnits: 2);
    expect(referenceToBalanceAmount(100, c).amount, 10);
  });

  test('overflow', () {
    const c = BalanceConversion(referenceUnits: 1, balanceUnits: 2);
    final r = referenceToBalanceAmount(kMaxSafeInteger, c);
    expect(r.ok, isFalse);
    expect(r.errorKey, ConversionErrorKey.conversionOverflow);
  });
}
