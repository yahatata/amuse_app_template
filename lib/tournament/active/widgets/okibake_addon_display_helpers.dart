/// Addon 回数表示・UI 可否判定（通常 / 置きバケ待機一覧・着席ダイアログ共通）。

/// `resolvedAddonLimit`: [resolveAddonLimitPerPlayerUi] の結果。-1 は未取得。
String formatOkibakeAddonStatusLine({
  required int okibakeAddonCount,
  required int resolvedAddonLimit,
  bool loading = false,
  bool countLoadFailed = false,
}) {
  return formatAddonStatusLine(
    addonCount: okibakeAddonCount,
    resolvedAddonLimit: resolvedAddonLimit,
    loading: loading,
    countLoadFailed: countLoadFailed,
  );
}

String formatAddonStatusLine({
  required int addonCount,
  required int resolvedAddonLimit,
  bool loading = false,
  bool countLoadFailed = false,
}) {
  if (loading) {
    return 'Addon: 可否・上限を確認中です';
  }
  if (resolvedAddonLimit < 0 || countLoadFailed) {
    return 'Addon: 回数情報を取得できませんでした';
  }
  if (resolvedAddonLimit <= 0) {
    return 'Addon: 無効';
  }
  if (addonCount >= resolvedAddonLimit) {
    return 'Addon: 上限到達 $addonCount / $resolvedAddonLimit 回';
  }
  return 'Addon: 現在 $addonCount / $resolvedAddonLimit 回';
}

/// UI 上 Addon 操作を無効にするか（最終判定は Callable）。
bool isOkibakeAddonUiDisabled({
  required int okibakeAddonCount,
  required int resolvedAddonLimit,
  bool loading = false,
  bool busy = false,
  bool countLoadFailed = false,
}) {
  return isAddonUiDisabled(
    addonCount: okibakeAddonCount,
    resolvedAddonLimit: resolvedAddonLimit,
    loading: loading,
    busy: busy,
    countLoadFailed: countLoadFailed,
  );
}

bool isAddonUiDisabled({
  required int addonCount,
  required int resolvedAddonLimit,
  bool loading = false,
  bool busy = false,
  bool countLoadFailed = false,
}) {
  if (busy || loading || countLoadFailed) return true;
  if (resolvedAddonLimit < 0) return false;
  if (resolvedAddonLimit <= 0) return true;
  return addonCount >= resolvedAddonLimit;
}
