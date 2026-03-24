/**
 * paymentStatus 遷移バリデーション & monthlyPayroll.status 決定ヘルパー
 *
 * Firestore 非依存。registerPaymentStatus Callable から利用する。
 * 参照: 04_CALLABLE_API_SPEC §9, 03_DATA_MODEL_SPEC §2-3
 */

import type { PaymentStatus, MonthlyPayrollStatus } from '../types/payrollCalcTypes';

export interface TransitionResult {
  allowed: boolean;
  skip: boolean;
  errorCode?: string;
}

/**
 * paymentStatus の遷移バリデーション
 *
 * - unpaid → paid: OK
 * - unpaid → hold: OK
 * - hold   → paid: OK
 * - paid   → *:    reject (staff-already-paid)
 * - hold   → hold: skip (変更なし)
 */
export function validatePaymentStatusTransition(
  current: PaymentStatus,
  target: 'paid' | 'hold'
): TransitionResult {
  if (current === 'paid') {
    return { allowed: false, skip: false, errorCode: 'staff-already-paid' };
  }

  if (current === 'hold' && target === 'hold') {
    return { allowed: false, skip: true };
  }

  return { allowed: true, skip: false };
}

/**
 * 全 staffResults の paymentStatus 集計から monthlyPayroll.status を決定する
 *
 * - unpaidCount == 0 && holdCount == 0 → "paid"
 * - unpaidCount == 0 && holdCount > 0  → "hold"
 * - otherwise                          → "confirmed"
 */
export function determineMonthlyPayrollStatus(
  unpaidCount: number,
  holdCount: number
): MonthlyPayrollStatus {
  if (unpaidCount === 0 && holdCount === 0) {
    return 'paid';
  }
  if (unpaidCount === 0 && holdCount > 0) {
    return 'hold';
  }
  return 'confirmed';
}
