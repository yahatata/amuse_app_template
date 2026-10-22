/// A-7: トーナメント順位報酬の候補（rankingRewardPointTypes ∩ enabled）
library;

import 'package:amuse_app_template/services/store_config_service.dart';
import 'package:amuse_app_template/user/point_ids.dart';

class RankingRewardPointOption {
  final String id;
  final String displayName;

  const RankingRewardPointOption({
    required this.id,
    required this.displayName,
  });
}

/// `rankingRewardPointTypes ∩ enabled` の通貨型ポイントのみ。
/// sideGameChip は含めない。
List<RankingRewardPointOption> rankingRewardPointCandidates([
  StoreConfigData? config,
]) {
  final data = config ?? StoreConfigService.instance.latestData;
  if (data == null) return const [];

  final rawAllowed = data.rankingRewardPointTypes;
  final allowed = <String>[];
  if (rawAllowed is List) {
    for (final item in rawAllowed) {
      if (item is String && isCurrencyPointId(item)) {
        allowed.add(item);
      }
    }
  }

  final pointSettings = data.pointSettings;
  final out = <RankingRewardPointOption>[];
  for (final id in allowed) {
    final slot = pointSettings?[id];
    final enabled = slot is Map && slot['enabled'] == true;
    if (!enabled) continue;
    final displayName = slot is Map && slot['displayName'] is String
        ? (slot['displayName'] as String)
        : id;
    out.add(RankingRewardPointOption(id: id, displayName: displayName));
  }
  return out;
}

bool isSideGameChipEnabled([StoreConfigData? config]) {
  final data = config ?? StoreConfigService.instance.latestData;
  final settings = data?.sideGameChipSettings;
  if (settings == null) return false;
  return settings['enabled'] == true;
}
