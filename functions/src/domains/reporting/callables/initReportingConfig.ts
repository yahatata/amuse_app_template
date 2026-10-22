import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';

import { logOpsError, logOpsSuccess } from '../../../shared/logging/logOpsError';
import { DEFAULT_TAX_REPORTING_BEHAVIOR } from '../config/defaults';

export const initReportingConfig = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Authentication required');
  }

  const db = getFirestore();

  try {
    const behaviorRef = db.collection('storeMeta').doc('taxReportingBehavior');
    const groupRef = db.collection('storeMeta').doc('reportingGroupConfig');

    const [behaviorDoc, groupDoc] = await Promise.all([
      behaviorRef.get(),
      groupRef.get(),
    ]);

    const tasks: Promise<unknown>[] = [];

    if (!behaviorDoc.exists) {
      tasks.push(
        behaviorRef.set({
          ...DEFAULT_TAX_REPORTING_BEHAVIOR,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        }),
      );
    }

    if (!groupDoc.exists) {
      tasks.push(
        groupRef.set({
          groups: [],
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        }),
      );
    }

    await Promise.all(tasks);

    const taxReportingBehaviorResult = behaviorDoc.exists ? 'skipped' : 'created';
    const reportingGroupConfigResult = groupDoc.exists ? 'skipped' : 'created';

    logOpsSuccess({
      message: 'initReportingConfig callable 成功',
      functionEntry: 'initReportingConfig',
      operation: 'callable',
      context: {
        taxReportingBehavior: taxReportingBehaviorResult,
        reportingGroupConfig: reportingGroupConfigResult,
      },
    });

    return {
      success: true,
      taxReportingBehavior: taxReportingBehaviorResult,
      reportingGroupConfig: reportingGroupConfigResult,
      message: [
        `taxReportingBehavior: ${taxReportingBehaviorResult}`,
        `reportingGroupConfig: ${reportingGroupConfigResult}`,
      ].join(', '),
    };
  } catch (error) {
    logOpsError({
      message: 'initReportingConfig callable failed',
      functionEntry: 'initReportingConfig',
      operation: 'callable',
      cause: error,
    });

    if (error instanceof HttpsError) {
      throw error;
    }
    throw new HttpsError(
      'internal',
      `initReportingConfig failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
});
