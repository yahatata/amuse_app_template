/// A-6/A-7: 残高表示名・有効残高 ID（config 由来）
library;

import 'package:amuse_app_template/services/store_config_service.dart';
import 'package:amuse_app_template/user/point_ids.dart';
import 'package:amuse_app_template/user/user_balances.dart';

/// config の displayName。未設定・config 不備時はハードコード名へ落とさず明示する。
String balanceDisplayName(String id, [StoreConfigData? config]) {
  final data = config ?? StoreConfigService.instance.latestData;
  if (id == 'cash') return '現金';
  if (id == 'credit_card') return 'クレジットカード';
  if (id == 'electronic_money') return '電子マネー';

  if (data == null) {
    return '$id（設定未取得）';
  }
  if (id == kSideGameChipId) {
    final settings = data.sideGameChipSettings;
    if (settings == null) return '$id（設定なし）';
    final name = settings['displayName'];
    if (name is String && name.trim().isNotEmpty) return name.trim();
    return '$id（名称未設定）';
  }
  if (isCurrencyPointId(id)) {
    final slot = data.pointSettings?[id];
    if (slot is! Map) return '$id（設定なし）';
    final name = slot['displayName'];
    if (name is String && name.trim().isNotEmpty) return name.trim();
    return '$id（名称未設定）';
  }
  return id;
}

/// 現在 config で有効な残高 ID（通貨型順 → chip）
List<String> enabledBalanceIdsFromStoreConfig([StoreConfigData? config]) {
  final data = config ?? StoreConfigService.instance.latestData;
  if (data == null) return const [];

  final pointEnabled = <String, bool>{};
  final settings = data.pointSettings;
  if (settings != null) {
    for (final id in kCurrencyPointIds) {
      final slot = settings[id];
      pointEnabled[id] = slot is Map && slot['enabled'] == true;
    }
  }

  final chipSettings = data.sideGameChipSettings;
  final chipEnabled =
      chipSettings != null && chipSettings['enabled'] == true;

  return enabledBalanceIds(
    pointEnabled: pointEnabled,
    sideGameChipEnabled: chipEnabled,
  );
}

/// `users` ドキュメントの 1 残高を表示用文字列に。corrupt は 0 にしない。
String formatBalanceFieldDisplay(Map<String, dynamic>? data, String id) {
  final result = readBalanceField(data, id);
  if (result.kind == BalanceReadKind.corrupt) {
    return 'データ不整合';
  }
  final v = result.value ?? 0;
  return v.toString().replaceAllMapped(
    RegExp(r'(\d{1,3})(?=(\d{3})+(?!\d))'),
    (m) => '${m[1]},',
  );
}
