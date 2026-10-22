/// A-7: sideGameChip の表示換算（支払正本と同じ conversion）
///
/// 正本: `billing.paymentPolicy.balancePaymentSettings.sideGameChip.conversion`
/// 旧 `billing.sideGameChipRate` は使わない。
library;

import 'package:amuse_app_template/services/store_config_service.dart';
import 'package:amuse_app_template/user/point_conversion.dart';
import 'package:amuse_app_template/user/point_ids.dart';
import 'package:amuse_app_template/user/validate_point_config.dart';
import 'package:intl/intl.dart';

BalanceConversion? sideGameChipConversionFromConfig([
  StoreConfigData? config,
]) {
  final data = config ?? StoreConfigService.instance.latestData;
  final raw = data?.balancePaymentSettings?[kSideGameChipId];
  if (raw is! Map) return null;
  final conversion = raw['conversion'];
  if (conversion is! Map) return null;
  final ru = conversion['referenceUnits'];
  final bu = conversion['balanceUnits'];
  final referenceUnits = ru is int
      ? ru
      : (ru is num && ru == ru.roundToDouble() ? ru.toInt() : null);
  final balanceUnits = bu is int
      ? bu
      : (bu is num && bu == bu.roundToDouble() ? bu.toInt() : null);
  if (referenceUnits == null ||
      balanceUnits == null ||
      referenceUnits <= 0 ||
      balanceUnits <= 0) {
    return null;
  }
  return BalanceConversion(
    referenceUnits: referenceUnits,
    balanceUnits: balanceUnits,
  );
}

BalanceConversion? sideGameChipConversionFromValidated(
  ValidatedPointConfig config,
) {
  return config.balancePaymentSettings[kSideGameChipId]?.conversion;
}

String _fmtYen(int amount) => NumberFormat('#,###').format(amount);

/// 残高枚数 → 「N枚 (¥相当)」表示。割り切れない／設定なしは隠蔽しない。
String formatSideGameChipBalanceDisplay(
  int chipBalance, {
  StoreConfigData? config,
  BalanceConversion? conversion,
}) {
  final conv = conversion ?? sideGameChipConversionFromConfig(config);
  if (conv == null) {
    return '$chipBalance枚（換算設定なし）';
  }
  final result = balanceToReferenceAmount(chipBalance, conv);
  if (!result.ok || result.amount == null) {
    return '$chipBalance枚（換算不可）';
  }
  return '$chipBalance枚 (¥${_fmtYen(result.amount!)}相当)';
}

/// 支払 ByCategory / ByAmount の基準値量（円相当）→ 「N枚 (¥…)」表示。
String formatSideGameChipPaymentFromReference(
  int referenceAmount, {
  StoreConfigData? config,
  BalanceConversion? conversion,
  String? methodLabel,
}) {
  final label = methodLabel ?? 'サイドゲームチップ';
  final conv = conversion ?? sideGameChipConversionFromConfig(config);
  if (conv == null) {
    return '$label ¥${_fmtYen(referenceAmount)}（換算設定なし）';
  }
  final result = referenceToBalanceAmount(referenceAmount, conv);
  if (!result.ok || result.amount == null) {
    return '$label ¥${_fmtYen(referenceAmount)}（枚数換算不可）';
  }
  return '$label ${result.amount}枚 (¥${_fmtYen(referenceAmount)}相当)';
}

/// 残高枚数 → 基準値量。失敗時 null。
int? sideGameChipBalanceToReferenceYen(
  int chipBalance, {
  StoreConfigData? config,
}) {
  final conv = sideGameChipConversionFromConfig(config);
  if (conv == null) return null;
  final result = balanceToReferenceAmount(chipBalance, conv);
  return result.ok ? result.amount : null;
}

/// 基準値量 → 残高枚数。失敗時 null。
int? sideGameChipReferenceToBalance(
  int referenceAmount, {
  StoreConfigData? config,
}) {
  final conv = sideGameChipConversionFromConfig(config);
  if (conv == null) return null;
  final result = referenceToBalanceAmount(referenceAmount, conv);
  return result.ok ? result.amount : null;
}
