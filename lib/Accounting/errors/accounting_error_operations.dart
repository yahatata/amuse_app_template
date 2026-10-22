/// 会計画面の Callable / soft-fail 向け operation 識別子。
///
/// catch 内や catalog に生文字列を直書きしないこと。
abstract final class AccountingErrorOperations {
  static const start = 'accounting.start';
  static const complete = 'accounting.complete';
  static const cancel = 'accounting.cancel';
  static const reopen = 'accounting.reopen';
  static const updateActiveBill = 'accounting.updateActiveBill';
  static const createPostSettlementAdjustment =
      'accounting.createPostSettlementAdjustment';
  static const recordPostSettlementCollection =
      'accounting.recordPostSettlementCollection';
  static const recordPostSettlementRefund =
      'accounting.recordPostSettlementRefund';
  static const loadBills = 'accounting.loadBills';
}
