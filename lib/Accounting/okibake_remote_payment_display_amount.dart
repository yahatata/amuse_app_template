/// 会計一覧・詳細向けの請求額（claim）表示ヘルパ。
///
/// 正本は `settlementSnapshot.amounts` / `amounts`。
/// 過去の不完全 settle の `okibake_remote_payment` のみ、
/// claim 欠落/0 のとき `remotePayment.amountIncl` を表示 fallback する
///（remotePayment を SoT に昇格するものではない）。
int resolveBillClaimDisplayAmountIncl(Map<String, dynamic> bill) {
  final settlementSnapshot =
      (bill['settlementSnapshot'] as Map<String, dynamic>?) ?? const {};
  final snapshotAmounts =
      (settlementSnapshot['amounts'] as Map<String, dynamic>?) ?? const {};
  final rootAmounts = (bill['amounts'] as Map<String, dynamic>?) ?? const {};

  final fromSnapshot = (snapshotAmounts['grandTotalIncl'] as num?)?.toInt();
  final fromRootIncl = (rootAmounts['grandTotalIncl'] as num?)?.toInt();
  final fromRootRounded = (rootAmounts['grandTotalRounded'] as num?)?.toInt();

  final claim = fromSnapshot ?? fromRootIncl ?? fromRootRounded;
  if (claim != null && claim > 0) {
    return claim;
  }

  if (bill['billType'] == 'okibake_remote_payment') {
    final remote = bill['remotePayment'] as Map<String, dynamic>?;
    final remoteAmount = (remote?['amountIncl'] as num?)?.toInt();
    if (remoteAmount != null) {
      return remoteAmount;
    }
  }

  return claim ?? 0;
}
