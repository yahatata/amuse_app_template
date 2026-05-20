/// 要対応の会計画面で扱う共通 view model。
///
/// 仕様書 `docs/事後イベント（会計後調整系）本番化/仕様実装管理/04_仕様書/06_要対応の会計画面と一覧取得.md`
/// §8〜§12 と上流 §10 に基づく。
///
/// - `bills` 親 doc の `status` / `closeSummary` / `postSettlementState` から
///   3 種の cardType を判定し、画面表示用の派生値（label / amount / sortDate / primaryAction）を保持する。
library;

/// 内部カード種別（仕様書 §8）。
enum BillCardType {
  carryoverUnsettled,
  postSettlementCollectionPending,
  postSettlementRefundPending,
}

/// primary action 種別（仕様書 §12.2）。
enum PrimaryActionType {
  resumeAccounting,
  collect,
  refund,
}

/// 要対応の会計画面で 1 枚のカードに相当する共通 view model。
class BillRequireAttentionViewModel {
  final String billId;
  final BillCardType cardType;
  final String displayLabel;
  final String businessDate;
  final String displayTitle;
  final int displayAmountIncl;
  final PrimaryActionType primaryActionType;
  final String sortDate;
  final String? badgeText;
  final String userId;
  final String userDisplayName;

  /// 元 bill の生データ。primary action からの遷移時に必要に応じて参照する。
  final Map<String, dynamic> rawBill;

  const BillRequireAttentionViewModel({
    required this.billId,
    required this.cardType,
    required this.displayLabel,
    required this.businessDate,
    required this.displayTitle,
    required this.displayAmountIncl,
    required this.primaryActionType,
    required this.sortDate,
    required this.userId,
    required this.userDisplayName,
    required this.rawBill,
    this.badgeText,
  });

  /// bill 親 doc から view model を構築する。
  ///
  /// 該当しない場合 (status / 判定条件に当てはまらない) は null。
  static BillRequireAttentionViewModel? fromBill(
    String billId,
    Map<String, dynamic> bill,
  ) {
    final cardType = classifyBill(bill);
    if (cardType == null) return null;

    final party = bill['party'] as Map<String, dynamic>?;
    final userId = (party?['userId'] as String?) ?? '';
    final pokerName = (party?['pokerName'] as String?) ?? '';
    final businessDate = (bill['businessDate'] as String?) ?? '';

    return BillRequireAttentionViewModel(
      billId: billId,
      cardType: cardType,
      displayLabel: computeDisplayLabel(cardType),
      businessDate: businessDate,
      displayTitle: pokerName.isNotEmpty ? pokerName : billId,
      displayAmountIncl: computeDisplayAmountIncl(cardType, bill),
      primaryActionType: computePrimaryAction(cardType),
      sortDate: computeSortDate(cardType, bill),
      userId: userId,
      userDisplayName: pokerName.isNotEmpty ? pokerName : '—',
      rawBill: bill,
    );
  }
}

/// 仕様書 §9 の判定条件で cardType を決める。
///
/// - §9.1 `carryover_unsettled`: `status='open'` + `closeSummary.unresolved=true`
/// - §9.2 `post_settlement_collection_pending`: `status='post_settlement_pending'` + `requiredActionType='collection'` + `requiredActionIncl > 0`
/// - §9.3 `post_settlement_refund_pending`: `status='post_settlement_pending'` + `requiredActionType='refund'` + `requiredActionIncl > 0`
///
/// 仕様書 §14.4「同じ bill が同時に複数 cardType に分類されない」は
/// status による排他で自然に保証される。
BillCardType? classifyBill(Map<String, dynamic> bill) {
  final status = bill['status'] as String?;
  if (status == 'open') {
    final closeSummary = bill['closeSummary'] as Map<String, dynamic>?;
    if (closeSummary != null && closeSummary['unresolved'] == true) {
      return BillCardType.carryoverUnsettled;
    }
    return null;
  }
  if (status == 'post_settlement_pending') {
    final pss = bill['postSettlementState'] as Map<String, dynamic>?;
    if (pss == null) return null;
    final type = pss['requiredActionType'] as String?;
    final incl = (pss['requiredActionIncl'] as num?)?.toInt() ?? 0;
    if (incl <= 0) return null;
    if (type == 'collection') {
      return BillCardType.postSettlementCollectionPending;
    }
    if (type == 'refund') {
      return BillCardType.postSettlementRefundPending;
    }
    return null;
  }
  return null;
}

/// 仕様書 §8.1 の画面ラベル。
String computeDisplayLabel(BillCardType cardType) {
  switch (cardType) {
    case BillCardType.carryoverUnsettled:
      return '未会計';
    case BillCardType.postSettlementCollectionPending:
      return '追加徴収';
    case BillCardType.postSettlementRefundPending:
      return '要返金';
  }
}

/// 仕様書 §10.2 / §12.3 に基づく `sortDate` 計算。
String computeSortDate(BillCardType cardType, Map<String, dynamic> bill) {
  switch (cardType) {
    case BillCardType.carryoverUnsettled:
      final closeSummary = bill['closeSummary'] as Map<String, dynamic>?;
      final closedBd = closeSummary?['closedBusinessDate'] as String?;
      if (closedBd != null && closedBd.isNotEmpty) {
        return closedBd;
      }
      return (bill['businessDate'] as String?) ?? '';
    case BillCardType.postSettlementCollectionPending:
    case BillCardType.postSettlementRefundPending:
      return (bill['businessDate'] as String?) ?? '';
  }
}

/// 仕様書 §12.1 に基づく `displayAmountIncl` 計算。
int computeDisplayAmountIncl(BillCardType cardType, Map<String, dynamic> bill) {
  switch (cardType) {
    case BillCardType.carryoverUnsettled:
      final closeSummary = bill['closeSummary'] as Map<String, dynamic>?;
      return (closeSummary?['displayAmountAtMark'] as num?)?.toInt() ?? 0;
    case BillCardType.postSettlementCollectionPending:
    case BillCardType.postSettlementRefundPending:
      final pss = bill['postSettlementState'] as Map<String, dynamic>?;
      return (pss?['requiredActionIncl'] as num?)?.toInt() ?? 0;
  }
}

/// 仕様書 §12.2 に基づく `primaryActionType` 決定。
PrimaryActionType computePrimaryAction(BillCardType cardType) {
  switch (cardType) {
    case BillCardType.carryoverUnsettled:
      return PrimaryActionType.resumeAccounting;
    case BillCardType.postSettlementCollectionPending:
      return PrimaryActionType.collect;
    case BillCardType.postSettlementRefundPending:
      return PrimaryActionType.refund;
  }
}

/// primary action のボタンラベル。
String primaryActionLabel(PrimaryActionType type) {
  switch (type) {
    case PrimaryActionType.resumeAccounting:
      return '会計を再開する';
    case PrimaryActionType.collect:
      return '徴収する';
    case PrimaryActionType.refund:
      return '返金する';
  }
}
