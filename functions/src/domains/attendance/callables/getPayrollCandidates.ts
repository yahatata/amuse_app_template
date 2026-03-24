/**
 * getPayrollCandidates Callable
 *
 * 指定期間の給与計算対象 attendance を group1/2/3 に分類して返す。
 *
 * 参照: 04_CALLABLE_API_SPEC セクション 2
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import type { CallableRequest } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import type { Timestamp } from 'firebase-admin/firestore';

import { getCallerDeviceByUid, isActive } from '../../../shared/devices';
import { getPayrollConfig } from '../../../shared/config/payrollConfigLoader';
import { PAYROLL_ERRORS } from '../helpers/payrollErrors';
import type { CandidateReasonType } from '../types/payrollCalcTypes';

const PERIOD_KEY_REGEX = /^\d{4}-\d{2}-\d{2}_\d{4}-\d{2}-\d{2}$/;

const TARGET_STATUSES = ['unreflected', 'corrected_after_reflection'];

export interface CandidateEntry {
  attendanceId: string;
  staffId: string;
  staffName: string;
  date: string;
  weekday: number;
  clockIn: string;
  clockOut: string | null;
  actualWorkMinutes: number | null;
  nightWorkMinutes: number | null;
  reasonType: CandidateReasonType;
  reasonLabel: string;
  isDeleted: boolean;
  payrollStatus: string;
  paymentPeriodKey: string;
}

export interface GetPayrollCandidatesResponse {
  periodStart: string;
  periodEnd: string;
  group1: CandidateEntry[];
  group2: CandidateEntry[];
  group3: CandidateEntry[];
}

/** Firestore Timestamp → ISO string */
function toISOString(ts: Timestamp | null | undefined): string | null {
  if (!ts || typeof ts.toDate !== 'function') return null;
  return ts.toDate().toISOString();
}

/** attendance doc data → CandidateEntry */
export function buildEntry(
  docId: string,
  data: Record<string, unknown>,
  reasonType: CandidateReasonType,
  reasonLabel: string
): CandidateEntry {
  return {
    attendanceId: docId,
    staffId: (data.staffId as string) ?? '',
    staffName: (data.staffsFullName as string) ?? '',
    date: (data.date as string) ?? '',
    weekday: (data.weekday as number) ?? 0,
    clockIn: toISOString(data.clockIn as Timestamp | null) ?? '',
    clockOut: toISOString(data.clockOut as Timestamp | null),
    actualWorkMinutes: (data.actualWorkMinutes as number) ?? null,
    nightWorkMinutes: (data.nightWorkMinutes as number) ?? null,
    reasonType,
    reasonLabel,
    isDeleted: (data.isDeleted as boolean) ?? false,
    payrollStatus: (data.payrollStatus as string) ?? 'unreflected',
    paymentPeriodKey: (data.paymentPeriodKey as string) ?? '',
  };
}

/**
 * attendance ドキュメント群を group1/2/3 に分類する。
 * Firestore 非依存のため単体テスト可能。
 */
export interface AttendanceDoc {
  id: string;
  data: Record<string, unknown>;
}

export function classifyCandidates(
  inPeriodDocs: AttendanceDoc[],
  unreflectedDocs: AttendanceDoc[],
  paymentPeriodKey: string,
  periodEnd: string,
  maxCount: number
): { group1: CandidateEntry[]; group2: CandidateEntry[]; group3: CandidateEntry[] } {
  const group1: CandidateEntry[] = [];
  const group2: CandidateEntry[] = [];
  const group3: CandidateEntry[] = [];

  const inPeriodIds = new Set<string>();

  for (const doc of inPeriodDocs) {
    const data = doc.data;
    inPeriodIds.add(doc.id);

    const clockOut = data.clockOut;
    const isDeleted = data.isDeleted === true;
    const payrollStatus = data.payrollStatus as string | undefined;

    if (!clockOut || isDeleted) {
      group3.push(buildEntry(doc.id, data, 'other', isDeleted ? '論理削除' : '未退勤'));
      continue;
    }

    if (TARGET_STATUSES.includes(payrollStatus ?? '')) {
      group1.push(buildEntry(doc.id, data, 'in_period', '期間内'));
    }
  }

  for (const doc of unreflectedDocs) {
    if (inPeriodIds.has(doc.id)) continue;

    const data = doc.data;
    const isDeleted = data.isDeleted === true;
    const clockOut = data.clockOut;

    if (isDeleted || !clockOut) continue;

    const docDate = data.date as string | undefined;
    if (docDate && docDate > periodEnd) continue;

    group2.push(buildEntry(doc.id, data, 'carry_over', 'キャリーオーバー'));
  }

  applyMaxCountLimit(group1, group2, group3, maxCount);

  return { group1, group2, group3 };
}

/**
 * 合計件数が maxCount を超える場合、group3 → group2 → group1 の優先度で末尾を切り詰める。
 * 仕様: 返却順序 group3 → group2 → group1（group3 が最も優先度が低い）
 */
export function applyMaxCountLimit(
  group1: CandidateEntry[],
  group2: CandidateEntry[],
  group3: CandidateEntry[],
  maxCount: number
): void {
  const total = group1.length + group2.length + group3.length;
  if (total <= maxCount) return;

  let excess = total - maxCount;

  const g3Cut = Math.min(group3.length, excess);
  group3.splice(group3.length - g3Cut, g3Cut);
  excess -= g3Cut;
  if (excess <= 0) return;

  const g2Cut = Math.min(group2.length, excess);
  group2.splice(group2.length - g2Cut, g2Cut);
  excess -= g2Cut;
  if (excess <= 0) return;

  group1.splice(group1.length - excess, excess);
}

export const getPayrollCandidates = onCall(async (request: CallableRequest) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', '認証が必要です');
  }

  const callerUid = request.auth.uid;
  const device = await getCallerDeviceByUid(callerUid);
  if (!device || !isActive(device.status)) {
    throw new HttpsError('permission-denied', 'デバイスが見つからないか、アクティブではありません');
  }
  if (device.role !== 'admin') {
    throw new HttpsError('permission-denied', '管理者のみ実行できます');
  }

  const { paymentPeriodKey } = request.data as { paymentPeriodKey?: string };
  if (!paymentPeriodKey || !PERIOD_KEY_REGEX.test(paymentPeriodKey)) {
    throw new HttpsError('invalid-argument', 'paymentPeriodKey の形式が不正です（YYYY-MM-DD_YYYY-MM-DD）');
  }

  const [periodStart, periodEnd] = paymentPeriodKey.split('_');

  let payrollConfig;
  try {
    payrollConfig = await getPayrollConfig();
  } catch {
    throw new HttpsError('not-found', PAYROLL_ERRORS.PAYROLL_CONFIG_NOT_FOUND);
  }
  const maxCount = payrollConfig.maxCandidatesCount;

  const db = getFirestore();
  const attendancesRef = db.collection('attendances');

  const [inPeriodSnap, unreflectedSnap] = await Promise.all([
    attendancesRef
      .where('paymentPeriodKey', '==', paymentPeriodKey)
      .get(),
    attendancesRef
      .where('payrollStatus', 'in', TARGET_STATUSES)
      .get(),
  ]);

  const inPeriodDocs: AttendanceDoc[] = inPeriodSnap.docs.map(d => ({
    id: d.id,
    data: d.data(),
  }));
  const unreflectedDocs: AttendanceDoc[] = unreflectedSnap.docs.map(d => ({
    id: d.id,
    data: d.data(),
  }));

  const { group1, group2, group3 } = classifyCandidates(
    inPeriodDocs,
    unreflectedDocs,
    paymentPeriodKey,
    periodEnd,
    maxCount
  );

  const response: GetPayrollCandidatesResponse = {
    periodStart,
    periodEnd,
    group1,
    group2,
    group3,
  };

  return response;
});
