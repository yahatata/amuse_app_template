/**
 * LIFF スタッフ初回登録
 *
 * - request.auth.uid 固定（staffs/{uid}）
 * - clientNonce 必須
 * - active 既存 → alreadyRegistered（writeなし）
 * - retired 既存 → STAFF_REACTIVATION_REQUIRED（writeなし）
 * - 同一 nonce 再送 → reused
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logOpsError, logOpsSuccess } from '../../../shared/logging/logOpsError';
import {
  getStaffErrorKeyFromUnknown,
  throwStaffHttpsError,
} from '../helpers/staffHttpsError';
import {
  CREATE_STAFF_ACCOUNT_OPERATION,
  shortNonceTrace,
  validateStaffClientNonce,
  validateStaffRegistrationPii,
} from '../helpers/staffClientNonce';
import {
  executeCreateStaffAccountAtomic,
  toCallableStaffMutationResponse,
} from '../helpers/staffAccountMutationAtomic';

export const createStaffAccount = onCall(async (request) => {
  try {
    if (!request.auth) {
      throwStaffHttpsError('unauthenticated', 'STAFF_UNAUTHENTICATED', 'Authentication required');
    }

    const uid = request.auth.uid;
    const clientNonce = validateStaffClientNonce(
      request.data?.clientNonce,
      'STAFF_REGISTRATION_NONCE_REQUIRED',
    );
    const pii = validateStaffRegistrationPii(request.data || {});

    const data = await executeCreateStaffAccountAtomic({
      uid,
      clientNonce,
      pii,
    });

    // リッチメニューは正本外（best-effort）
    if (!data.reused && !data.alreadyRegistered) {
      try {
        const { linkStaffRichMenu } = await import('../../webhook/services/lineRichMenu');
        await linkStaffRichMenu(uid);
      } catch (richMenuError) {
        logOpsError({
          message: 'createStaffAccount rich menu link failed (non-fatal)',
          functionEntry: 'createStaffAccount',
          operation: 'linkStaffRichMenu',
          cause: richMenuError,
          context: { nonceTrace: shortNonceTrace(clientNonce) },
        });
      }
    }

    logOpsSuccess({
      message: 'createStaffAccount 成功',
      functionEntry: 'createStaffAccount',
      operation: 'createStaffAccountCallable',
      context: {
        operation: CREATE_STAFF_ACCOUNT_OPERATION,
        reused: data.reused,
        alreadyRegistered: data.alreadyRegistered,
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
        message: 'createStaffAccount failed',
        functionEntry: 'createStaffAccount',
        operation: 'createStaffHttpsError',
        cause: error,
        context: { errorKey: errorKey || null, code: error.code },
      });
      throw error;
    }

    logOpsError({
      message: 'createStaffAccount unexpected error',
      functionEntry: 'createStaffAccount',
      operation: 'createStaffCatch',
      cause: error,
    });
    throwStaffHttpsError('internal', 'STAFF_INTERNAL_ERROR', 'Staff registration failed');
  }
});
