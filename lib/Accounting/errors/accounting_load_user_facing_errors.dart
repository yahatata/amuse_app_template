/// 会計画面の Firestore / 読込失敗向け固定文言（Phase 8 ACC 残差）。
const String kAccountingLoadFailedMessage =
    '会計情報を取得できませんでした。画面を更新して再度お試しください。';

const String kAccountingBalancesLoadFailedMessage =
    '残高を取得できませんでした。支払い方法の選択はできません。画面を更新して再度お試しください。';

const String kAccountingHistoryLoadFailedMessage =
    '会計履歴を取得できませんでした。画面を更新して再度お試しください。';

const String kAccountingActiveBillsLoadFailedMessage =
    '未会計・会計中の伝票を取得できませんでした。画面を更新して再度お試しください。';

const String kAccountingSingleBillLoadFailedMessage =
    '請求書を取得できませんでした。画面を更新して再度お試しください。';

const String kAccountingSettledBillsLoadFailedMessage =
    '会計完了データを取得できませんでした。画面を更新して再度お試しください。';

const String kAccountingBillPreviewLoadFailedMessage =
    '会計プレビュー情報を取得できませんでした。画面を更新して再度お試しください。';

const String kAccountingCategoryBreakdownLoadFailedMessage =
    '合計金額を表示できませんでした。画面を更新して再度お試しください。';

const String kAccountingBillLineItemsLoadFailedMessage =
    '明細を取得できませんでした。画面を更新して再度お試しください。';

const String kAccountingBusinessDayInitLoadFailedMessage =
    '営業日情報を取得できませんでした。画面を更新して再度お試しください。';

const String kAccountingPostSettlementBillsLoadFailedMessage =
    '会計後操作の対象伝票を取得できませんでした。画面を更新して再度お試しください。';

const String kAccountingPostSettlementDetailLoadFailedMessage =
    '伝票詳細を取得できませんでした。画面を更新して再度お試しください。';

const String kAccountingPostSettlementAdjustmentContextLoadFailedMessage =
    '会計後操作の対象情報を取得できませんでした。画面を更新して再度お試しください。';

const String kAccountingPointConfigInvalidMessage =
    'ポイント関連の会計設定に不備があります。店舗設定を確認してください。';

const String kAccountingCategoryAmountsLoadFailedMessage =
    'カテゴリ別の金額を取得できませんでした。画面を更新して再度お試しください。';

const String kAccountingReopenSuccessMessageUnsettled =
    '会計前の状態に戻しました。未会計一覧に戻しました。';

const String kAccountingReopenSuccessMessageSpecialAttention =
    '会計前の状態に戻しました。要対応の会計に戻しました。';

/// `reopenAccountedBill` 成功レスポンスの `reopenDestination` から復元先文言を決定する。
///
/// backend が返す識別子のみを使い、billType 等で再推測しない。
String resolveAccountingReopenSuccessMessage(Object? responseData) {
  if (responseData is Map) {
    final destination = responseData['reopenDestination'];
    if (destination == 'special_attention') {
      return kAccountingReopenSuccessMessageSpecialAttention;
    }
  }
  return kAccountingReopenSuccessMessageUnsettled;
}

@Deprecated('Use resolveAccountingReopenSuccessMessage')
const String kAccountingReopenSuccessMessage =
    kAccountingReopenSuccessMessageUnsettled;

const String kAccountingPostSettlementRecordedMessage = '会計後操作を記録しました';

const String kAccountingPostSettlementCollectionRecordedMessage =
    '追加徴収を記録しました';

const String kAccountingPostSettlementRefundRecordedMessage = '返金を記録しました';

const String kAccountingPostSettlementReplayFailedMessage =
    '冪等再送の確認に失敗しました。入力内容を確認し、再度お試しください。';
