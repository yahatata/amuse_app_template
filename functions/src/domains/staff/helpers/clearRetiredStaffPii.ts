import * as admin from 'firebase-admin';

export const RETIRED_STAFF_PII_FIELDS = [
  'email',
  'phoneNumber',
  'birthMonthDay',
  'loginId',
  'qrCodeUrl',
  'qrExpiresAt',
  'qrExpiresAtMs',
  'StaffName',
  'StaffFullName',
  'StaffFullNameKana',
] as const;

export type RetiredStaffPiiField = (typeof RETIRED_STAFF_PII_FIELDS)[number];

/** 退職時に FieldValue.delete() で削除するフィールドの更新オブジェクト */
export function buildRetiredStaffPiiDeletes(): Record<string, admin.firestore.FieldValue> {
  const updates: Record<string, admin.firestore.FieldValue> = {};
  for (const field of RETIRED_STAFF_PII_FIELDS) {
    updates[field] = admin.firestore.FieldValue.delete();
  }
  return updates;
}
