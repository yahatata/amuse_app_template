/**
 * 給与計算関連のエラーコード定義
 *
 * Callable 関数で HttpsError に渡すカスタムコード。
 * 参照: docs/config_migration/phase4_3/specs/04_CALLABLE_API_SPEC.md セクション10
 */

export const PAYROLL_ERRORS = {
  PERMISSION_DENIED: 'permission-denied',
  ALREADY_CONFIRMED: 'already-confirmed',
  INVALID_PERIOD: 'invalid-period',
  NO_ATTENDANCE_SELECTED: 'no-attendance-selected',
  PAYROLL_CONFIG_NOT_FOUND: 'payroll-config-not-found',
  RUN_NOT_FOUND: 'run-not-found',
  RUN_NOT_COMPLETED: 'run-not-completed',
  INVALID_RUN_STATUS: 'invalid-run-status',
  RUN_CANCELLED: 'run-cancelled',
  NOT_CONFIRMED: 'not-confirmed',
  ALREADY_PAID: 'already-paid',
  STAFF_ALREADY_PAID: 'staff-already-paid',
  ATTENDANCE_NOT_READY_FOR_PAYROLL_RUN: 'attendance-not-ready-for-payroll-run',
} as const;

export type PayrollErrorCode = typeof PAYROLL_ERRORS[keyof typeof PAYROLL_ERRORS];
