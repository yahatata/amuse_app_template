/**
 * confirmPayrollRun で使用するテスタブルヘルパー関数群
 *
 * Firestore 非依存の純粋関数。
 * 参照: 03_DATA_MODEL_SPEC §5-3, 04_CALLABLE_API_SPEC §8
 */

export interface DeferredAttendance {
  attendanceId: string;
  paidInPaymentPeriodKey: string;
  paidInRunId: string;
  grossPayContribution: number;
}

export interface CarryOverItemInfo {
  attendanceId: string;
  originalPaymentPeriodKey: string;
  grossPayContribution: number;
}

/**
 * DeferredAttendance オブジェクトを構築する。
 */
export function buildDeferredAttendance(
  attendanceId: string,
  currentPeriodKey: string,
  runId: string,
  grossPayContribution: number
): DeferredAttendance {
  return {
    attendanceId,
    paidInPaymentPeriodKey: currentPeriodKey,
    paidInRunId: runId,
    grossPayContribution,
  };
}

/**
 * キャリーオーバー attendanceItems を元期間ごとにグルーピングする。
 * key: originalPaymentPeriodKey, value: CarryOverItemInfo[]
 */
export function groupCarryOverByOriginalPeriod(
  coItems: CarryOverItemInfo[]
): Map<string, CarryOverItemInfo[]> {
  const map = new Map<string, CarryOverItemInfo[]>();
  for (const item of coItems) {
    const key = item.originalPaymentPeriodKey;
    const arr = map.get(key) || [];
    arr.push(item);
    map.set(key, arr);
  }
  return map;
}

/**
 * attendance ID 配列を batchSize ごとのチャンクに分割する。
 */
export function chunkArray<T>(arr: T[], batchSize: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += batchSize) {
    chunks.push(arr.slice(i, i + batchSize));
  }
  return chunks;
}
