/**
 * 給与計算UI用の表示コンテキスト（JST 基準日・期間キー・支給日）
 *
 * storeMeta/config の payroll 暦と payrollConfig を getPayrollCandidates と同じ経路で参照する。
 */

import { getStoreConfig } from '../../../shared/config/configLoader';
import { getPayrollConfig } from '../../../shared/config/payrollConfigLoader';
import { DEFAULT_PAYROLL_START_DAY, DEFAULT_PAYROLL_END_DAY } from '../../../shared/config/defaults';
import { computeActualPaymentDate, getCalcTargetPaymentPeriodKey } from './payrollPeriodUtils';

/** JST の本日を YYYY-MM-DD で返す */
export function getJstYmdNow(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Tokyo' });
}

export interface PayrollDisplayContext {
  asOfDateJst: string;
  paymentPeriodKey: string;
  periodStart: string;
  periodEnd: string;
  /** storeMeta/payrollConfig.paymentDayOfMonth（'0'..'31' または null） */
  paymentDayOfMonth: string | null;
  /** storeMeta/payrollConfig.paymentMonthOffset（0=同月, 1=翌月, 2=翌々月） */
  paymentMonthOffset: 0 | 1 | 2;
  /** periodEnd と設定値から算出した実支給日 */
  actualPaymentDate: string | null;
  /** 画面表示用（null 時は「未設定」） */
  paymentDateDisplay: string;
}

export async function buildPayrollDisplayContext(): Promise<PayrollDisplayContext> {
  const storeConfig = await getStoreConfig();
  const startDay = storeConfig.payroll?.startDay ?? DEFAULT_PAYROLL_START_DAY;
  const endDay = storeConfig.payroll?.endDay ?? DEFAULT_PAYROLL_END_DAY;

  const asOfDateJst = getJstYmdNow();
  const paymentPeriodKey = getCalcTargetPaymentPeriodKey(asOfDateJst, startDay, endDay);
  const [periodStart, periodEnd] = paymentPeriodKey.split('_');

  const payrollConfig = await getPayrollConfig();
  const paymentDayOfMonth = payrollConfig.paymentDayOfMonth;
  const paymentMonthOffset = payrollConfig.paymentMonthOffset;
  const actualPaymentDate = computeActualPaymentDate(
    periodEnd,
    paymentDayOfMonth,
    paymentMonthOffset
  );
  const paymentDateDisplay = actualPaymentDate ?? '未設定';

  return {
    asOfDateJst,
    paymentPeriodKey,
    periodStart,
    periodEnd,
    paymentDayOfMonth,
    paymentMonthOffset,
    actualPaymentDate,
    paymentDateDisplay,
  };
}
