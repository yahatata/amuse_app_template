/// A-7: 自動充当用・最大基準値充当額（O(1)、Functions と同一仕様）
library;

import 'point_conversion.dart';

enum MaxConvertibleReason {
  invalidInput,
  overflow,
  zeroAllocation,
}

class MaxConvertibleResult {
  final bool ok;
  final int referenceAmount;
  final int balanceAmount;
  final MaxConvertibleReason? reason;
  final String? message;

  const MaxConvertibleResult._({
    required this.ok,
    required this.referenceAmount,
    required this.balanceAmount,
    this.reason,
    this.message,
  });

  factory MaxConvertibleResult.success({
    required int referenceAmount,
    required int balanceAmount,
  }) =>
      MaxConvertibleResult._(
        ok: true,
        referenceAmount: referenceAmount,
        balanceAmount: balanceAmount,
      );

  factory MaxConvertibleResult.failure({
    required MaxConvertibleReason reason,
    required String message,
  }) =>
      MaxConvertibleResult._(
        ok: false,
        referenceAmount: 0,
        balanceAmount: 0,
        reason: reason,
        message: message,
      );
}

/// changeSpec §9.2 の最大額計算。
MaxConvertibleResult computeMaxConvertibleReferenceAmount({
  required int remainingReferenceAmount,
  required int availableBalance,
  required BalanceConversion conversion,
  required int usageUnit,
}) {
  final r = remainingReferenceAmount;
  final b = availableBalance;
  final u = usageUnit;
  final refU = conversion.referenceUnits;
  final balU = conversion.balanceUnits;

  if (r < 0 || b < 0 || u <= 0 || refU <= 0 || balU <= 0) {
    return MaxConvertibleResult.failure(
      reason: MaxConvertibleReason.invalidInput,
      message: '自動充当入力が不正です',
    );
  }
  if (u > kMaxSafeInteger ||
      refU > kMaxSafeInteger ||
      balU > kMaxSafeInteger) {
    return MaxConvertibleResult.failure(
      reason: MaxConvertibleReason.overflow,
      message: 'unit が安全整数を超えています',
    );
  }

  final uTimesBal = safeMultiply(u, balU);
  if (uTimesBal == null) {
    return MaxConvertibleResult.failure(
      reason: MaxConvertibleReason.overflow,
      message: 'U × balanceUnits が安全整数を超えます',
    );
  }

  final g = gcd(uTimesBal, refU);
  final stepK = refU ~/ g;
  if (stepK <= 0) {
    return MaxConvertibleResult.failure(
      reason: MaxConvertibleReason.invalidInput,
      message: 'stepK を計算できません',
    );
  }

  final kMaxByRemain = r ~/ u;
  final balTimesRef = safeMultiply(b, refU);
  if (balTimesRef == null) {
    return MaxConvertibleResult.failure(
      reason: MaxConvertibleReason.overflow,
      message: 'B × referenceUnits が安全整数を超えます',
    );
  }
  final kMaxByBal = balTimesRef ~/ uTimesBal;
  final kMax = kMaxByRemain < kMaxByBal ? kMaxByRemain : kMaxByBal;
  final k = (kMax ~/ stepK) * stepK;

  if (k <= 0) {
    return MaxConvertibleResult.failure(
      reason: MaxConvertibleReason.zeroAllocation,
      message: '正の充当額がありません',
    );
  }

  final referenceUse = safeMultiply(k, u);
  if (referenceUse == null) {
    return MaxConvertibleResult.failure(
      reason: MaxConvertibleReason.overflow,
      message: 'k × usageUnit が安全整数を超えます',
    );
  }

  final refTimesBal = safeMultiply(referenceUse, balU);
  if (refTimesBal == null) {
    return MaxConvertibleResult.failure(
      reason: MaxConvertibleReason.overflow,
      message: 'referenceUse × balanceUnits が安全整数を超えます',
    );
  }
  if (refTimesBal % refU != 0) {
    return MaxConvertibleResult.failure(
      reason: MaxConvertibleReason.zeroAllocation,
      message: '残高換算が整数になりません',
    );
  }

  return MaxConvertibleResult.success(
    referenceAmount: referenceUse,
    balanceAmount: refTimesBal ~/ refU,
  );
}
