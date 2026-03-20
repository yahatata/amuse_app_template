/**
 * attendanceLogs への書き込みヘルパー
 *
 * Phase4.1: 監査ログ基盤。attendance の生成・更新を行う関数でログを残す。
 * 参照: Flow1_DETAILED_SPEC セクション 3
 */

import type { Firestore } from 'firebase-admin/firestore';
import { FieldValue } from 'firebase-admin/firestore';

export type AttendanceLogParams = {
  db: Firestore;
  attendanceId: string;
  actionType: string;
  performedByUid?: string | null;
  performedByDeviceId?: string | null;
};

/**
 * attendanceLogs コレクションにログを 1 件追加する
 */
export async function writeAttendanceLog(params: AttendanceLogParams): Promise<void> {
  const { db, attendanceId, actionType, performedByUid, performedByDeviceId } = params;
  await db.collection('attendanceLogs').add({
    attendanceId,
    actionType,
    performedAt: FieldValue.serverTimestamp(),
    performedByUid: performedByUid ?? null,
    performedByDeviceId: performedByDeviceId ?? null,
  });
}
