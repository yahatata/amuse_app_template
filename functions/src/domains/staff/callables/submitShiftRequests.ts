/**
 * 正式スタッフ希望シフト一括提出 Callable（L6-A）
 *
 * - create + pending update を 1 transaction（all-or-none）
 * - clientNonce / fingerprint / reused / conflict
 * - auth.uid 固定（client staffId/userId 拒否）
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logOpsError, logOpsSuccess } from '../../../shared/logging/logOpsError';
import { getShiftErrorKeyFromUnknown, throwShiftHttpsError } from '../helpers/shiftHttpsError';
import {
  executeSubmitShiftRequestsAtomic,
  parseSubmitShiftRequestsInput,
} from '../helpers/submitShiftRequestsAtomic';
import { shortShiftNonceTrace } from '../helpers/shiftSubmitNonce';

export interface SubmitShiftRequestsResponse {
  success: true;
  data: {
    clientNonce: string;
    reused: boolean;
    yearMonth: string;
    submittedCount: number;
    createdCount: number;
    updatedCount: number;
    requests: Array<{
      requestId: string;
      dateKey: string;
      status: 'pending';
      startMinute: number;
      endMinute: number;
    }>;
  };
}

export const submitShiftRequests = onCall(
  async (request): Promise<SubmitShiftRequestsResponse> => {
    if (!request.auth) {
      throwShiftHttpsError(
        'unauthenticated',
        'SHIFT_UNAUTHENTICATED',
        'Authentication required',
      );
    }

    const uid = request.auth.uid;
    let clientNonceTrace = 'n/a';

    try {
      const { clientNonce, rawShifts } = parseSubmitShiftRequestsInput(request.data);
      clientNonceTrace = shortShiftNonceTrace(clientNonce);

      const data = await executeSubmitShiftRequestsAtomic({
        uid,
        clientNonce,
        rawShifts,
      });

      logOpsSuccess({
        message: 'submitShiftRequests 成功',
        functionEntry: 'submitShiftRequests',
        context: {
          nonceTrace: clientNonceTrace,
          reused: data.reused,
          submittedCount: data.submittedCount,
          createdCount: data.createdCount,
          updatedCount: data.updatedCount,
          yearMonth: data.yearMonth,
        },
      });

      return {
        success: true,
        data: {
          clientNonce: data.clientNonce,
          reused: data.reused,
          yearMonth: data.yearMonth,
          submittedCount: data.submittedCount,
          createdCount: data.createdCount,
          updatedCount: data.updatedCount,
          requests: data.requests,
        },
      };
    } catch (error) {
      const errorKey = getShiftErrorKeyFromUnknown(error);
      // 業務 HttpsError（errorKey 付き）は二重 log しない
      if (!(error instanceof HttpsError && errorKey)) {
        logOpsError({
          message: 'submitShiftRequests 失敗',
          functionEntry: 'submitShiftRequests',
          cause: error,
          context: { nonceTrace: clientNonceTrace },
        });
      }

      if (error instanceof HttpsError) {
        throw error;
      }

      throwShiftHttpsError(
        'internal',
        'SHIFT_INTERNAL_ERROR',
        'Shift submit failed',
      );
    }
  },
);
