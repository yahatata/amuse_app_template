/// A-7: ユーザー残高の安全な読取・検証（Flutter）
///
/// フィールド不在 → 0
/// 明示 null / 非 int / 負数 / 小数 → データ不整合（0 へ変換しない）
library;

import 'point_ids.dart';

enum BalanceReadKind { ok, missing, corrupt }

class BalanceReadResult {
  final BalanceReadKind kind;
  final int? value;
  final String? reason;

  const BalanceReadResult._(this.kind, {this.value, this.reason});

  factory BalanceReadResult.ok(int value) =>
      BalanceReadResult._(BalanceReadKind.ok, value: value);

  factory BalanceReadResult.missing() =>
      const BalanceReadResult._(BalanceReadKind.missing, value: 0);

  factory BalanceReadResult.corrupt(String reason) =>
      BalanceReadResult._(BalanceReadKind.corrupt, reason: reason);

  bool get isUsable =>
      kind == BalanceReadKind.ok || kind == BalanceReadKind.missing;

  /// 表示用。不整合時は null（0 に落とさない）
  int? get displayValue => isUsable ? value : null;
}

bool isUsableBalanceValue(Object? value) {
  if (value is! int) return false;
  return value >= 0;
}

/// Firestore / Map から 1 残高を読む。
BalanceReadResult readBalanceField(
  Map<String, dynamic>? data,
  String id,
) {
  if (!isBalanceId(id)) {
    return BalanceReadResult.corrupt('unknown_id');
  }
  if (data == null || !data.containsKey(id)) {
    return BalanceReadResult.missing();
  }
  final raw = data[id];
  if (raw == null) {
    return BalanceReadResult.corrupt('null');
  }
  if (raw is int && raw >= 0) {
    return BalanceReadResult.ok(raw);
  }
  if (raw is num) {
    if (raw.isNaN) return BalanceReadResult.corrupt('NaN');
    if (raw.isInfinite) return BalanceReadResult.corrupt('Infinity');
    return BalanceReadResult.corrupt('non-int-num');
  }
  return BalanceReadResult.corrupt('non-number');
}

/// 欠損は 0。不整合は StateError。
int readBalanceOrZeroIfMissing(Map<String, dynamic>? data, String id) {
  final result = readBalanceField(data, id);
  if (result.kind == BalanceReadKind.corrupt) {
    throw StateError('INVALID_BALANCE: $id (${result.reason})');
  }
  return result.value!;
}

Map<String, int> readAllStandardBalancesForMigration(
  Map<String, dynamic>? data,
) {
  return {
    for (final id in kAllBalanceIds) id: readBalanceOrZeroIfMissing(data, id),
  };
}

List<String> allStandardBalanceIds() =>
    List<String>.unmodifiable(kAllBalanceIds);

String balanceField(String id) {
  if (!isBalanceId(id)) {
    throw ArgumentError.value(id, 'id', '未知の残高ID');
  }
  return id;
}

/// config 断片から有効残高 ID（通貨型順 → chip）
List<String> enabledBalanceIds({
  Map<String, bool>? pointEnabled,
  bool? sideGameChipEnabled,
}) {
  final ids = <String>[];
  for (final id in kCurrencyPointIds) {
    if (pointEnabled?[id] == true) {
      ids.add(id);
    }
  }
  if (sideGameChipEnabled == true) {
    ids.add(kSideGameChipId);
  }
  return ids;
}
