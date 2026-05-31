import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';

import { logOpsError, logOpsSuccess } from '../../../shared/logging/logOpsError';
import { rebuildReportingMonthly as rebuildMonthly } from '../services/monthlyRebuilder';

export const rebuildReportingMonthlyCallable = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Authentication required');
  }

  const monthKey = request.data?.monthKey;
  if (!monthKey || typeof monthKey !== 'string' || !/^\d{6}$/.test(monthKey)) {
    throw new HttpsError('invalid-argument', 'monthKey must be a 6-digit string (yyyyMM)');
  }

  const db = getFirestore();

  try {
    const result = await rebuildMonthly(db, monthKey);

    logOpsSuccess({
      message: 'rebuildReportingMonthly 成功',
      functionEntry: 'rebuildReportingMonthlyCallable',
      operation: 'callable',
      context: {
        monthKey,
        totalEntriesProcessed: result.totalEntriesProcessed,
        totalAmountIncl: result.totalAmountIncl,
      },
    });

    return {
      success: true,
      ...result,
    };
  } catch (error) {
    logOpsError({
      message: 'rebuildReportingMonthly failed',
      functionEntry: 'rebuildReportingMonthlyCallable',
      operation: 'callable',
      cause: error,
      context: { monthKey },
    });

    if (error instanceof HttpsError) {
      throw error;
    }
    throw new HttpsError(
      'internal',
      `rebuildReportingMonthly failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
});
