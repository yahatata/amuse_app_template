/// A-7: ポイント関連 config 整合性 validation（Flutter）
///
/// 必須設定の欠損を default で補完しない。
/// Functions の validatePointConfig と同等の判定を返す。
library;

import 'point_ids.dart';
import 'point_conversion.dart';

const String kConfigPointInvalid = 'CONFIG_POINT_INVALID';
const int kDisplayNameMaxLength = 40;

/// bill 会計で使う既知カテゴリ（Functions の KNOWN_BILL_CATEGORIES と同一）
const List<String> kKnownBillCategories = [
  'extraCost',
  'sideGameChip',
  'tournaments',
  'items',
];

class PointSlotSetting {
  final bool enabled;
  final String displayName;

  const PointSlotSetting({
    required this.enabled,
    required this.displayName,
  });
}

class SideGameChipSettings {
  final bool enabled;
  final String displayName;

  const SideGameChipSettings({
    required this.enabled,
    required this.displayName,
  });
}

class BalancePaymentSetting {
  final BalanceConversion conversion;
  final int usageUnit;

  const BalancePaymentSetting({
    required this.conversion,
    required this.usageUnit,
  });
}

class ValidatedPointConfig {
  final Map<String, PointSlotSetting> pointSettings;
  final SideGameChipSettings sideGameChipSettings;
  final List<String> rankingRewardPointTypes;
  final Map<String, List<String>> categoryPaymentMethods;
  final List<String> pointPriority;
  final Map<String, BalancePaymentSetting> balancePaymentSettings;
  final List<String> categoryOrder;

  const ValidatedPointConfig({
    required this.pointSettings,
    required this.sideGameChipSettings,
    required this.rankingRewardPointTypes,
    required this.categoryPaymentMethods,
    required this.pointPriority,
    required this.balancePaymentSettings,
    required this.categoryOrder,
  });
}

class PointConfigValidationResult {
  final bool ok;
  final ValidatedPointConfig? value;
  final String? errorKey;
  final String? message;

  const PointConfigValidationResult._({
    required this.ok,
    this.value,
    this.errorKey,
    this.message,
  });

  factory PointConfigValidationResult.success(ValidatedPointConfig value) =>
      PointConfigValidationResult._(ok: true, value: value);

  factory PointConfigValidationResult.failure(String message) =>
      PointConfigValidationResult._(
        ok: false,
        errorKey: kConfigPointInvalid,
        message: message,
      );
}

PointConfigValidationResult tryValidatePointConfig({
  required Object? pointSettings,
  required Object? sideGameChipSettings,
  required Object? rankingRewardPointTypes,
  required Object? categoryPaymentMethods,
  required Object? pointPriority,
  required Object? balancePaymentSettings,
  required Object? categoryOrder,
}) {
  try {
    final ps = _validatePointSettings(pointSettings);
    final chip = _validateSideGameChipSettings(sideGameChipSettings);
    final rewards = _validateRankingRewardPointTypes(
      rankingRewardPointTypes,
      ps,
    );
    final categories = _validateCategoryPaymentMethods(categoryPaymentMethods);
    _validateEnabledVsAllowlists(ps, chip, categories);
    final payable = _collectPayableBalanceIds(categories);
    final balanceSettings = _validateBalancePaymentSettings(
      balancePaymentSettings,
      payable,
    );
    final priority = _validatePointPriority(pointPriority, ps, chip, payable);
    final order = _validateCategoryOrder(categoryOrder);
    return PointConfigValidationResult.success(
      ValidatedPointConfig(
        pointSettings: ps,
        sideGameChipSettings: chip,
        rankingRewardPointTypes: rewards,
        categoryPaymentMethods: categories,
        pointPriority: priority,
        balancePaymentSettings: balanceSettings,
        categoryOrder: order,
      ),
    );
  } on _PointConfigException catch (e) {
    return PointConfigValidationResult.failure(e.message);
  }
}

class _PointConfigException implements Exception {
  final String message;
  _PointConfigException(this.message);
}

Never _reject(String message) => throw _PointConfigException(message);

Map<String, PointSlotSetting> _validatePointSettings(Object? raw) {
  if (raw is! Map) {
    _reject('pointSettings が存在しないか不正です');
  }
  final out = <String, PointSlotSetting>{};
  for (final id in kCurrencyPointIds) {
    if (!raw.containsKey(id)) {
      _reject('pointSettings.$id が欠落しています');
    }
    out[id] = _validateSlotSetting(raw[id], 'pointSettings.$id');
  }
  for (final key in raw.keys) {
    if (!isCurrencyPointId(key.toString())) {
      _reject('pointSettings に未知のキーがあります: $key');
    }
  }
  return out;
}

SideGameChipSettings _validateSideGameChipSettings(Object? raw) {
  final slot = _validateSlotSetting(raw, 'sideGameChipSettings');
  return SideGameChipSettings(
    enabled: slot.enabled,
    displayName: slot.displayName,
  );
}

PointSlotSetting _validateSlotSetting(Object? raw, String path) {
  if (raw is! Map) {
    _reject('$path は object である必要があります');
  }
  final enabled = raw['enabled'];
  if (enabled is! bool) {
    _reject('$path.enabled は boolean である必要があります');
  }
  final displayNameRaw = raw['displayName'];
  if (displayNameRaw is! String) {
    _reject('$path.displayName は string である必要があります');
  }
  final trimmed = displayNameRaw.trim();
  if (trimmed.isEmpty) {
    _reject('$path.displayName は trim 後 1 文字以上である必要があります');
  }
  if (trimmed.length > kDisplayNameMaxLength) {
    _reject('$path.displayName は最大 $kDisplayNameMaxLength 文字です');
  }
  return PointSlotSetting(enabled: enabled, displayName: trimmed);
}

List<String> _validateRankingRewardPointTypes(
  Object? raw,
  Map<String, PointSlotSetting> pointSettings,
) {
  if (raw == null) {
    _reject('tournament.rankingRewardPointTypes が欠落しています');
  }
  if (raw is! List) {
    _reject('rankingRewardPointTypes は配列である必要があります');
  }
  final seen = <String>{};
  final out = <String>[];
  for (final item in raw) {
    final id = item?.toString();
    if (id == kSideGameChipId) {
      _reject('rankingRewardPointTypes に sideGameChip は含められません');
    }
    if (!isCurrencyPointId(id)) {
      _reject('rankingRewardPointTypes に未知または不正な ID: $item');
    }
    if (seen.contains(id)) {
      _reject('rankingRewardPointTypes に重複があります: $id');
    }
    if (pointSettings[id]!.enabled != true) {
      _reject('rankingRewardPointTypes の $id は enabled:false です');
    }
    seen.add(id!);
    out.add(id);
  }
  return out;
}

Map<String, List<String>> _validateCategoryPaymentMethods(Object? raw) {
  if (raw is! Map) {
    _reject('categoryPaymentMethods が存在しないか不正です');
  }
  final out = <String, List<String>>{};
  for (final entry in raw.entries) {
    final category = entry.key.toString();
    final methodsRaw = entry.value;
    if (methodsRaw is! List) {
      _reject('categoryPaymentMethods.$category は配列である必要があります');
    }
    final methods = <String>[];
    for (final method in methodsRaw) {
      final m = method?.toString();
      if (m == null || (!isCashLikeMethod(m) && !isBalanceId(m))) {
        _reject('categoryPaymentMethods.$category に未知の method: $method');
      }
      methods.add(m);
    }
    out[category] = methods;
  }
  return out;
}

Set<String> _collectPayableBalanceIds(
  Map<String, List<String>> categoryPaymentMethods,
) {
  final set = <String>{};
  for (final methods in categoryPaymentMethods.values) {
    for (final method in methods) {
      if (isBalanceId(method)) set.add(method);
    }
  }
  return set;
}

bool _isBalanceEnabled(
  String id,
  Map<String, PointSlotSetting> pointSettings,
  SideGameChipSettings chip,
) {
  if (id == kSideGameChipId) return chip.enabled;
  return pointSettings[id]?.enabled == true;
}

void _validateEnabledVsAllowlists(
  Map<String, PointSlotSetting> pointSettings,
  SideGameChipSettings chip,
  Map<String, List<String>> categoryPaymentMethods,
) {
  for (final entry in categoryPaymentMethods.entries) {
    for (final method in entry.value) {
      if (!isBalanceId(method)) continue;
      if (!_isBalanceEnabled(method, pointSettings, chip)) {
        _reject(
          'categoryPaymentMethods.${entry.key} の $method は enabled:false です',
        );
      }
    }
  }
}

Map<String, BalancePaymentSetting> _validateBalancePaymentSettings(
  Object? raw,
  Set<String> payableBalanceIds,
) {
  if (raw is! Map) {
    _reject('balancePaymentSettings が存在しないか不正です');
  }
  final out = <String, BalancePaymentSetting>{};
  for (final entry in raw.entries) {
    final key = entry.key.toString();
    if (!isBalanceId(key)) {
      _reject('balancePaymentSettings に未知の ID: $key');
    }
    out[key] = _validateBalancePaymentSetting(
      entry.value,
      'balancePaymentSettings.$key',
    );
  }
  for (final id in payableBalanceIds) {
    if (!out.containsKey(id)) {
      _reject(
        'categoryPaymentMethods に含まれる $id の balancePaymentSettings がありません',
      );
    }
  }
  return out;
}

BalancePaymentSetting _validateBalancePaymentSetting(
  Object? raw,
  String path,
) {
  if (raw is! Map) {
    _reject('$path は object である必要があります');
  }
  final conversionRaw = raw['conversion'];
  if (conversionRaw is! Map) {
    _reject('$path.conversion は object である必要があります');
  }
  final referenceUnits = conversionRaw['referenceUnits'];
  final balanceUnits = conversionRaw['balanceUnits'];
  final usageUnit = raw['usageUnit'];
  if (!_isPositiveSafeInt(referenceUnits)) {
    _reject('$path.conversion.referenceUnits は正の安全整数である必要があります');
  }
  if (!_isPositiveSafeInt(balanceUnits)) {
    _reject('$path.conversion.balanceUnits は正の安全整数である必要があります');
  }
  if (!_isPositiveSafeInt(usageUnit)) {
    _reject('$path.usageUnit は正の安全整数である必要があります');
  }
  return BalancePaymentSetting(
    conversion: BalanceConversion(
      referenceUnits: referenceUnits as int,
      balanceUnits: balanceUnits as int,
    ),
    usageUnit: usageUnit as int,
  );
}

/// categoryOrder は config 正本（ハードコード順 fallback 禁止）。
List<String> _validateCategoryOrder(Object? raw) {
  if (raw == null) {
    _reject('categoryOrder が欠落しています');
  }
  if (raw is! List || raw.isEmpty) {
    _reject('categoryOrder は非空の配列である必要があります');
  }
  final known = kKnownBillCategories.toSet();
  final seen = <String>{};
  final out = <String>[];
  for (final item in raw) {
    final id = item?.toString();
    if (id == null || !known.contains(id)) {
      _reject('categoryOrder に未知のカテゴリがあります: $item');
    }
    if (seen.contains(id)) {
      _reject('categoryOrder に重複があります: $id');
    }
    seen.add(id);
    out.add(id);
  }
  for (final required in kKnownBillCategories) {
    if (!seen.contains(required)) {
      _reject('categoryOrder に必須カテゴリ $required がありません');
    }
  }
  return out;
}

bool _isPositiveSafeInt(Object? n) {
  if (n is! int) return false;
  return n > 0 && n <= kMaxSafeInteger;
}

List<String> _validatePointPriority(
  Object? raw,
  Map<String, PointSlotSetting> pointSettings,
  SideGameChipSettings chip,
  Set<String> payableBalanceIds,
) {
  if (raw == null) {
    _reject('pointPriority が欠落しています');
  }
  if (raw is! List) {
    _reject('pointPriority は配列である必要があります');
  }
  final seen = <String>{};
  final out = <String>[];
  for (final item in raw) {
    final id = item?.toString();
    if (isCashLikeMethod(id)) {
      _reject('pointPriority に現金系 method は含められません: $id');
    }
    if (!isBalanceId(id)) {
      _reject('pointPriority に未知の ID: $item');
    }
    if (seen.contains(id)) {
      _reject('pointPriority に重複があります: $id');
    }
    if (!_isBalanceEnabled(id!, pointSettings, chip)) {
      _reject('pointPriority の $id は enabled:false です');
    }
    if (!payableBalanceIds.contains(id)) {
      _reject(
        'pointPriority の $id は categoryPaymentMethods 上の支払可能残高ではありません',
      );
    }
    seen.add(id);
    out.add(id);
  }
  return out;
}
