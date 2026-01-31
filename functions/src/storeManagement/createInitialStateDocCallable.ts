/**
 * 一時的な初期ドキュメント作成関数
 * 初期化後に削除することを推奨
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const db = getFirestore();

export const createInitialStateDocCallable = onCall(
  {
    region: 'us-central1',
  },
  async (request) => {
    try {
      const docRef = db.collection('storeMeta').doc('currentBusinessDay');
      const doc = await docRef.get();

      if (doc.exists) {
        return {
          success: true,
          message: 'storeMeta/currentBusinessDay document already exists.',
          exists: true,
        };
      }

      const initialState = {
        status: 'closed' as const,
        currentBusinessDateKey: null,
        lastClosedBusinessDateKey: null,
        updatedAt: FieldValue.serverTimestamp(),
        source: 'initial',
        lastError: null,
      };

      await docRef.set(initialState);

      return {
        success: true,
        message: 'storeMeta/currentBusinessDay document created successfully.',
        exists: false,
      };
    } catch (error) {
      throw new HttpsError(
        'internal',
        `Failed to create initial state doc: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
);
