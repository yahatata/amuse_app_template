import 'package:amuse_app_template/services/store_config_defaults.dart';
import 'package:amuse_app_template/services/store_config_service.dart';

/// ポイント/チップの丸め単位を適用した最大使用可能額（円）
int computeMaxRoundedPointYen({
  required String method,
  required int categoryAmountYen,
  required int balance,
  required int chipRate,
  int? pointABRoundingUnit,
  int? sideGameChipRoundingUnit,
}) {
  if (categoryAmountYen <= 0) return 0;

  final pointUnit =
      pointABRoundingUnit ??
      StoreConfigService.instance.latestData?.pointABRoundingUnit ??
      kDefaultPointABRoundingUnit;
  final chipUnit =
      sideGameChipRoundingUnit ??
      StoreConfigService.instance.latestData?.sideGameChipRoundingUnit ??
      kDefaultSideGameChipRoundingUnit;

  if (method == 'sideGameChip') {
    final availableBalanceInYen = balance * chipRate;
    final maxUsableInYen = availableBalanceInYen < categoryAmountYen
        ? availableBalanceInYen
        : categoryAmountYen;
    final maxUsableChips = (maxUsableInYen / chipRate).floor();
    final usableChipsRounded = (maxUsableChips / chipUnit).floor() * chipUnit;
    return usableChipsRounded * chipRate;
  }

  if (method == 'pointA' || method == 'pointB') {
    final maxUsable = balance < categoryAmountYen ? balance : categoryAmountYen;
    return (maxUsable / pointUnit).floor() * pointUnit;
  }

  return 0;
}

String roundingUnitHint(String method) {
  if (method == 'sideGameChip') {
    final unit =
        StoreConfigService.instance.latestData?.sideGameChipRoundingUnit ??
        kDefaultSideGameChipRoundingUnit;
    return 'チップは${unit}枚単位で使用できます';
  }
  if (method == 'pointA' || method == 'pointB') {
    final unit =
        StoreConfigService.instance.latestData?.pointABRoundingUnit ??
        kDefaultPointABRoundingUnit;
    return 'ポイントは${unit}円単位で使用できます';
  }
  return '';
}
