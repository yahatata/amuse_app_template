/**
 * 給与デモデータの識別フラグ（staffs / attendances 共通）
 * deletePayrollDemoData で一括削除するために使用する。
 */
export const PAYROLL_DEMO_FLAG_FIELD = "isPayrollDemoSeed" as const;
export const PAYROLL_DEMO_BATCH_FIELD = "payrollDemoSeedBatchId" as const;
