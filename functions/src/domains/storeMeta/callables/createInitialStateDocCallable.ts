/**
 * 一時的な初期ドキュメント作成関数
 * 初期化後に削除することを推奨
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { logOpsError, logOpsSuccess } from '../../../shared/logging/logOpsError';

const db = getFirestore();

export const createInitialStateDocCallable = onCall(
  {
    region: 'asia-northeast1',
  },
  async (request) => {
    try {
      const docRef = db.collection('storeMeta').doc('currentBusinessDay');
      const doc = await docRef.get();

      if (doc.exists) {
        logOpsSuccess({
          message: 'createInitialStateDocCallable 成功',
          functionEntry: 'createInitialStateDocCallable',
          operation: 'createInitialStateDoc',
          context: { docPath: 'storeMeta/currentBusinessDay', alreadyExists: true },
        });

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
        closeAssessment: null,
        openAssessment: null,
        manualOverrides: null,
        manualOverride: null,
      };

      await docRef.set(initialState);
      logOpsSuccess({
        message: 'createInitialStateDocCallable 成功',
        functionEntry: 'createInitialStateDocCallable',
        operation: 'createInitialStateDoc',
        context: { docPath: 'storeMeta/currentBusinessDay', alreadyExists: false },
      });

      return {
        success: true,
        message: 'storeMeta/currentBusinessDay document created successfully.',
        exists: false,
      };
    } catch (error) {
      logOpsError({
        message: 'createInitialStateDocCallable failed',
        functionEntry: 'createInitialStateDocCallable',
        operation: 'createInitialStateDoc',
        cause: error,
        sourceProductHint: 'firestore',
        context: { docPath: 'storeMeta/currentBusinessDay' },
      });
      throw new HttpsError(
        'internal',
        `Failed to create initial state doc: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
);
