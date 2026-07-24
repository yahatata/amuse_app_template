/**
 * createPostSettlementAdjustment ヘルパAPI（Step03 changeSpec §3.2）。
 *
 * 仕様書 03_adjustments管理.md の 4 パターン adjustment を、
 * `bills/{billId}/settlementCycles/{cycleNo}/adjustments/{adjustmentId}` に保存する。
 *
 * immediate パターン（`decrease_refunded` / `increase_collected`）の場合は、
 * 同一トランザクションで `bills/{billId}/settlementCycles/{cycleNo}/cashActions/{cashActionId}` も
 * 仕様書 04 の最小 shape で作成する。
 *
 * 旧 `bills/{billId}/events` 経路（postEventAdjustment / billsEventsOnCreate）には触れない。
 */

import { getFirestore, Timestamp, FieldValue } from 'firebase-admin/firestore';
import type { DocumentReference } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import * as crypto from 'crypto';

import { logOpsError, logOpsSuccess } from '../../../shared/logging/logOpsError';
import {
  FunctionCustomError,
  mapFunctionCustomErrorToHttpsCode,
} from '../../../shared/logging/functionCustomError';
import {
  buildCurrentSummaryAfterAdjustment,
  buildCurrentSummaryAfterCashAction,
  buildPostSettlementStateAfterAdjustment,
  buildPostSettlementStateAfterCashAction,
  deriveStatusAfterAdjustment,
} from '../services/parentSummary';
import {
  AdjustmentDirection,
  AdjustmentDoc,
  AdjustmentLineInput,
  AdjustmentState,
  AdjustmentType,
  applyOppositeDirectionOffset,
  assertSingleSidedRemaining,
  buildAdjustmentDoc,
  ExistingAdjustmentForOffset,
  signedAmountFromDirection,
  summarizeRemainingByDirection,
} from '../services/adjustments';
import {
  buildImmediateCashActionDoc,
  CashActionType,
  CashActionDoc,
} from '../services/cashActions';
import { calcBusinessDate } from './calcBusinessDate';
import { getStoreConfig } from '../../../shared/config/configLoader';
import { validatePointConfigFromStoreConfig } from '../../../shared/config/validatePointConfig';
import type { ValidatedPointConfig } from '../../../shared/config/validatePointConfig';
import {
  applyCollectionDetailsMerge,
  planCollectionBalanceMovements,
  planRefundBalanceMovements,
  type BalanceMethodSnapshot,
  type CollectionLot,
} from '../services/a7PostSettlementBalances';
import type { PaymentMethodDetails } from '../services/paymentMethodAggregation';
import {
  isBalanceId,
  isCurrencyPointId,
  SIDE_GAME_CHIP_ID,
  type BalanceId,
} from '../../user/types/pointIds';
import { readBalanceOrZeroIfMissing } from '../../user/helpers/userBalances';
import {
  collectionPointLogId,
  collectionSideGameChipLogId,
  refundPointLogId,
  refundSideGameChipLogId,
  writePostSettlementPointLogInTxWithSnap,
  writePostSettlementSideGameChipLogInTxWithSnap,
} from '../../user/services/pointLog';
import { buildAdjustmentAnalyticsDelta } from '../../analytics/services/aggregator/adjustmentDelta';
import { buildCashActionAnalyticsDelta } from '../../analytics/services/aggregator/cashActionDelta';
import { processAdjustmentAnalyticsAtomically } from '../../analytics/services/applyAdjustmentToAnalytics';
import { processCashActionAnalyticsAtomically } from '../../analytics/services/applyCashActionToAnalytics';
import { loadTaxReportingBehavior } from '../../reporting/config/taxReportingBehaviorLoader';
import { buildCashActionEntry } from '../../reporting/services/entryBuilder';
import { writeReportingEntry } from '../../reporting/services/entryWriter';
import { applyEntryToReportingMonthly } from '../../reporting/services/monthlyUpdater';

const IDEMPOTENCY_KEY_PREFIX = 'createPostSettlementAdjustment';
const IDEMPOTENCY_TTL_HOURS = 48;
const IMMEDIATE_CASH_DEFAULT_METHOD = 'cash';

const ALLOWED_BILL_STATUSES_FOR_ADJUSTMENT = new Set([
  'settled',
  'post_settlement_pending',
]);

export interface CreatePostSettlementAdjustmentLineInput {
  lineNo?: number;
  targetCategory: 'item' | 'extra' | 'tournament' | 'sideGameChip';
  targetId?: string | null;
  targetName: string;
  operationType:
    | 'sale'
    | 'extra'
    | 'chip'
    | 'entry'
    | 'reentry'
    | 'addon';
  qtyDelta: number;
  amountInclDelta: number;
  note?: string;
}

export interface CreatePostSettlementAdjustmentImmediateCashActionInput {
  /** Step03 では method を 1 件のみ指定可能。複数 method は Step04 で対応する。 */
  method?: string;
  /** Step03 では bill.businessDate を借用するため省略可能。Step04 で本格ロジック化する。 */
  cashflowBusinessDate?: string;
  note?: string;
}

export interface CreatePostSettlementAdjustmentRequest {
  billId: string;
  idempotencyKey: string;
  adjustmentType: AdjustmentType;
  adjustmentAmountIncl: number;
  lines: CreatePostSettlementAdjustmentLineInput[];
  /** 仕様書 §7 の必須 field。空文字許容。 */
  note?: string;
  createdBy: string | null;
  /** immediate パターン用の補助入力（pending パターンでは無視）。 */
  immediateCashAction?: CreatePostSettlementAdjustmentImmediateCashActionInput;
}

export interface CreatePostSettlementAdjustmentResponse {
  success: boolean;
  billId: string;
  cycleNo: number;
  adjustmentId: string;
  cashActionId: string | null;
  adjustment: {
    sequenceNo: number;
    adjustmentType: AdjustmentType;
    adjustmentDirection: AdjustmentDirection;
    adjustmentAmountIncl: number;
    requiredActionRemainingIncl: number;
    adjustmentState: AdjustmentState;
  };
  parent: {
    status: 'post_settlement_pending' | 'settled';
    requiredActionType: 'none' | 'collection' | 'refund';
    requiredActionIncl: number;
  };
  diagnostics?: {
    reused?: boolean;
  };
}

interface IdempotencyStoredResult {
  cycleNo: number;
  adjustmentId: string;
  cashActionId: string | null;
  adjustmentSequenceNo: number;
  adjustmentType: AdjustmentType;
  adjustmentDirection: AdjustmentDirection;
  adjustmentAmountIncl: number;
  requiredActionRemainingIncl: number;
  adjustmentState: AdjustmentState;
  parentStatus: 'post_settlement_pending' | 'settled';
  parentRequiredActionType: 'none' | 'collection' | 'refund';
  parentRequiredActionIncl: number;
}

interface ExistingAdjustmentDocForOffset extends ExistingAdjustmentForOffset {
  cashActionTypeAtCreation: 'none' | 'refund' | 'collection';
}

function stableHashForRequest(input: unknown): string {
  const json = JSON.stringify(input, Object.keys((input as any) ?? {}).sort());
  return crypto.createHash('sha256').update(json).digest('hex');
}

function shortHash(value: string): string {
  return value.substring(0, 8);
}

function operationForErrorKey(key: string): string {
  switch (key) {
    case 'ACCOUNTING_IDEMPOTENCY_MISMATCH':
      return 'validateIdempotencyRequest';
    case 'ACCOUNTING_INVALID_STATE':
      return 'validateBillState';
    case 'ACCOUNTING_BILL_NOT_FOUND':
    case 'ACCOUNTING_CYCLE_NOT_FOUND':
      return 'loadBillContext';
    case 'ACCOUNTING_ADJUSTMENT_INVALID':
      return 'validateAdjustmentInput';
    case 'ACCOUNTING_INVARIANT_VIOLATION':
      return 'enforceSingleSidedRemaining';
    default:
      return 'runAdjustmentTransaction';
  }
}

function buildResponseFromStored(
  billId: string,
  stored: IdempotencyStoredResult,
  reused: boolean
): CreatePostSettlementAdjustmentResponse {
  return {
    success: true,
    billId,
    cycleNo: stored.cycleNo,
    adjustmentId: stored.adjustmentId,
    cashActionId: stored.cashActionId,
    adjustment: {
      sequenceNo: stored.adjustmentSequenceNo,
      adjustmentType: stored.adjustmentType,
      adjustmentDirection: stored.adjustmentDirection,
      adjustmentAmountIncl: stored.adjustmentAmountIncl,
      requiredActionRemainingIncl: stored.requiredActionRemainingIncl,
      adjustmentState: stored.adjustmentState,
    },
    parent: {
      status: stored.parentStatus,
      requiredActionType: stored.parentRequiredActionType,
      requiredActionIncl: stored.parentRequiredActionIncl,
    },
    diagnostics: reused ? { reused: true } : undefined,
  };
}

export async function createPostSettlementAdjustment(
  request: CreatePostSettlementAdjustmentRequest
): Promise<CreatePostSettlementAdjustmentResponse> {
  const {
    billId,
    idempotencyKey,
    adjustmentType,
    adjustmentAmountIncl,
    lines,
    note,
    createdBy,
    immediateCashAction,
  } = request;

  if (!billId || typeof billId !== 'string') {
    throw new HttpsError('invalid-argument', 'billId is required');
  }
  if (!idempotencyKey || typeof idempotencyKey !== 'string') {
    throw new HttpsError('invalid-argument', 'idempotencyKey is required');
  }
  if (!adjustmentType) {
    throw new HttpsError('invalid-argument', 'adjustmentType is required');
  }

  const db = getFirestore();
  const billRef = db.collection('bills').doc(billId);
  const idempotencyDocId = `${IDEMPOTENCY_KEY_PREFIX}:${idempotencyKey}`;
  const idempotencyRef = billRef.collection('idempotency').doc(idempotencyDocId);

  // Step07 changeSpec §5.6: feature flag を transaction 外で読み取る
  const storeConfig = await getStoreConfig(db);
  const analyticsEnabled = storeConfig.features?.settlementAggregatorEnabled === true;
  const reportingEnabled = storeConfig.features?.reportingAggregatorEnabled === true;

  let validatedPointConfig: ValidatedPointConfig | null = null;
  try {
    validatedPointConfig = validatePointConfigFromStoreConfig(storeConfig);
  } catch {
    validatedPointConfig = null;
  }

  // Step07 changeSpec §5.3.1: transaction 内で組み立てた analytics delta を transaction 外で再利用するための capture
  interface AnalyticsCaptureFromTx {
    billBusinessDate: string;
    billUserId: string | null;
    adjustmentLines: AdjustmentDoc['lines'];
    cashActionDoc: CashActionDoc | null;
    cashActionId: string | null;
  }
  let analyticsCapture: AnalyticsCaptureFromTx | null = null;

  const requestHash = stableHashForRequest({
    billId,
    idempotencyKey,
    adjustmentType,
    adjustmentAmountIncl,
    note: note ?? null,
    createdBy: createdBy ?? null,
    lines: lines.map((line) => ({
      lineNo: line.lineNo ?? null,
      targetCategory: line.targetCategory,
      targetId: line.targetId ?? null,
      targetName: line.targetName,
      operationType: line.operationType,
      qtyDelta: line.qtyDelta,
      amountInclDelta: line.amountInclDelta,
      note: line.note ?? '',
    })),
    immediate: immediateCashAction
      ? {
          method: immediateCashAction.method ?? null,
          cashflowBusinessDate: immediateCashAction.cashflowBusinessDate ?? null,
          note: immediateCashAction.note ?? null,
        }
      : null,
  });

  let reused = false;

  try {
    const stored: IdempotencyStoredResult = await db.runTransaction(async (tx) => {
      // 1) idempotency 既存検知
      const idemSnap = await tx.get(idempotencyRef);
      if (idemSnap.exists) {
        const existingHash = idemSnap.data()?.requestHash as string | undefined;
        if (existingHash && existingHash !== requestHash) {
          throw new FunctionCustomError({
            errorKey: 'ACCOUNTING_IDEMPOTENCY_MISMATCH',
            message: 'createPostSettlementAdjustment idempotency requestHash mismatch',
            context: {
              billId,
              expectedHash8: shortHash(existingHash),
              gotHash8: shortHash(requestHash),
            },
          });
        }
        const storedResult = idemSnap.data()?.result as IdempotencyStoredResult | undefined;
        if (!storedResult) {
          throw new HttpsError(
            'internal',
            'idempotency exists but stored result is missing'
          );
        }
        reused = true;
        return storedResult;
      }

      // 2) bill doc 取得・status 検証
      const billSnap = await tx.get(billRef);
      if (!billSnap.exists) {
        throw new FunctionCustomError({
          errorKey: 'ACCOUNTING_BILL_NOT_FOUND',
          message: `Bill ${billId} not found`,
          context: { billId },
        });
      }
      const billData = billSnap.data()!;

      const currentStatus: string = billData.status ?? 'open';
      if (!ALLOWED_BILL_STATUSES_FOR_ADJUSTMENT.has(currentStatus)) {
        throw new FunctionCustomError({
          errorKey: 'ACCOUNTING_INVALID_STATE',
          message: `Cannot create adjustment. Current status: ${currentStatus}. Allowed: ${Array.from(
            ALLOWED_BILL_STATUSES_FOR_ADJUSTMENT
          ).join(', ')}`,
          context: { billId, currentStatus },
        });
      }

      const currentSettlementCycle: number =
        (billData.reopenSummary?.currentSettlementCycle as number | undefined) ?? 1;
      const cycleRef = billRef
        .collection('settlementCycles')
        .doc(String(currentSettlementCycle));

      // 3) cycle doc 取得
      const cycleSnap = await tx.get(cycleRef);
      if (!cycleSnap.exists) {
        throw new FunctionCustomError({
          errorKey: 'ACCOUNTING_CYCLE_NOT_FOUND',
          message: `settlementCycle ${currentSettlementCycle} not found for bill ${billId}`,
          context: { billId, currentSettlementCycle },
        });
      }
      const cycleData = cycleSnap.data()!;
      const startSequenceNo: number = (cycleData.nextSequenceNo as number | undefined) ?? 1;

      // 4) 既存 adjustments 取得（同一 cycle 配下、opposite offset 用）
      const adjustmentsCollectionRef = cycleRef.collection('adjustments');
      const cashActionsCollectionRef = cycleRef.collection('cashActions');
      const existingAdjustmentsSnap = await tx.get(adjustmentsCollectionRef);
      const existingAdjustments: ExistingAdjustmentDocForOffset[] = existingAdjustmentsSnap.docs.map(
        (doc) => {
          const data = doc.data();
          return {
            adjustmentId: doc.id,
            sequenceNo: data.sequenceNo as number,
            adjustmentDirection: data.adjustmentDirection as AdjustmentDirection,
            adjustmentState: data.adjustmentState as AdjustmentState,
            requiredActionRemainingIncl: data.requiredActionRemainingIncl as number,
            cashActionTypeAtCreation: data.cashActionTypeAtCreation as
              | 'none'
              | 'refund'
              | 'collection',
          };
        }
      );

      // 5) doc id を先に確定して allocations の整合を取りやすくする
      const adjustmentDocRef: DocumentReference = adjustmentsCollectionRef.doc();

      const adjustmentCreatedAt = Timestamp.now();

      // 6) 入力検証 + adjustment doc 組み立て
      let adjustmentDoc: AdjustmentDoc;
      try {
        adjustmentDoc = buildAdjustmentDoc({
          sequenceNo: startSequenceNo,
          adjustmentType,
          adjustmentAmountIncl,
          createdAt: adjustmentCreatedAt,
          createdBy: createdBy ?? null,
          note,
          lines: lines as AdjustmentLineInput[],
        });
      } catch (validationError) {
        throw new FunctionCustomError({
          errorKey: 'ACCOUNTING_ADJUSTMENT_INVALID',
          message:
            validationError instanceof Error
              ? validationError.message
              : String(validationError),
          context: { billId, adjustmentType, adjustmentAmountIncl },
        });
      }

      // 7) opposite-direction offset
      const offsetResult = applyOppositeDirectionOffset({
        existingAdjustments,
        newDirection: adjustmentDoc.adjustmentDirection,
        newRemaining: adjustmentDoc.requiredActionRemainingIncl,
      });

      // 8) immediate パターンの cashAction 構築（offset で完全相殺された場合は作らない）
      const isImmediate =
        adjustmentDoc.cashActionHandledAtCreation === true &&
        adjustmentDoc.cashActionTypeAtCreation !== 'none';

      let cashActionDocRef: DocumentReference | null = null;
      let cashActionDoc: CashActionDoc | null = null;
      let nextSequenceNoAfter = startSequenceNo + 1;
      let finalNewRemaining = offsetResult.newAdjustmentRemaining;
      let finalNewState: AdjustmentState = offsetResult.newAdjustmentState;

      let plannedImmediateRefund: ReturnType<typeof planRefundBalanceMovements> | null =
        null;
      let plannedImmediateCollection: ReturnType<
        typeof planCollectionBalanceMovements
      > | null = null;
      let nextDetailsForBill: PaymentMethodDetails | null = null;
      let cashActionBalanceDetails: Record<string, BalanceMethodSnapshot> | null =
        null;
      let immediateUserRef: DocumentReference | null = null;
      let immediateUserData: Record<string, unknown> | null = null;
      type ImmediateLogPrep = {
        kind: 'point' | 'chip';
        method: BalanceId;
        ref: DocumentReference;
        snap: FirebaseFirestore.DocumentSnapshot;
        before: number;
        delta: number;
      };
      const immediateLogPreps: ImmediateLogPrep[] = [];
      let immediateExistingCashActionsSnap: FirebaseFirestore.QuerySnapshot | null =
        null;

      if (isImmediate && finalNewRemaining > 0) {
        const cashActionType: CashActionType =
          adjustmentDoc.cashActionTypeAtCreation === 'refund' ? 'refund' : 'collection';
        cashActionDocRef = cashActionsCollectionRef.doc();

        // cashflowBusinessDate 解決（Step04 仕様準拠）
        // 1) immediateCashAction.cashflowBusinessDate 指定優先
        // 2) calcBusinessDate(executedAt) が status=OK ならその値
        // 3) bill.businessDate を borrow
        // 4) 全部空なら throw
        let resolvedCashflowBusinessDate = '';
        if (
          typeof immediateCashAction?.cashflowBusinessDate === 'string' &&
          immediateCashAction.cashflowBusinessDate.length > 0
        ) {
          resolvedCashflowBusinessDate = immediateCashAction.cashflowBusinessDate;
        } else {
          try {
            const calcResult = await calcBusinessDate(adjustmentCreatedAt.toDate());
            if (calcResult.status === 'OK') {
              resolvedCashflowBusinessDate = calcResult.businessDateKey;
            }
          } catch {
            // fallback to bill.businessDate
          }
          if (resolvedCashflowBusinessDate.length === 0) {
            resolvedCashflowBusinessDate = (billData.businessDate as string | undefined) ?? '';
          }
        }

        const usedMethod = immediateCashAction?.method ?? IMMEDIATE_CASH_DEFAULT_METHOD;

        cashActionDoc = buildImmediateCashActionDoc({
          sequenceNo: startSequenceNo + 1,
          cashActionType,
          amountIncl: finalNewRemaining,
          executedAt: adjustmentCreatedAt,
          executedBy: adjustmentDoc.createdBy,
          cashflowBusinessDate: resolvedCashflowBusinessDate,
          method: usedMethod,
          allocationAdjustmentId: adjustmentDocRef.id,
          note: immediateCashAction?.note,
        });
        nextSequenceNoAfter = startSequenceNo + 2;
        finalNewRemaining = 0;
        finalNewState = 'completed_by_cash_action';

        // A-7: 残高 method の検証・計画（write 前に read 完了）
        if (isBalanceId(usedMethod)) {
          const userId = (billData.party?.userId as string | undefined) ?? null;
          if (!userId) {
            throw new FunctionCustomError({
              errorKey: 'ACCOUNTING_USER_NOT_FOUND',
              message: `balance method ${usedMethod} requires userId on bill.party, but not found`,
              context: { billId, method: usedMethod },
            });
          }
          immediateUserRef = db.collection('users').doc(userId);
          const userSnap = await tx.get(immediateUserRef);
          if (!userSnap.exists) {
            throw new FunctionCustomError({
              errorKey: 'ACCOUNTING_USER_NOT_FOUND',
              message: 'ユーザー情報が見つかりません',
              context: { billId, userId },
            });
          }
          immediateUserData = userSnap.data() as Record<string, unknown>;

          const methodBreakdown = [
            { method: usedMethod, amountIncl: cashActionDoc.amountIncl },
          ];
          const existingDetails = ((billData.meta as Record<string, unknown> | undefined)
            ?.paymentMethodDetails || {}) as PaymentMethodDetails;

          immediateExistingCashActionsSnap = await tx.get(cashActionsCollectionRef);
          const collectionLots: CollectionLot[] = [];
          let alreadyRefunded = 0;
          let alreadyCollected = 0;
          for (const caDoc of immediateExistingCashActionsSnap.docs) {
            const ca = caDoc.data();
            const mb =
              (ca.methodBreakdown as
                | Array<{ method: string; amountIncl: number }>
                | undefined) ?? [];
            for (const entry of mb) {
              if (entry.method === usedMethod) {
                if (ca.cashActionType === 'refund') {
                  alreadyRefunded += entry.amountIncl;
                } else if (ca.cashActionType === 'collection') {
                  alreadyCollected += entry.amountIncl;
                }
              }
            }
            if (ca.cashActionType === 'collection') {
              const snaps = (ca.balanceMethodDetails || {}) as Record<
                string,
                BalanceMethodSnapshot
              >;
              for (const [method, snap] of Object.entries(snaps)) {
                if (!isBalanceId(method) || !snap) continue;
                collectionLots.push({
                  cashActionId: caDoc.id,
                  sequenceNo: (ca.sequenceNo as number) ?? 0,
                  method,
                  snapshot: {
                    referenceAmount: snap.referenceAmount,
                    balanceAmount: snap.balanceAmount,
                    conversion: snap.conversion,
                    usageUnit: snap.usageUnit,
                    refundedBalanceAmount: snap.refundedBalanceAmount ?? 0,
                    mergedIntoBillDetails: snap.mergedIntoBillDetails === true,
                  },
                });
              }
            }
          }

          if (cashActionType === 'refund') {
            const paymentTotals =
              (billData.paymentTotals as Record<string, number> | undefined) ?? {};
            const originalPaid = paymentTotals[usedMethod] ?? 0;
            if (originalPaid > 0 || alreadyCollected > 0) {
              const maxRefundable =
                originalPaid + alreadyCollected - alreadyRefunded;
              if (cashActionDoc.amountIncl > maxRefundable) {
                throw new FunctionCustomError({
                  errorKey: 'ACCOUNTING_REFUND_EXCEEDS_LIMIT',
                  message: `${usedMethod} の返金可能額を超えています。返金可能残額: ¥${maxRefundable}、要求額: ¥${cashActionDoc.amountIncl}`,
                  context: {
                    billId,
                    method: usedMethod,
                    originalPaid,
                    alreadyCollected,
                    alreadyRefunded,
                    maxRefundable,
                    requested: cashActionDoc.amountIncl,
                  },
                });
              }
            }

            plannedImmediateRefund = planRefundBalanceMovements({
              methodBreakdown,
              paymentMethodDetails: existingDetails,
              collectionLots,
            });
            nextDetailsForBill = plannedImmediateRefund.nextDetails;
            cashActionBalanceDetails = {};
            for (const mov of plannedImmediateRefund.movements) {
              cashActionBalanceDetails[mov.method] = {
                referenceAmount: mov.referenceAmount,
                balanceAmount: mov.balanceAmount,
                conversion: mov.conversion,
                usageUnit: mov.usageUnit,
                refundedBalanceAmount: 0,
                mergedIntoBillDetails: false,
              };
            }
          } else {
            if (!validatedPointConfig) {
              throw new FunctionCustomError({
                errorKey: 'CONFIG_POINT_INVALID',
                message: '追加徴収には有効なポイント設定が必要です',
                context: { billId },
              });
            }
            const userBalances: Record<string, number> = {
              [usedMethod]: readBalanceOrZeroIfMissing(
                immediateUserData,
                usedMethod,
              ),
            };
            plannedImmediateCollection = planCollectionBalanceMovements({
              methodBreakdown,
              validatedConfig: validatedPointConfig,
              userBalances,
            });
            nextDetailsForBill = applyCollectionDetailsMerge({
              existingDetails,
              detailsMerge: plannedImmediateCollection.detailsMerge,
              cashActionSnapshots: plannedImmediateCollection.cashActionSnapshots,
            });
            cashActionBalanceDetails = plannedImmediateCollection.cashActionSnapshots;
          }

          const movements =
            cashActionType === 'refund'
              ? plannedImmediateRefund?.movements ?? []
              : plannedImmediateCollection?.movements ?? [];
          for (const mov of movements) {
            if (mov.balanceAmount <= 0) continue;
            const before = readBalanceOrZeroIfMissing(immediateUserData, mov.method);
            const delta =
              cashActionType === 'collection'
                ? -mov.balanceAmount
                : mov.balanceAmount;
            if (isCurrencyPointId(mov.method)) {
              const logId =
                cashActionType === 'refund'
                  ? refundPointLogId(cashActionDocRef!.id, mov.method)
                  : collectionPointLogId(cashActionDocRef!.id, mov.method);
              const ref = immediateUserRef.collection('pointLogs').doc(logId);
              const snap = await tx.get(ref);
              immediateLogPreps.push({
                kind: 'point',
                method: mov.method,
                ref,
                snap,
                before,
                delta,
              });
            } else if (mov.method === SIDE_GAME_CHIP_ID) {
              const logId =
                cashActionType === 'refund'
                  ? refundSideGameChipLogId(cashActionDocRef!.id)
                  : collectionSideGameChipLogId(cashActionDocRef!.id);
              const ref = immediateUserRef
                .collection('sideGameChipLogs')
                .doc(logId);
              const snap = await tx.get(ref);
              immediateLogPreps.push({
                kind: 'chip',
                method: mov.method,
                ref,
                snap,
                before,
                delta,
              });
            }
          }
        }
      }

      const finalAdjustmentDoc: AdjustmentDoc = {
        ...adjustmentDoc,
        requiredActionRemainingIncl: finalNewRemaining,
        adjustmentState: finalNewState,
      };

      // 9) summarize remaining (反映後の状態を作って集計)
      const adjustmentsAfterUpdate = [
        ...existingAdjustments.map((existing) => {
          const patch = offsetResult.patches.get(existing.adjustmentId);
          if (!patch) return existing;
          return {
            ...existing,
            adjustmentState: patch.adjustmentState ?? existing.adjustmentState,
            requiredActionRemainingIncl: patch.requiredActionRemainingIncl,
          };
        }),
        {
          adjustmentId: adjustmentDocRef.id,
          sequenceNo: finalAdjustmentDoc.sequenceNo,
          adjustmentDirection: finalAdjustmentDoc.adjustmentDirection,
          adjustmentState: finalAdjustmentDoc.adjustmentState,
          requiredActionRemainingIncl: finalAdjustmentDoc.requiredActionRemainingIncl,
          cashActionTypeAtCreation: finalAdjustmentDoc.cashActionTypeAtCreation,
        },
      ];

      const remainingByDirection = summarizeRemainingByDirection(adjustmentsAfterUpdate);

      // 仕様書 §16.3 不変則
      try {
        assertSingleSidedRemaining(remainingByDirection);
      } catch (invariantError) {
        throw new FunctionCustomError({
          errorKey: 'ACCOUNTING_INVARIANT_VIOLATION',
          message:
            invariantError instanceof Error
              ? invariantError.message
              : String(invariantError),
          context: {
            billId,
            currentSettlementCycle,
            refundRemainingTotal: remainingByDirection.refundRemainingTotal,
            collectionRemainingTotal: remainingByDirection.collectionRemainingTotal,
          },
        });
      }

      // 10) parent 反映
      // 仕様書 04 §12.3: cashAction が作られた場合は lastRecordType='cash_action'、
      // adjustment のみの場合は lastRecordType='adjustment'。
      // ただし adjustment 由来の totalAdjustmentsIncl / netSalesIncl / claimTotalIncl の更新は
      // immediate でも必要なため、2 段で適用する:
      //   step a) buildPostSettlementStateAfterAdjustment / buildCurrentSummaryAfterAdjustment
      //          で adjustment 派生分を反映
      //   step b) cashAction が作られた場合のみ、その上に
      //          buildPostSettlementStateAfterCashAction / buildCurrentSummaryAfterCashAction を重ねて
      //          totalRefundedIncl/totalCollectedIncl 増 + lastRecordType='cash_action' に書き換える
      const adjustmentSignedAmountIncl = signedAmountFromDirection(
        finalAdjustmentDoc.adjustmentDirection,
        finalAdjustmentDoc.adjustmentAmountIncl
      );

      const existingPostSettlementState = (billData.postSettlementState ?? {
        hasPostSettlementActivity: false,
        totalAdjustmentsIncl: 0,
        totalCollectedIncl: 0,
        totalRefundedIncl: 0,
        requiredActionType: 'none',
        requiredActionIncl: 0,
        lastRecordType: 'none',
        lastRecordAt: null,
        lastRecordId: null,
      }) as Parameters<typeof buildPostSettlementStateAfterAdjustment>[0]['existingState'];

      const existingCurrentSummary = (billData.currentSummary ?? {
        claimTotalIncl: 0,
        receivedTotalIncl: 0,
        refundedTotalIncl: 0,
        netSalesIncl: 0,
      }) as Parameters<typeof buildCurrentSummaryAfterAdjustment>[0]['existingSummary'];

      // step a: adjustment 派生分（claimTotalIncl / netSalesIncl / totalAdjustmentsIncl）
      let newPostSettlementState = buildPostSettlementStateAfterAdjustment({
        existingState: existingPostSettlementState,
        adjustmentSignedAmountIncl,
        // immediate refund/collection はここでは反映しない（step b に集約）
        immediateRefundAmountIncl: 0,
        immediateCollectionAmountIncl: 0,
        summarizedRemaining: remainingByDirection,
        lastRecordAt: adjustmentCreatedAt,
        lastRecordId: adjustmentDocRef.id,
      });

      let newCurrentSummary = buildCurrentSummaryAfterAdjustment({
        existingSummary: existingCurrentSummary,
        adjustmentSignedAmountIncl,
        immediateRefundAmountIncl: 0,
        immediateCollectionAmountIncl: 0,
      });

      // step b: cashAction が作られたら cashAction 派生分を上重ねする
      if (cashActionDoc && cashActionDocRef) {
        newPostSettlementState = buildPostSettlementStateAfterCashAction({
          existingState: newPostSettlementState,
          cashActionType: cashActionDoc.cashActionType,
          cashActionAmountIncl: cashActionDoc.amountIncl,
          summarizedRemaining: remainingByDirection,
          lastRecordAt: adjustmentCreatedAt,
          lastRecordId: cashActionDocRef.id,
        });
        newCurrentSummary = buildCurrentSummaryAfterCashAction({
          existingSummary: newCurrentSummary,
          cashActionType: cashActionDoc.cashActionType,
          cashActionAmountIncl: cashActionDoc.amountIncl,
        });
      }

      const newStatus = deriveStatusAfterAdjustment({
        refundRemainingTotal: remainingByDirection.refundRemainingTotal,
        collectionRemainingTotal: remainingByDirection.collectionRemainingTotal,
      });

      // 11) write
      tx.set(adjustmentDocRef, finalAdjustmentDoc, { merge: false });

      for (const [existingId, patch] of offsetResult.patches.entries()) {
        if (patch.adjustmentState) {
          tx.update(adjustmentsCollectionRef.doc(existingId), {
            requiredActionRemainingIncl: patch.requiredActionRemainingIncl,
            adjustmentState: patch.adjustmentState,
          });
        } else {
          tx.update(adjustmentsCollectionRef.doc(existingId), {
            requiredActionRemainingIncl: patch.requiredActionRemainingIncl,
          });
        }
      }

      if (cashActionDocRef && cashActionDoc) {
        const cashActionWritePayload: CashActionDoc & {
          balanceMethodDetails?: Record<string, BalanceMethodSnapshot>;
        } = {
          ...cashActionDoc,
          ...(cashActionBalanceDetails
            ? { balanceMethodDetails: cashActionBalanceDetails }
            : {}),
        };
        tx.set(cashActionDocRef, cashActionWritePayload, { merge: false });

        // A-7: 残高・ログ・Details
        if (immediateUserRef && immediateUserData && immediateLogPreps.length > 0) {
          const reasonType =
            cashActionDoc.cashActionType === 'refund'
              ? ('post_settlement_refund' as const)
              : ('post_settlement_collection' as const);
          const balanceUpdates: Record<string, FieldValue> = {
            updatedAt: FieldValue.serverTimestamp(),
          };
          for (const prep of immediateLogPreps) {
            balanceUpdates[prep.method] = FieldValue.increment(prep.delta);
          }
          tx.update(immediateUserRef, balanceUpdates);

          for (const prep of immediateLogPreps) {
            if (prep.kind === 'point' && isCurrencyPointId(prep.method)) {
              writePostSettlementPointLogInTxWithSnap({
                tx,
                existingSnap: prep.snap,
                ref: prep.ref,
                cashActionId: cashActionDocRef.id,
                pointType: prep.method,
                balanceBefore: prep.before,
                changeAmount: prep.delta,
                balanceAfter: prep.before + prep.delta,
                reasonType,
              });
            } else if (prep.kind === 'chip') {
              writePostSettlementSideGameChipLogInTxWithSnap({
                tx,
                existingSnap: prep.snap,
                ref: prep.ref,
                cashActionId: cashActionDocRef.id,
                balanceBefore: prep.before,
                changeAmount: prep.delta,
                balanceAfter: prep.before + prep.delta,
                reasonType,
              });
            }
          }

          if (
            cashActionDoc.cashActionType === 'refund' &&
            plannedImmediateRefund &&
            immediateExistingCashActionsSnap
          ) {
            for (const mov of plannedImmediateRefund.movements) {
              for (const lotRefund of mov.lotRefunds) {
                const lotRef = cashActionsCollectionRef.doc(lotRefund.cashActionId);
                const lotSnap = immediateExistingCashActionsSnap.docs.find(
                  (d) => d.id === lotRefund.cashActionId,
                );
                const lotData = lotSnap?.data();
                const existingSnaps = (lotData?.balanceMethodDetails ||
                  {}) as Record<string, BalanceMethodSnapshot>;
                const prev = existingSnaps[mov.method];
                if (!prev) continue;
                tx.update(lotRef, {
                  balanceMethodDetails: {
                    ...existingSnaps,
                    [mov.method]: {
                      ...prev,
                      refundedBalanceAmount:
                        (prev.refundedBalanceAmount ?? 0) +
                        lotRefund.refundedBalanceDelta,
                    },
                  },
                });
              }
            }
          }
        }
      }

      tx.update(cycleRef, {
        nextSequenceNo: nextSequenceNoAfter,
      });

      const billUpdate: FirebaseFirestore.UpdateData<FirebaseFirestore.DocumentData> = {
        status: newStatus,
        currentSummary: newCurrentSummary,
        postSettlementState: newPostSettlementState,
        updatedAt: Timestamp.now(),
      };
      if (nextDetailsForBill) {
        billUpdate['meta.paymentMethodDetails'] = nextDetailsForBill;
      }
      tx.update(billRef, billUpdate);

      const storedResult: IdempotencyStoredResult = {
        cycleNo: currentSettlementCycle,
        adjustmentId: adjustmentDocRef.id,
        cashActionId: cashActionDocRef?.id ?? null,
        adjustmentSequenceNo: finalAdjustmentDoc.sequenceNo,
        adjustmentType: finalAdjustmentDoc.adjustmentType,
        adjustmentDirection: finalAdjustmentDoc.adjustmentDirection,
        adjustmentAmountIncl: finalAdjustmentDoc.adjustmentAmountIncl,
        requiredActionRemainingIncl: finalAdjustmentDoc.requiredActionRemainingIncl,
        adjustmentState: finalAdjustmentDoc.adjustmentState,
        parentStatus: newStatus,
        parentRequiredActionType: newPostSettlementState.requiredActionType,
        parentRequiredActionIncl: newPostSettlementState.requiredActionIncl,
      };

      // 12) idempotency doc を保存
      const expiresAt = Timestamp.fromMillis(
        Timestamp.now().toMillis() + IDEMPOTENCY_TTL_HOURS * 60 * 60 * 1000
      );
      tx.set(idempotencyRef, {
        requestHash,
        createdAt: Timestamp.now(),
        expiresAt,
        result: storedResult,
      });

      // Step07 changeSpec §5.3.1: analytics 用の context を capture
      analyticsCapture = {
        billBusinessDate: (billData.businessDate as string | undefined) ?? '',
        billUserId: (billData.party?.userId as string | undefined) ?? null,
        adjustmentLines: finalAdjustmentDoc.lines,
        cashActionDoc: cashActionDoc,
        cashActionId: cashActionDocRef?.id ?? null,
      };

      return storedResult;
    });

    const response = buildResponseFromStored(billId, stored, reused);

    // Step07 changeSpec §5.3.1 / §5.6: analytics 更新は main transaction 後の separate-tx で実施。
    // - reused（idempotent 再呼び出し）: 何もしない（適用済み）
    // - feature flag OFF: 何もしない
    // - businessDate が空: 反映スキップ（古い bill だけ起こり得る防御）
    // - 失敗時: callable 自体は成功させ、ops error log のみ残す
    let analyticsAdjustmentApplied = false;
    let analyticsCashActionApplied = false;
    if (!reused && analyticsEnabled && analyticsCapture) {
      const capture = analyticsCapture as AnalyticsCaptureFromTx;
      const monthKey = capture.billBusinessDate.length >= 7 ? capture.billBusinessDate.substring(0, 7) : '';
      if (monthKey.length > 0 && capture.billBusinessDate.length > 0) {
        try {
          const adjustmentDelta = buildAdjustmentAnalyticsDelta({
            lines: capture.adjustmentLines,
            billUserId: capture.billUserId,
          });
          await processAdjustmentAnalyticsAtomically(db, {
            monthKey,
            businessDate: capture.billBusinessDate,
            billId,
            adjustmentId: stored.adjustmentId,
            delta: adjustmentDelta,
          });
          analyticsAdjustmentApplied = true;
        } catch (analyticsError) {
          logOpsError({
            message: 'createPostSettlementAdjustment analytics(adjustment) failed',
            functionEntry: 'createPostSettlementAdjustment',
            operation: 'processAdjustmentAnalyticsAtomically',
            cause: analyticsError,
            context: {
              billId,
              adjustmentId: stored.adjustmentId,
              result: 'fail',
              requestHash8: shortHash(requestHash),
            },
          });
        }

        if (capture.cashActionDoc && capture.cashActionId) {
          try {
            const cashActionDelta = buildCashActionAnalyticsDelta({
              cashActionType: capture.cashActionDoc.cashActionType,
              methodBreakdown: capture.cashActionDoc.methodBreakdown,
            });
            await processCashActionAnalyticsAtomically(db, {
              monthKey,
              businessDate: capture.billBusinessDate,
              billId,
              cashActionId: capture.cashActionId,
              cashActionType: capture.cashActionDoc.cashActionType,
              delta: cashActionDelta,
              billUserId: capture.billUserId,
            });
            analyticsCashActionApplied = true;
          } catch (analyticsError) {
            logOpsError({
              message: 'createPostSettlementAdjustment analytics(cashAction) failed',
              functionEntry: 'createPostSettlementAdjustment',
              operation: 'processCashActionAnalyticsAtomically',
              cause: analyticsError,
              context: {
                billId,
                cashActionId: capture.cashActionId,
                result: 'fail',
                requestHash8: shortHash(requestHash),
              },
            });
          }
        }
      }
    }

    // Reporting: write cashAction entry only when immediate cashAction was created
    let reportingApplied = false;
    if (!reused && reportingEnabled && analyticsCapture) {
      const capture = analyticsCapture as AnalyticsCaptureFromTx;
      if (capture.cashActionDoc && capture.cashActionId && capture.billBusinessDate.length > 0) {
        try {
          const taxBehavior = await loadTaxReportingBehavior();

          const reportingAdjLines = capture.adjustmentLines.map(line => ({
            targetCategory: line.targetCategory,
            amountInclDelta: line.amountInclDelta,
          }));

          const methodBreakdownMap: Record<string, number> = {};
          for (const mbEntry of capture.cashActionDoc.methodBreakdown) {
            methodBreakdownMap[mbEntry.method] = (methodBreakdownMap[mbEntry.method] ?? 0) + mbEntry.amountIncl;
          }

          const reportingEntry = buildCashActionEntry({
            billId,
            cycleNo: stored.cycleNo,
            cashActionId: capture.cashActionId,
            cashActionType: capture.cashActionDoc.cashActionType,
            amountIncl: capture.cashActionDoc.amountIncl,
            methodBreakdown: methodBreakdownMap,
            adjustmentLines: reportingAdjLines,
            businessDate: capture.billBusinessDate,
            cashActionExecutedAt: capture.cashActionDoc.executedAt as Timestamp,
            dateRule: taxBehavior.dateRule,
            linkedAdjustmentId: stored.adjustmentId,
            isImmediate: true,
          });

          const { written } = await writeReportingEntry(db, reportingEntry);
          if (written) {
            await applyEntryToReportingMonthly(db, reportingEntry);
          }
          reportingApplied = true;
        } catch (reportingError) {
          logOpsError({
            message: 'createPostSettlementAdjustment reporting write failed',
            functionEntry: 'createPostSettlementAdjustment',
            operation: 'writeReportingEntry',
            cause: reportingError,
            context: { billId, adjustmentId: stored.adjustmentId, cashActionId: stored.cashActionId },
          });
        }
      }
    }

    logOpsSuccess({
      message: 'createPostSettlementAdjustment 成功',
      functionEntry: 'createPostSettlementAdjustment',
      operation: 'createPostSettlementAdjustmentRepo',
      context: {
        billId,
        idempotencyKey: idempotencyDocId,
        reused,
        requestHash8: shortHash(requestHash),
        adjustmentId: response.adjustmentId,
        cashActionId: response.cashActionId,
        adjustmentType: response.adjustment.adjustmentType,
        parentStatus: response.parent.status,
        analyticsApplied: analyticsAdjustmentApplied,
        analyticsCashActionApplied,
        analyticsEnabled,
        reportingApplied,
        reportingEnabled,
      },
    });

    return response;
  } catch (error) {
    if (error instanceof FunctionCustomError) {
      logOpsError({
        message: 'createPostSettlementAdjustment failed',
        functionEntry: 'createPostSettlementAdjustment',
        operation: operationForErrorKey(error.errorKey),
        cause: error,
        context: {
          billId,
          idempotencyKey: idempotencyDocId,
          adjustmentType,
          result: 'fail',
          requestHash8: shortHash(requestHash),
        },
      });
      throw new HttpsError(
        mapFunctionCustomErrorToHttpsCode(error.errorKey),
        error.message
      );
    }

    logOpsError({
      message: 'createPostSettlementAdjustment failed',
      functionEntry: 'createPostSettlementAdjustment',
      operation: 'runAdjustmentTransaction',
      cause: error,
      context: {
        billId,
        idempotencyKey: idempotencyDocId,
        adjustmentType,
        result: 'fail',
        code: error instanceof HttpsError ? error.code : 'internal',
        requestHash8: shortHash(requestHash),
      },
    });

    if (error instanceof HttpsError) {
      throw error;
    }
    throw new HttpsError(
      'internal',
      `createPostSettlementAdjustment failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
