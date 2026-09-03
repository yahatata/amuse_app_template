// Analytics domain: callables and scheduler (services/aggregator is internal)
// 整合性チェック（C-3）
export { analyticsDailyCheck } from "./callables/analyticsDailyCheck";
export { analyticsMonthlyCheck } from "./callables/analyticsMonthlyCheck";
// 夜間整合確認: Phase4 03 で unused に移管。閉店処理用の新規整合性チェックは 03 で別実装。
// nightlyRecalculateBalanceDue: Phase4 02 で unused_function_lib に移管（別プロジェクトで実施）
// nightlyReconciliationCheck: Phase0B で廃止（unused_function_lib に移動）
