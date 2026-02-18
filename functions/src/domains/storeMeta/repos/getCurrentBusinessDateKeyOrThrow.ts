/**
 * storeMeta/currentBusinessDayから現在営業日を取得する
 * 
 * @returns 現在営業日（YYYY-MM-DD形式）
 * @throws HttpsError 'failed-precondition' - state docが存在しない、またはstatusが'closed'/'error'でcurrentBusinessDateKeyがnullの場合
 */

import { getFirestore } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';

const db = getFirestore();

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

    logger.error('getCurrentBusinessDateKeyOrThrow failed', { error });
    throw new HttpsError(
      'internal',
      `Failed to get current business date key: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
