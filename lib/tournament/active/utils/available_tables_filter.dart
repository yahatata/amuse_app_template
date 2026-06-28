/// 卓追加ダイアログ用: tablesSeat 上で「有効登録済み」とみなす卓 ID。
///
/// `isEnabled: false`（卓削除後の論理削除）は除外対象にしない。
Set<String> activeRegisteredTableIdsFromTablesSeat(
  Iterable<MapEntry<String, Map<String, dynamic>>> tablesSeatDocs,
) {
  return tablesSeatDocs
      .where((entry) => entry.key != 'waiting' && entry.key != 'busted')
      .where((entry) => entry.value['isEnabled'] != false)
      .map((entry) => entry.key)
      .toSet();
}
