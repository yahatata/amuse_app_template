/// デバイス管理の行アクション表示（CLN-G1）。
///
/// Admin role の端末では options は業務機能の表示に使われない。
/// Admin ホームは options 非参照。Terminal ホームは `_isAdminDevice` で全ボタン表示。
/// `hasOption` / `isStoreManagement` も role == admin なら options 不問。
bool shouldShowOptionsEditButton(String role) {
  return role != 'admin' && role != 'table';
}

/// role == table はオプションではなく卓紐付け編集を出す。
bool shouldShowTableBindingEditButton(String role) {
  return role == 'table';
}
