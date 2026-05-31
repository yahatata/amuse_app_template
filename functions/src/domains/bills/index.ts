// Bills domain: callables and triggers
export { getBillPreviewTotals } from "./callables/getBillPreviewTotals";
export { startAccounting, completeAccounting, completeAccountingV2 } from "./callables/accounting";
export { verifyPaymentSplit } from "./callables/verifyPaymentSplit";
export { verifyCustomPayment } from "./callables/verifyCustomPayment";
export { updateActiveBill } from "./callables/updateActiveBill";
export { migrateTodaysBillsAccountingFields } from "./callables/migrateTodaysBills";
// getAccountingHistory: Phase0B でデプロイ対象から除外（unused_function_lib に移動、STORE_CLOSE_HOUR 使用のため）
// updateAccounting / processRefund / getRefundHistory: 旧経路。unused_function_lib に移動済み（2026-05-29）
// billsEventsOnCreate: 旧 events トリガ。unused_function_lib に移動済み（2026-05-29）
export { cancelAccounting } from "./callables/cancelAccounting";
export { createPostSettlementAdjustment } from "./callables/createPostSettlementAdjustment";
export { recordPostSettlementRefund } from "./callables/recordPostSettlementRefund";
export { recordPostSettlementCollection } from "./callables/recordPostSettlementCollection";
export { reopenAccountedBill } from "./callables/reopenAccountedBill";
export { appendExtraCallable as appendExtra } from "./callables/appendExtra";
export { getOpenBills } from "./callables/getOpenBills";
export { billsOnSettle } from "./triggers/billsOnSettle";
