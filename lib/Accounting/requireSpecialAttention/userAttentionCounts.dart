import 'package:amuse_app_template/Accounting/requireSpecialAttention/billRequireAttentionViewModel.dart';

/// 1 ユーザーが持つ要対応 bill の件数内訳。
///
/// 仕様書 [04_仕様書/06_要対応の会計画面と一覧取得.md] §11.2 に基づく:
/// - `総件数`
/// - `未会計 x件`
/// - `追加徴収 x件`
/// - `要返金 x件`
class UserAttentionCounts {
  final int total;
  final int carryover;
  final int collection;
  final int refund;

  const UserAttentionCounts({
    required this.total,
    required this.carryover,
    required this.collection,
    required this.refund,
  });

  factory UserAttentionCounts.from(
    List<BillRequireAttentionViewModel> userBills,
  ) {
    var carryover = 0;
    var collection = 0;
    var refund = 0;
    for (final b in userBills) {
      switch (b.cardType) {
        case BillCardType.carryoverUnsettled:
          carryover += 1;
          break;
        case BillCardType.postSettlementCollectionPending:
          collection += 1;
          break;
        case BillCardType.postSettlementRefundPending:
          refund += 1;
          break;
      }
    }
    return UserAttentionCounts(
      total: userBills.length,
      carryover: carryover,
      collection: collection,
      refund: refund,
    );
  }
}
