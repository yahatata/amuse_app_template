/// A-7: ポイント/残高の最大利用可能額（基準値量）計算・表示用ヘルパー。
///
/// 旧 sideGameChipRate / pointABRoundingUnit / sideGameChipRoundingUnit は
/// 計算の正本として使わない（changeSpec `docs/残タスク_0623/カテゴリA_システム構築/A-7_ポイントタイプ変更/changeSpec.md`）。
/// 実計算は Functions `a7PaymentSplit.ts` と同一仕様の
/// `computeMaxConvertibleReferenceAmount`（`lib/user/max_convertible_reference_amount.dart`）に委譲する。
library;

import 'package:amuse_app_template/user/max_convertible_reference_amount.dart';
import 'package:amuse_app_template/user/validate_point_config.dart';

/// [method] の usageUnit + 整数比換算による、カテゴリ内で使用できる最大基準値量。
/// 換算が不可能（設定欠落・整数比が合わない等）な場合は 0 を返す。
int computeMaxUsableReferenceAmount({
  required int categoryAmountReference,
  required int availableBalance,
  required BalancePaymentSetting? setting,
}) {
  if (categoryAmountReference <= 0 || setting == null) return 0;

  final result = computeMaxConvertibleReferenceAmount(
    remainingReferenceAmount: categoryAmountReference,
    availableBalance: availableBalance,
    conversion: setting.conversion,
    usageUnit: setting.usageUnit,
  );
  if (!result.ok) return 0;
  return result.referenceAmount;
}

/// 表示専用: 残高全体を基準値量に換算した概算値。
/// 整数比が合わない場合は切り捨てる（計算の正本ではなく、残高表示にのみ使う）。
int approxBalanceAsReferenceAmount(int balance, BalancePaymentSetting? setting) {
  if (balance <= 0 || setting == null) return 0;
  final conversion = setting.conversion;
  if (conversion.balanceUnits <= 0) return 0;
  final product = balance * conversion.referenceUnits;
  return product ~/ conversion.balanceUnits;
}

/// 不足分ダイアログ等で表示する利用単位のヒント文。
String usageUnitHint(String methodDisplayName, BalancePaymentSetting? setting) {
  if (setting == null) return '';
  return '$methodDisplayNameは${setting.usageUnit}円単位で使用できます';
}
