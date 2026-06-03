/**
 * storeMeta/currentBusinessDayから現在営業日を取得する
 *
 * @returns 現在営業日（YYYY-MM-DD形式）
 * @throws HttpsError 'failed-precondition' - state docが存在しない、またはstatusが'closed'/'error'でcurrentBusinessDateKeyがnullの場合
 */

import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { logOpsError, logOpsSuccess } from '../../../shared/logging/logOpsError';
import { FunctionCustomError } from '../../../shared/logging/functionCustomError';
import { generateJstDateKey } from '../../../shared/time';

/**
 * 出勤・退勤用の営業日を取得する。
 * status が running なら currentBusinessDateKey、そうでなければ JST 当日を返す。
 */
export async function getBusinessDateForAttendance(db?: Firestore): Promise<string> {
  const firestore = db ?? getFirestore();
  const docRef = firestore.collection('storeMeta').doc('currentBusinessDay');
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
export async function getDisplayBusinessDateKeyForNonRunning(db?: Firestore): Promise<string> {
  const firestore = db ?? getFirestore();
  const docRef = firestore.collection('storeMeta').doc('currentBusinessDay');
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

export async function getCurrentBusinessDateKeyOrThrow(db?: Firestore): Promise<string> {
  try {
    const firestore = db ?? getFirestore();
    const docRef = firestore.collection('storeMeta').doc('currentBusinessDay');
    const doc = await docRef.get();

    if (!doc.exists) {
      throw new FunctionCustomError({
        errorKey: 'STORE_STATE_DOC_MISSING',
        message:
          'storeMeta/currentBusinessDay document does not exist. Please run initialization script.',
        context: { reason: 'doc_missing' },
      });
    }

    const data = doc.data();
    if (!data) {
      throw new FunctionCustomError({
        errorKey: 'STORE_INVALID_STATE',
        message: 'storeMeta/currentBusinessDay document exists but has no data.',
        context: { reason: 'empty_data' },
      });
    }

    const status = data.status;
    const currentBusinessDateKey = data.currentBusinessDateKey;

    if (status === 'running' && currentBusinessDateKey !== null && typeof currentBusinessDateKey === 'string') {
      logOpsSuccess({
        message: 'getCurrentBusinessDateKeyOrThrow 成功',
        functionEntry: 'getCurrentBusinessDateKeyOrThrow',
        operation: 'loadFirestoreStateDoc',
        context: { status, currentBusinessDateKey },
      });

      return currentBusinessDateKey;
    }

    throw new FunctionCustomError({
      errorKey: 'STORE_BUSINESS_DATE_UNAVAILABLE',
      message: `Store is not running. Current status: ${status}, currentBusinessDateKey: ${currentBusinessDateKey}`,
      context: { status, currentBusinessDateKey },
    });
  } catch (error) {
    if (error instanceof FunctionCustomError) {
      throw error;
    }
    if (error instanceof HttpsError) {
      throw error;
    }

    logOpsError({
      message: 'getCurrentBusinessDateKeyOrThrow failed',
      functionEntry: 'getCurrentBusinessDateKeyOrThrow',
      operation: 'loadFirestoreStateDoc',
      cause: error,
      sourceProductHint: 'firestore',
      context: { docPath: 'storeMeta/currentBusinessDay' },
    });
    throw new HttpsError(
      'internal',
      `Failed to get current business date key: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
