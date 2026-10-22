/**
 * recordPostSettlementRefund callable（Step04 changeSpec §3.2.4）。
 *
 * 仕様書 04_cashActions管理.md の later refund cashAction 作成 API。
 * `cashActionType` を 'refund' に固定して内部 repo に委譲する。
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
  recordPostSettlementCashAction as recordPostSettlementCashActionRepo,
  RecordPostSettlementCashActionRequest,
  RecordPostSettlementCashActionResponse,
} from '../repos/recordPostSettlementCashAction';

const MethodBreakdownEntrySchema = z.object({
  method: z.string().min(1, 'method は必須です'),
  amountIncl: z.number().positive(),
});

const AllocationEntrySchema = z.object({
  adjustmentId: z.string().min(1, 'adjustmentId は必須です'),
  amountIncl: z.number().positive(),
});

const RequestSchema = z.object({
  billId: z.string().min(1, 'billId は必須です'),
  idempotencyKey: z.string().min(1).optional(),
  clientNonce: z.string().min(1).optional(),
  amountIncl: z.number().positive(),
  methodBreakdown: z.array(MethodBreakdownEntrySchema).min(1, 'methodBreakdown は 1 件以上必要です'),
  allocations: z.array(AllocationEntrySchema).min(1, 'allocations は 1 件以上必要です'),
  cashflowBusinessDate: z.string().min(1).optional(),
  note: z.string().optional(),
});

export const recordPostSettlementRefund = onCall(async (request) => {
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

    const {
      billId,
      idempotencyKey: providedIdempotencyKey,
      clientNonce,
      amountIncl,
      methodBreakdown,
      allocations,
      cashflowBusinessDate,
      note,
    } = validated;

    const idempotencyKey =
      providedIdempotencyKey ??
      `${billId}:recordPostSettlementRefund:${clientNonce ?? crypto.randomUUID()}`;

    const repoRequest: RecordPostSettlementCashActionRequest = {
      billId,
      idempotencyKey,
      cashActionType: 'refund',
      amountIncl,
      executedBy: adminId,
      methodBreakdown,
      allocations,
      cashflowBusinessDate,
      note,
    };

    const result: RecordPostSettlementCashActionResponse =
      await recordPostSettlementCashActionRepo(repoRequest);

    return result;
  } catch (error) {
    if (error instanceof HttpsError) {
      throw error;
    }

    logOpsError({
      message: 'recordPostSettlementRefund callable failed',
      functionEntry: 'recordPostSettlementRefund',
      operation: 'recordPostSettlementRefundCallable',
      cause: error,
      context: { result: 'fail' },
    });

    throw new HttpsError(
      'internal',
      `recordPostSettlementRefund failed: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
});
