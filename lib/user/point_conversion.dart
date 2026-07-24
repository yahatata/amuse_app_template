/// A-7: 整数比による基準値⇔残高換算（Functions と同一仕様）
library;

const int kMaxSafeInteger = 9007199254740991; // 2^53 - 1

class BalanceConversion {
  final int referenceUnits;
  final int balanceUnits;

  const BalanceConversion({
    required this.referenceUnits,
    required this.balanceUnits,
  });
}

enum ConversionErrorKey {
  conversionNotInteger,
  conversionOverflow,
  invalidArgument,
}

class ConversionResult {
  final bool ok;
  final int? amount;
  final ConversionErrorKey? errorKey;
  final String? message;

  const ConversionResult._({
    required this.ok,
    this.amount,
    this.errorKey,
    this.message,
  });

  factory ConversionResult.success(int amount) =>
      ConversionResult._(ok: true, amount: amount);

  factory ConversionResult.failure(
    ConversionErrorKey errorKey,
    String message,
  ) =>
      ConversionResult._(ok: false, errorKey: errorKey, message: message);
}

bool _isNonNegativeInteger(int? n) => n != null && n >= 0;

bool _isPositiveInteger(int? n) => n != null && n > 0;

/// 中間積が安全整数か確認して乗算する。不可なら null。
int? safeMultiply(int a, int b) {
  if (a == 0 || b == 0) return 0;
  if (a > kMaxSafeInteger ~/ b) return null;
  return a * b;
}

ConversionResult? _validateUnits(BalanceConversion conversion) {
  if (!_isPositiveInteger(conversion.referenceUnits) ||
      !_isPositiveInteger(conversion.balanceUnits)) {
    return ConversionResult.failure(
      ConversionErrorKey.invalidArgument,
      '換算 unit は正の整数である必要があります',
    );
  }
  if (conversion.referenceUnits > kMaxSafeInteger ||
      conversion.balanceUnits > kMaxSafeInteger) {
    return ConversionResult.failure(
      ConversionErrorKey.conversionOverflow,
      '換算 unit が安全整数を超えています',
    );
  }
  return null;
}

/// 基準値量 → 残高量
ConversionResult referenceToBalanceAmount(
  int referenceAmount,
  BalanceConversion conversion,
) {
  final unitsError = _validateUnits(conversion);
  if (unitsError != null) return unitsError;
  if (!_isNonNegativeInteger(referenceAmount)) {
    return ConversionResult.failure(
      ConversionErrorKey.invalidArgument,
      '基準値量は非負整数である必要があります',
    );
  }

  final product = safeMultiply(referenceAmount, conversion.balanceUnits);
  if (product == null) {
    return ConversionResult.failure(
      ConversionErrorKey.conversionOverflow,
      '換算の中間積が安全整数を超えます',
    );
  }
  if (product % conversion.referenceUnits != 0) {
    return ConversionResult.failure(
      ConversionErrorKey.conversionNotInteger,
      '基準値から残高への換算が整数になりません',
    );
  }
  return ConversionResult.success(product ~/ conversion.referenceUnits);
}

/// 残高量 → 基準値量
ConversionResult balanceToReferenceAmount(
  int balanceAmount,
  BalanceConversion conversion,
) {
  final unitsError = _validateUnits(conversion);
  if (unitsError != null) return unitsError;
  if (!_isNonNegativeInteger(balanceAmount)) {
    return ConversionResult.failure(
      ConversionErrorKey.invalidArgument,
      '残高量は非負整数である必要があります',
    );
  }

  final product = safeMultiply(balanceAmount, conversion.referenceUnits);
  if (product == null) {
    return ConversionResult.failure(
      ConversionErrorKey.conversionOverflow,
      '換算の中間積が安全整数を超えます',
    );
  }
  if (product % conversion.balanceUnits != 0) {
    return ConversionResult.failure(
      ConversionErrorKey.conversionNotInteger,
      '残高から基準値への換算が整数になりません',
    );
  }
  return ConversionResult.success(product ~/ conversion.balanceUnits);
}

int gcd(int a, int b) {
  var x = a.abs();
  var y = b.abs();
  while (y != 0) {
    final t = y;
    y = x % y;
    x = t;
  }
  return x;
}
