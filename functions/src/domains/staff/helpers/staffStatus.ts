import { HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import type { DocumentData, DocumentSnapshot } from 'firebase-admin/firestore';
import type { StaffStatus } from '../types/staffStatus';

const STAFF_RETIRED_MESSAGE = '退職済みのため、この操作は利用できません。';

/** status 未設定 doc は active とみなす（移行期間） */
export function normalizeStaffStatus(data: DocumentData | undefined): StaffStatus {
  if (data?.status === 'retired') {
    return 'retired';
  }
  return 'active';
}

export function isActiveStaff(data: DocumentData | undefined): boolean {
  return normalizeStaffStatus(data) === 'active';
}

export async function getStaffStatus(staffId: string): Promise<StaffStatus | 'not_found'> {
  const snap = await admin.firestore().collection('staffs').doc(staffId).get();
  if (!snap.exists) {
    return 'not_found';
  }
  return normalizeStaffStatus(snap.data());
}

/** retired / not_found 時は HttpsError(STAFF_RETIRED or STAFF_NOT_ACTIVE) */
export async function assertActiveStaff(staffId: string): Promise<DocumentSnapshot> {
  const snap = await admin.firestore().collection('staffs').doc(staffId).get();
  if (!snap.exists) {
    throw new HttpsError('permission-denied', STAFF_RETIRED_MESSAGE, {
      errorKey: 'STAFF_NOT_ACTIVE',
    });
  }
  if (normalizeStaffStatus(snap.data()) === 'retired') {
    throw new HttpsError('permission-denied', STAFF_RETIRED_MESSAGE, {
      errorKey: 'STAFF_RETIRED',
    });
  }
  return snap;
}
