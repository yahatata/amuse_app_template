import * as admin from 'firebase-admin';
import { getYearMonthFromDateKey } from '../../shift/services/helpers';

const BLOCKING_SHIFT_REQUEST_STATUSES = [
  'pending',
  'interim_confirmed',
  'confirmed',
  'final_confirmed',
] as const;

export interface FutureScheduleBlockResult {
  blocked: boolean;
  shiftRequestCount: number;
  assignmentCount: number;
  samples: Array<{ kind: 'shiftRequest' | 'assignment'; dateKey: string }>;
}

function getYearMonthsForAssignmentScan(todayJst: string): string[] {
  const yearMonth = getYearMonthFromDateKey(todayJst);
  const [yearStr, monthStr] = yearMonth.split('-');
  let year = Number(yearStr);
  let month = Number(monthStr);
  const months: string[] = [];
  for (let i = 0; i < 3; i++) {
    months.push(`${year}-${String(month).padStart(2, '0')}`);
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return months;
}

export async function checkFutureStaffSchedule(
  staffId: string,
  todayJst: string
): Promise<FutureScheduleBlockResult> {
  const db = admin.firestore();
  const samples: FutureScheduleBlockResult['samples'] = [];
  let shiftRequestCount = 0;
  let assignmentCount = 0;

  const requestsSnapshot = await db
    .collection('shiftRequests')
    .where('staffId', '==', staffId)
    .where('status', 'in', [...BLOCKING_SHIFT_REQUEST_STATUSES])
    .get();

  for (const doc of requestsSnapshot.docs) {
    const dateKey = String(doc.data().dateKey ?? '');
    if (dateKey > todayJst) {
      shiftRequestCount += 1;
      if (samples.length < 5) {
        samples.push({ kind: 'shiftRequest', dateKey });
      }
    }
  }

  const yearMonths = getYearMonthsForAssignmentScan(todayJst);
  for (const yearMonth of yearMonths) {
    const daysSnapshot = await db.collection('shifts').doc(yearMonth).collection('days').get();
    for (const dayDoc of daysSnapshot.docs) {
      const dateKey = dayDoc.id;
      if (dateKey <= todayJst) {
        continue;
      }
      const assignments = (dayDoc.data().assignments as Array<{ staffId?: string }> | undefined) ?? [];
      const hasStaff = assignments.some(
        (assignment) => assignment.staffId != null && String(assignment.staffId) === staffId
      );
      if (hasStaff) {
        assignmentCount += 1;
        if (samples.length < 5) {
          samples.push({ kind: 'assignment', dateKey });
        }
      }
    }
  }

  return {
    blocked: shiftRequestCount > 0 || assignmentCount > 0,
    shiftRequestCount,
    assignmentCount,
    samples,
  };
}
