/**
 * createPostSettlementAdjustment callable（Step03 changeSpec §3.2）。
 *
 * 仕様書 03_adjustments管理.md の 4 パターン adjustment 作成 API。
 * UI 側からの呼び出しは Step06 で接続するが、Step03 では internal API として完成させる。
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
  createPostSettlementAdjustment as createPostSettlementAdjustmentRepo,
  CreatePostSettlementAdjustmentRequest,
  CreatePostSettlementAdjustmentResponse,
} from '../repos/createPostSettlementAdjustment';

const ADJUSTMENT_TYPES = [
  'decrease_refund_pending',
  'decrease_refunded',
  'increase_collection_pending',
  'increase_collected',
] as const;

const TARGET_CATEGORIES = ['item', 'extra', 'tournament', 'sideGameChip'] as const;
const OPERATION_TYPES = [
  'sale',
  'extra',
  'chip',
  'entry',
  'reentry',
  'addon',
] as const;

const LineSchema = z.object({
  lineNo: z.number().int().positive().optional(),
  targetCategory: z.enum(TARGET_CATEGORIES),
  targetId: z.string().nullable().optional(),
  targetName: z.string().min(1, 'targetName は必須です'),
  operationType: z.enum(OPERATION_TYPES),
  qtyDelta: z.number().finite(),
  amountInclDelta: z.number().finite(),
  note: z.string().optional(),
});

const ImmediateCashActionSchema = z
  .object({
    method: z.string().min(1).optional(),
    cashflowBusinessDate: z.string().min(1).optional(),
    note: z.string().optional(),
  })
  .optional();

const RequestSchema = z.object({
  billId: z.string().min(1, 'billId は必須です'),
  idempotencyKey: z.string().min(1).optional(),
  clientNonce: z.string().min(1).optional(),
  adjustmentType: z.enum(ADJUSTMENT_TYPES),
  adjustmentAmountIncl: z.number().positive(),
  lines: z.array(LineSchema).min(1, 'lines は 1 件以上必要です'),
  note: z.string().optional(),
  immediateCashAction: ImmediateCashActionSchema,
});

export const createPostSettlementAdjustment = onCall(async (request) => {
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
      adjustmentType,
      adjustmentAmountIncl,
      lines,
      note,
      immediateCashAction,
    } = validated;

    const idempotencyKey =
      providedIdempotencyKey ??
      `${billId}:createPostSettlementAdjustment:${clientNonce ?? crypto.randomUUID()}`;

    const repoRequest: CreatePostSettlementAdjustmentRequest = {
      billId,
      idempotencyKey,
      adjustmentType,
      adjustmentAmountIncl,
      lines: lines.map((line) => ({
        lineNo: line.lineNo,
        targetCategory: line.targetCategory,
        targetId: line.targetId ?? null,
        targetName: line.targetName,
        operationType: line.operationType,
        qtyDelta: line.qtyDelta,
        amountInclDelta: line.amountInclDelta,
        note: line.note,
      })),
      note,
      createdBy: adminId,
      immediateCashAction,
    };

    const result: CreatePostSettlementAdjustmentResponse = await createPostSettlementAdjustmentRepo(
      repoRequest
    );

    return result;
  } catch (error) {
    if (error instanceof HttpsError) {
      throw error;
    }

    logOpsError({
      message: 'createPostSettlementAdjustment callable failed',
      functionEntry: 'createPostSettlementAdjustment',
      operation: 'createPostSettlementAdjustmentCallable',
      cause: error,
      context: { result: 'fail' },
    });

    throw new HttpsError(
      'internal',
      `createPostSettlementAdjustment failed: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
});
