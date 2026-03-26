/**
 * storeMeta/currentBusinessDayから現在営業日を取得する
 *
 * @returns 現在営業日（YYYY-MM-DD形式）
 * @throws HttpsError 'failed-precondition' - state docが存在しない、またはstatusが'closed'/'error'でcurrentBusinessDateKeyがnullの場合
 */

import { getFirestore } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { logOpsError } from '../../../shared/logging/logOpsError';
import { generateJstDateKey } from '../../../shared/time';

const db = getFirestore();

/**
 * 出勤・退勤用の営業日を取得する。
 * status が running なら currentBusinessDateKey、そうでなければ JST 当日を返す。
 */
export async function getBusinessDateForAttendance(): Promise<string> {
  const docRef = db.collection('storeMeta').doc('currentBusinessDay');
  const doc = await docRef.get();
  if (!doc.exists || !doc.data()) {
    return generateJstDateKey();
  }
  const data = doc.data()!;
  if (data.status === 'running' && data.currentBusinessDateKey != null && typeof data.currentBusinessDateKey === 'string') {
    return data.currentBusinessDateKey.trim();
  }
  return generateJstDateKey();
}

/**
 * status !== running 時の表示用営業日を取得する。
 * lastClosedBusinessDateKey があればそれを返し、無い場合は当日（JST）を返す。
 * Phase4 01 決定10 対応。
 */
export async function getDisplayBusinessDateKeyForNonRunning(): Promise<string> {
  const docRef = db.collection('storeMeta').doc('currentBusinessDay');
  const doc = await docRef.get();
  if (!doc.exists || !doc.data()) {
    return generateJstDateKey();
  }
  const data = doc.data()!;
  const lastClosed = data.lastClosedBusinessDateKey;
  if (lastClosed != null && typeof lastClosed === 'string' && lastClosed.trim() !== '') {
    return lastClosed.trim();
  }
  return generateJstDateKey();
}

/**
 * status !== running 時のシフト一覧用営業日を取得する。
 * lastClosedBusinessDateKey の翌日を返す。無い場合は JST 翌日を返す。
 * Phase4 01 CHANGESPEC 6-4 対応。
 */
export async function getShiftDateKeyForNonRunning(): Promise<string> {
  const baseDate = await getDisplayBusinessDateKeyForNonRunning();
  return addDaysToDateKey(baseDate, 1);
}

/**
 * 日付キー（YYYY-MM-DD）に日数を加算する。
 */
function addDaysToDateKey(dateKey: string, days: number): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + days);
  const yy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

export async function getCurrentBusinessDateKeyOrThrow(): Promise<string> {
  try {
    const docRef = db.collection('storeMeta').doc('currentBusinessDay');
    const doc = await docRef.get();

    if (!doc.exists) {
      throw new HttpsError(
        'failed-precondition',
        'storeMeta/currentBusinessDay document does not exist. Please run initialization script.'
      );
    }

    const data = doc.data();
    if (!data) {
      throw new HttpsError(
        'failed-precondition',
        'storeMeta/currentBusinessDay document exists but has no data.'
      );
    }

    const status = data.status;
    const currentBusinessDateKey = data.currentBusinessDateKey;

    if (status === 'running' && currentBusinessDateKey !== null && typeof currentBusinessDateKey === 'string') {
      return currentBusinessDateKey;
    }

    throw new HttpsError(
      'failed-precondition',
      `Store is not running. Current status: ${status}, currentBusinessDateKey: ${currentBusinessDateKey}`
    );
  } catch (error) {
    if (error instanceof HttpsError) {
      throw error;
    }

    logOpsError({
      message: 'getCurrentBusinessDateKeyOrThrow failed',
      failureType: 'datastore',
      functionEntry: 'getCurrentBusinessDateKeyOrThrow',
      cause: error,
    });
    throw new HttpsError(
      'internal',
      `Failed to get current business date key: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
