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
import { DEFAULT_SIDE_GAME_CHIP_EXCHANGE_RATE } from '../../../shared/config/defaults';
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
  const storeConfig = await getStoreConfig();
  const analyticsEnabled = storeConfig.features?.settlementAggregatorEnabled === true;
  const reportingEnabled = storeConfig.features?.reportingAggregatorEnabled === true;
  const chipRate = storeConfig.billing?.sideGameChipRate ?? DEFAULT_SIDE_GAME_CHIP_EXCHANGE_RATE;

  const SPECIAL_METHODS = new Set(['sideGameChip', 'pointA', 'pointB']);

  /** ユーザー残高フィールド名（Firestore 上の key）を返す */
  function balanceField(method: string): string {
    switch (method) {
      case 'sideGameChip': return 'sideGameChip';
      case 'pointA': return 'pointA';
      case 'pointB': return 'pointB';
      default: throw new Error(`Unknown special method: ${method}`);
    }
  }

  /** special method の amount を「残高単位（枚 or ポイント）」に変換 */
  function toBalanceUnit(method: string, amountIncl: number): number {
    if (method === 'sideGameChip') {
      return Math.round(amountIncl / chipRate);
    }
    return amountIncl; // pointA / pointB は 1pt = 1円
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

        // C-2.5: special method のユーザー残高バリデーション
        if (SPECIAL_METHODS.has(usedMethod)) {
          const userId = (billData.party?.userId as string | undefined) ?? null;
          if (!userId) {
            throw new FunctionCustomError({
              errorKey: 'ACCOUNTING_USER_NOT_FOUND',
              message: `special method ${usedMethod} requires userId on bill.party, but not found`,
              context: { billId, method: usedMethod },
            });
          }
          const userRef = db.collection('users').doc(userId);
          const userSnap = await tx.get(userRef);
          const userData = userSnap.exists ? userSnap.data()! : {};
          const currentBalance: number = (userData[balanceField(usedMethod)] as number | undefined) ?? 0;
          const requiredBalance = toBalanceUnit(usedMethod, cashActionDoc.amountIncl);

          if (cashActionType === 'collection') {
            if (currentBalance < requiredBalance) {
              throw new FunctionCustomError({
                errorKey: 'ACCOUNTING_INSUFFICIENT_BALANCE',
                message: `${usedMethod} の残高が不足しています。残高: ${currentBalance}、必要: ${requiredBalance}`,
                context: { billId, method: usedMethod, currentBalance, requiredBalance },
              });
            }
          }

          if (cashActionType === 'refund') {
            const paymentTotals = (billData.paymentTotals as Record<string, number> | undefined) ?? {};
            const originalPaid = paymentTotals[usedMethod] ?? 0;
            if (originalPaid > 0) {
              // 既存 cashActions から累計返金額・追加徴収額を計算
              // 返金可能上限 = 最初の会計で支払った額 + 追加徴収で受け取った額 - すでに返金した額
              const existingCashActionsSnap = await tx.get(cashActionsCollectionRef);
              let alreadyRefunded = 0;
              let alreadyCollected = 0;
              for (const caDoc of existingCashActionsSnap.docs) {
                const ca = caDoc.data();
                const mb = (ca.methodBreakdown as Array<{ method: string; amountIncl: number }> | undefined) ?? [];
                for (const entry of mb) {
                  if (entry.method === usedMethod) {
                    if (ca.cashActionType === 'refund') {
                      alreadyRefunded += entry.amountIncl;
                    } else if (ca.cashActionType === 'collection') {
                      alreadyCollected += entry.amountIncl;
                    }
                  }
                }
              }
              const maxRefundable = originalPaid + alreadyCollected - alreadyRefunded;
              if (cashActionDoc.amountIncl > maxRefundable) {
                throw new FunctionCustomError({
                  errorKey: 'ACCOUNTING_REFUND_EXCEEDS_LIMIT',
                  message: `${usedMethod} の返金可能額を超えています。返金可能残額: ¥${maxRefundable}、要求額: ¥${cashActionDoc.amountIncl}`,
                  context: { billId, method: usedMethod, originalPaid, alreadyCollected, alreadyRefunded, maxRefundable, requested: cashActionDoc.amountIncl },
                });
              }
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
        tx.set(cashActionDocRef, cashActionDoc, { merge: false });

        // C-2.5: special method ユーザー残高更新
        const usedMethod = cashActionDoc.methodBreakdown[0]?.method ?? null;
        if (usedMethod && SPECIAL_METHODS.has(usedMethod)) {
          const userId = (billData.party?.userId as string | undefined) ?? null;
          if (userId) {
            const userRef = db.collection('users').doc(userId);
            const delta = toBalanceUnit(usedMethod, cashActionDoc.amountIncl);
            const increment = cashActionDoc.cashActionType === 'collection'
              ? FieldValue.increment(-delta)
              : FieldValue.increment(delta);
            tx.update(userRef, { [balanceField(usedMethod)]: increment });
          }
        }
      }

      tx.update(cycleRef, {
        nextSequenceNo: nextSequenceNoAfter,
      });

      tx.update(billRef, {
        status: newStatus,
        currentSummary: newCurrentSummary,
        postSettlementState: newPostSettlementState,
        updatedAt: Timestamp.now(),
      });

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
