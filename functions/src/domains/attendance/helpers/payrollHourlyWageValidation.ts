/**
 * 給与計算対象 staff の hourlyWage 検証
 *
 * missing / null / 非 number / 非 finite を未設定扱いとする。
 * explicit 0 は設定済みとみなす。
 */

import { throwPayrollHttpsError } from './payrollHttpsError';

export const PAYROLL_HOURLY_WAGE_MISSING_ERROR_KEY = 'PAYROLL_HOURLY_WAGE_MISSING';

export interface WageMissingStaffEntry {
  staffId: string;
  staffName: string;
}

/** staffs ドキュメント data が給与計算可能な時給を持つか */
export function isHourlyWageConfigured(
  staffData: Record<string, unknown> | undefined | null
): boolean {
  if (!staffData) return false;
  if (!Object.prototype.hasOwnProperty.call(staffData, 'hourlyWage')) return false;
  const wage = staffData.hourlyWage;
  if (wage === null || wage === undefined) return false;
  if (typeof wage !== 'number') return false;
  return Number.isFinite(wage);
}

/** staffId 一覧から未設定 staff を staff 単位で返す（重複排除・名前順） */
export function findWageMissingStaff(params: {
  staffIds: string[];
  staffDocsById: Map<string, Record<string, unknown>>;
  staffNameFallback?: Map<string, string>;
}): WageMissingStaffEntry[] {
  const { staffIds, staffDocsById, staffNameFallback } = params;
  const missing: WageMissingStaffEntry[] = [];
  const seen = new Set<string>();

  for (const staffId of staffIds) {
    if (!staffId || seen.has(staffId)) continue;
    seen.add(staffId);

    const staffData = staffDocsById.get(staffId);
    if (isHourlyWageConfigured(staffData)) continue;

    const fullName =
      typeof staffData?.fullName === 'string' && staffData.fullName.trim()
        ? staffData.fullName.trim()
        : staffNameFallback?.get(staffId)?.trim() || '不明';

    missing.push({ staffId, staffName: fullName });
  }

  return missing.sort((a, b) => a.staffName.localeCompare(b.staffName, 'ja'));
}

/** 未設定 staff がいれば payroll run 開始前に reject */
export function assertNoHourlyWageMissingStaff(missing: WageMissingStaffEntry[]): void {
  if (missing.length === 0) return;

  throwPayrollHttpsError(
    'failed-precondition',
    PAYROLL_HOURLY_WAGE_MISSING_ERROR_KEY,
    'hourly wage missing for payroll run target staff',
    {
      staffIds: missing.map((m) => m.staffId),
      staffNames: missing.map((m) => m.staffName),
    }
  );
}

/** Firestore batch get 結果を Map に変換 */
export function staffDocsToMap(
  docs: Array<{ id: string; exists: boolean; data: () => Record<string, unknown> | undefined }>
): Map<string, Record<string, unknown>> {
  const map = new Map<string, Record<string, unknown>>();
  for (const doc of docs) {
    if (doc.exists) {
      const data = doc.data();
      if (data) map.set(doc.id, data);
    }
  }
  return map;
}
