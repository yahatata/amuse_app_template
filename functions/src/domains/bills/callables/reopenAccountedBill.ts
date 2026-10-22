/**
 * reopenAccountedBill callable（Step05 changeSpec §5.1）。
 *
 * 仕様書 05_reopenと再会計.md の reopen 入口 API。
 * 旧 `postEventReopen` callable（events 経路）と差別化する新エントリ。
 */

import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { z } from 'zod';
import * as crypto from 'crypto';

import {
  getCallerDeviceByUid,
  hasRequiredOption,
  isActive,
} from '../../../shared/devices';
import { logOpsError } from '../../../shared/logging/logOpsError';
import {
  reopenAccountedBill as reopenAccountedBillRepo,
  ReopenAccountedBillRequest,
  ReopenAccountedBillResponse,
} from '../repos/reopenAccountedBill';

const RequestSchema = z.object({
  billId: z.string().min(1, 'billId は必須です'),
  idempotencyKey: z.string().min(1).optional(),
  clientNonce: z.string().min(1).optional(),
  reason: z.string().nullable().optional(),
});

export const reopenAccountedBill = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', '認証が必要です');
  }
  const adminId = request.auth.uid;

  try {
    const device = await getCallerDeviceByUid(adminId);
    if (!device || !isActive(device.status)) {
      throw new HttpsError(
        'permission-denied',
        'デバイスが見つからないか、アクティブではありません'
      );
    }

    const hasPermission =
      device.role === 'admin' || hasRequiredOption(device.options, 'accounting');
    if (!hasPermission) {
      throw new HttpsError('permission-denied', '会計管理の権限がありません');
    }

    let validated: z.infer<typeof RequestSchema>;
    try {
      validated = RequestSchema.parse(request.data);
    } catch (zodError) {
      throw new HttpsError(
        'invalid-argument',
        zodError instanceof Error ? zodError.message : 'invalid request payload'
      );
    }

    const { billId, idempotencyKey: providedIdempotencyKey, clientNonce, reason } = validated;

    const idempotencyKey =
      providedIdempotencyKey ??
      `${billId}:reopenAccountedBill:${clientNonce ?? crypto.randomUUID()}`;

    const repoRequest: ReopenAccountedBillRequest = {
      billId,
      idempotencyKey,
      reason: reason ?? null,
      reopenedBy: adminId,
    };

    const result: ReopenAccountedBillResponse = await reopenAccountedBillRepo(repoRequest);

    return result;
  } catch (error) {
    if (error instanceof HttpsError) {
      throw error;
    }

    logOpsError({
      message: 'reopenAccountedBill callable failed',
      functionEntry: 'reopenAccountedBill',
      operation: 'reopenAccountedBillCallable',
      cause: error,
      context: { result: 'fail' },
    });

    throw new HttpsError(
      'internal',
      `reopenAccountedBill failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
});
