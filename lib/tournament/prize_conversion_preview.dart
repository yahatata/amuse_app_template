/// トーナメント順位報酬: 基準値→残高のプレビュー用ヘルパ
library;

import 'package:amuse_app_template/services/store_config_service.dart';
import 'package:amuse_app_template/tournament/ranking_reward_point_candidates.dart';
import 'package:amuse_app_template/user/point_conversion.dart';
import 'package:amuse_app_template/user/point_ids.dart';

BalanceConversion? prizeConversionForPointType(
  String pointType, [
  StoreConfigData? config,
]) {
  if (!isCurrencyPointId(pointType)) return null;
  final data = config ?? StoreConfigService.instance.latestData;
  final raw = data?.balancePaymentSettings?[pointType];
  if (raw is! Map) return null;
  final conversionRaw = raw['conversion'];
  if (conversionRaw is! Map) return null;
  final ref = conversionRaw['referenceUnits'];
  final bal = conversionRaw['balanceUnits'];
  final refInt = ref is int ? ref : (ref is num ? ref.toInt() : null);
  final balInt = bal is int ? bal : (bal is num ? bal.toInt() : null);
  if (refInt == null || balInt == null || refInt <= 0 || balInt <= 0) {
    return null;
  }
  return BalanceConversion(referenceUnits: refInt, balanceUnits: balInt);
}

BalanceConversion? prizeConversionFromMainView(Map<String, dynamic>? mainView) {
  final raw = mainView?['prizeConversion'];
  if (raw is! Map) return null;
  final ref = raw['referenceUnits'];
  final bal = raw['balanceUnits'];
  final refInt = ref is int ? ref : (ref is num ? ref.toInt() : null);
  final balInt = bal is int ? bal : (bal is num ? bal.toInt() : null);
  if (refInt == null || balInt == null || refInt <= 0 || balInt <= 0) {
    return null;
  }
  return BalanceConversion(referenceUnits: refInt, balanceUnits: balInt);
}

String rewardPointDisplayName(
  String pointType, [
  StoreConfigData? config,
]) {
  for (final c in rankingRewardPointCandidates(config)) {
    if (c.id == pointType) return c.displayName;
  }
  final data = config ?? StoreConfigService.instance.latestData;
  final slot = data?.pointSettings?[pointType];
  if (slot is Map && slot['displayName'] is String) {
    return slot['displayName'] as String;
  }
  return pointType;
}

/// 基準値量が整数残高へ換算できる場合はその残高量。不可なら null。
int? previewAwardedBalanceAmount(
  int prizeReferenceAmount,
  BalanceConversion? conversion,
) {
  if (conversion == null) return null;
  final result = referenceToBalanceAmount(prizeReferenceAmount, conversion);
  return result.ok ? result.amount : null;
}

String? conversionErrorMessage(
  int prizeReferenceAmount,
  BalanceConversion? conversion,
) {
  if (conversion == null) {
    return '選択ポイントの換算設定がありません';
  }
  final result = referenceToBalanceAmount(prizeReferenceAmount, conversion);
  if (result.ok) return null;
  return result.message ?? '換算できません';
}
