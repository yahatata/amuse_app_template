/**
 * 退職済みスタッフの LIFF 再登録（retired → active）
 *
 * - request.auth.uid 固定
 * - clientNonce 必須
 * - 同一 nonce 成功再送 → reused（STAFF_NOT_RETIRED より先に確認）
 * - active + 新 nonce → STAFF_NOT_RETIRED
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logOpsError, logOpsSuccess } from '../../../shared/logging/logOpsError';
import {
  getStaffErrorKeyFromUnknown,
  throwStaffHttpsError,
} from '../helpers/staffHttpsError';
import {
  REACTIVATE_STAFF_ACCOUNT_OPERATION,
  shortNonceTrace,
  validateStaffClientNonce,
  validateStaffRegistrationPii,
} from '../helpers/staffClientNonce';
import {
  executeReactivateStaffAccountAtomic,
  toCallableStaffMutationResponse,
} from '../helpers/staffAccountMutationAtomic';

export const reactivateStaffAccount = onCall(async (request) => {
  try {
    if (!request.auth) {
      throwStaffHttpsError('unauthenticated', 'STAFF_UNAUTHENTICATED', 'Authentication required');
    }

    const uid = request.auth.uid;
    const clientNonce = validateStaffClientNonce(
      request.data?.clientNonce,
      'STAFF_REACTIVATION_NONCE_REQUIRED',
    );
    const pii = validateStaffRegistrationPii(request.data || {});

    const data = await executeReactivateStaffAccountAtomic({
      uid,
      clientNonce,
      pii,
    });

    if (!data.reused) {
      try {
        const { linkStaffRichMenu } = await import('../../webhook/services/lineRichMenu');
        await linkStaffRichMenu(uid);
      } catch (richMenuError) {
        logOpsError({
          message: 'reactivateStaffAccount rich menu link failed (non-fatal)',
          functionEntry: 'reactivateStaffAccount',
          operation: 'linkStaffRichMenu',
          cause: richMenuError,
          context: { nonceTrace: shortNonceTrace(clientNonce) },
        });
      }
    }

    logOpsSuccess({
      message: 'reactivateStaffAccount 成功',
      functionEntry: 'reactivateStaffAccount',
      operation: 'reactivateStaffAccountCallable',
      context: {
        operation: REACTIVATE_STAFF_ACCOUNT_OPERATION,
        reused: data.reused,
        nonceTrace: shortNonceTrace(clientNonce),
      },
    });

    return toCallableStaffMutationResponse(data);
  } catch (error) {
    if (error instanceof HttpsError) {
      const errorKey = getStaffErrorKeyFromUnknown(error);
      if (
        errorKey &&
        errorKey !== 'STAFF_INTERNAL_ERROR' &&
        error.code !== 'internal'
      ) {
        throw error;
      }
      logOpsError({
        message: 'reactivateStaffAccount failed',
        functionEntry: 'reactivateStaffAccount',
        operation: 'reactivateStaffHttpsError',
        cause: error,
        context: { errorKey: errorKey || null, code: error.code },
      });
      throw error;
    }

    logOpsError({
      message: 'reactivateStaffAccount unexpected error',
      functionEntry: 'reactivateStaffAccount',
      operation: 'reactivateStaffCatch',
      cause: error,
    });
    throwStaffHttpsError('internal', 'STAFF_INTERNAL_ERROR', 'Staff reactivation failed');
  }
});
