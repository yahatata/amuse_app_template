/// Phase 3A: テンプレ UI の初期表示・検証と Functions の `resolveAddonLimitPerPlayer` に整合させる。
int resolveAddonLimitPerPlayerUi({
  required bool isAddon,
  Object? addonLimitPerPlayer,
}) {
  if (!isAddon) return 0;
  final n = addonLimitPerPlayer;
  if (n is int && n >= 1) return n;
  if (n is num) {
    final asInt = n.toInt();
    if (n == asInt && asInt >= 1) return asInt;
  }
  return 1;
}
