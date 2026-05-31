/**
 * recordPostSettlementCashAction ヘルパAPI（Step04 changeSpec §3.2.3）。
 *
 * 仕様書 04_cashActions管理.md の later パターン
 * （adjustment 既存 + 後続 cashAction で remaining を解消）を実装する。
 *
 * 保存先:
 * - bills/{billId}/settlementCycles/{cycleNo}/cashActions/{cashActionId}
 *
 * 同一 transaction で:
 * - cashAction doc 作成
 * - allocation 先 adjustments の `requiredActionRemainingIncl` 減算と `completed_by_cash_action` 遷移
 * - cycle.nextSequenceNo += 1
 * - 親 doc の currentSummary / postSettlementState / status / updatedAt 更新
 * - idempotency doc 保存
 *
 * 旧 `bills/{billId}/events` 経路には触れない。
 */

import { getFirestore, Timestamp, FieldValue } from 'firebase-admin/firestore';
import type { DocumentReference, DocumentSnapshot } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import * as crypto from 'crypto';

import { logOpsError, logOpsSuccess } from '../../../shared/logging/logOpsError';
import {
  FunctionCustomError,
  mapFunctionCustomErrorToHttpsCode,
} from '../../../shared/logging/functionCustomError';
import { calcBusinessDate } from './calcBusinessDate';
import {
  buildCurrentSummaryAfterCashAction,
  buildPostSettlementStateAfterCashAction,
  deriveStatusAfterCashAction,
} from '../services/parentSummary';
import {
  AdjustmentDirection,
  AdjustmentState,
  assertSingleSidedRemaining,
  summarizeRemainingByDirection,
} from '../services/adjustments';
import {
  applyAllocationsToAdjustments,
  buildCashActionDoc,
  CashActionAllocationEntry,
  CashActionDoc,
  CashActionMethodBreakdownEntry,
  CashActionType,
  ExistingAdjustmentForAllocation,
  validateAllocations,
} from '../services/cashActions';
import { getStoreConfig } from '../../../shared/config/configLoader';
import { DEFAULT_SIDE_GAME_CHIP_EXCHANGE_RATE } from '../../../shared/config/defaults';
import { buildCashActionAnalyticsDelta } from '../../analytics/services/aggregator/cashActionDelta';
import { processCashActionAnalyticsAtomically } from '../../analytics/services/applyCashActionToAnalytics';
import { loadTaxReportingBehavior } from '../../reporting/config/taxReportingBehaviorLoader';
import { buildCashActionEntry } from '../../reporting/services/entryBuilder';
import { writeReportingEntry } from '../../reporting/services/entryWriter';
import { applyEntryToReportingMonthly } from '../../reporting/services/monthlyUpdater';

const IDEMPOTENCY_KEY_PREFIX = 'recordPostSettlementCashAction';
const IDEMPOTENCY_TTL_HOURS = 48;

const ALLOWED_BILL_STATUSES_FOR_CASH_ACTION = new Set([
  'settled',
  'post_settlement_pending',
]);

const SPECIAL_METHODS = ['pointA', 'pointB', 'sideGameChip'] as const;
type SpecialMethod = (typeof SPECIAL_METHODS)[number];

function isSpecialMethod(method: string): method is SpecialMethod {
  return (SPECIAL_METHODS as readonly string[]).includes(method);
}

export interface RecordPostSettlementCashActionRequest {
  billId: string;
  idempotencyKey: string;
  cashActionType: CashActionType;
  amountIncl: number;
  executedBy: string | null;
  methodBreakdown: CashActionMethodBreakdownEntry[];
  allocations: CashActionAllocationEntry[];
  /** 任意。指定時はそのまま使用。未指定時は calcBusinessDate(executedAt) → bill.businessDate borrow の優先順位 */
  cashflowBusinessDate?: string;
  note?: string;
}

export interface RecordPostSettlementCashActionResponse {
  success: boolean;
  billId: string;
  cycleNo: number;
  cashActionId: string;
  cashAction: {
    sequenceNo: number;
    cashActionType: CashActionType;
    amountIncl: number;
    cashflowBusinessDate: string;
  };
  resolvedAdjustments: Array<{
    adjustmentId: string;
    requiredActionRemainingIncl: number;
    adjustmentState: AdjustmentState;
  }>;
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
  cashActionId: string;
  cashActionSequenceNo: number;
  cashActionType: CashActionType;
  cashActionAmountIncl: number;
  cashflowBusinessDate: string;
  resolvedAdjustments: Array<{
    adjustmentId: string;
    requiredActionRemainingIncl: number;
    adjustmentState: AdjustmentState;
  }>;
  parentStatus: 'post_settlement_pending' | 'settled';
  parentRequiredActionType: 'none' | 'collection' | 'refund';
  parentRequiredActionIncl: number;
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
    case 'ACCOUNTING_CASH_ACTION_INVALID':
      return 'validateCashActionInput';
    case 'ACCOUNTING_CASH_ACTION_OVER_ALLOCATION':
    case 'ACCOUNTING_CASH_ACTION_INVALID_ALLOCATION_TARGET':
      return 'validateAllocations';
    case 'ACCOUNTING_INVARIANT_VIOLATION':
      return 'enforceSingleSidedRemaining';
    default:
      return 'runCashActionTransaction';
  }
}

function buildResponseFromStored(
  billId: string,
  stored: IdempotencyStoredResult,
  reused: boolean
): RecordPostSettlementCashActionResponse {
  return {
    success: true,
    billId,
    cycleNo: stored.cycleNo,
    cashActionId: stored.cashActionId,
    cashAction: {
      sequenceNo: stored.cashActionSequenceNo,
      cashActionType: stored.cashActionType,
      amountIncl: stored.cashActionAmountIncl,
      cashflowBusinessDate: stored.cashflowBusinessDate,
    },
    resolvedAdjustments: stored.resolvedAdjustments,
    parent: {
      status: stored.parentStatus,
      requiredActionType: stored.parentRequiredActionType,
      requiredActionIncl: stored.parentRequiredActionIncl,
    },
    diagnostics: reused ? { reused: true } : undefined,
  };
}

export async function recordPostSettlementCashAction(
  request: RecordPostSettlementCashActionRequest
): Promise<RecordPostSettlementCashActionResponse> {
  const {
    billId,
    idempotencyKey,
    cashActionType,
    amountIncl,
    executedBy,
    methodBreakdown,
    allocations,
    cashflowBusinessDate: inputCashflowBusinessDate,
    note,
  } = request;

  if (!billId || typeof billId !== 'string') {
    throw new HttpsError('invalid-argument', 'billId is required');
  }
  if (!idempotencyKey || typeof idempotencyKey !== 'string') {
    throw new HttpsError('invalid-argument', 'idempotencyKey is required');
  }
  if (cashActionType !== 'refund' && cashActionType !== 'collection') {
    throw new HttpsError('invalid-argument', `cashActionType must be 'refund' or 'collection'`);
  }
  if (
    typeof amountIncl !== 'number' ||
    !Number.isFinite(amountIncl) ||
    amountIncl <= 0
  ) {
    throw new HttpsError('invalid-argument', 'amountIncl must be > 0 finite number');
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

  // Step07 changeSpec §5.3.1: transaction 内で組み立てた analytics delta を transaction 外で再利用する capture
  interface AnalyticsCaptureFromTx {
    billBusinessDate: string;
    billUserId: string | null;
    cashActionDoc: CashActionDoc;
    cashActionId: string;
  }
  let analyticsCapture: AnalyticsCaptureFromTx | null = null;

  interface ReportingCaptureFromTx {
    billBusinessDate: string;
    cashActionDoc: CashActionDoc;
    cashActionId: string;
    cycleNo: number;
    adjustmentLines: Array<{ targetCategory: string; amountInclDelta: number }>;
    linkedAdjustmentId: string | null;
  }
  let reportingCapture: ReportingCaptureFromTx | null = null;

  const requestHash = stableHashForRequest({
    billId,
    idempotencyKey,
    cashActionType,
    amountIncl,
    executedBy: executedBy ?? null,
    methodBreakdown: methodBreakdown.map((m) => ({ method: m.method, amountIncl: m.amountIncl })),
    allocations: allocations
      .map((a) => ({ adjustmentId: a.adjustmentId, amountIncl: a.amountIncl }))
      .sort((a, b) => a.adjustmentId.localeCompare(b.adjustmentId)),
    cashflowBusinessDate: inputCashflowBusinessDate ?? null,
    note: note ?? null,
  });

  // 期待 direction を cashActionType から確定（refund→decrease, collection→increase）
  const expectedDirection: AdjustmentDirection =
    cashActionType === 'refund' ? 'decrease' : 'increase';

  const executedAtDate = new Date();

  let reused = false;
  let resolvedCashflowBusinessDate = '';

  try {
    // cashflowBusinessDate を transaction の外で解決
    // （calcBusinessDate が transaction 内で別 collection を read するのを避ける）
    // ただし transaction 内では bill.businessDate を確定で取得したいので、
    // input が未指定の場合は一時的に空のまま transaction に入り、bill.businessDate を取った後で再解決する戦略にする。
    // → 実装をシンプルにするため、transaction 開始前に input → calcBusinessDate を試し、
    // bill.businessDate fallback だけ transaction 内で billData が取れた後に再評価する。

    if (typeof inputCashflowBusinessDate === 'string' && inputCashflowBusinessDate.length > 0) {
      resolvedCashflowBusinessDate = inputCashflowBusinessDate;
    } else {
      try {
        const result = await calcBusinessDate(executedAtDate);
        if (result.status === 'OK') {
          resolvedCashflowBusinessDate = result.businessDateKey;
        }
      } catch {
        // calcBusinessDate が HttpsError 等を投げた場合は fallback in transaction
      }
    }

    const stored: IdempotencyStoredResult = await db.runTransaction(async (tx) => {
      // 1) idempotency 既存検知
      const idemSnap = await tx.get(idempotencyRef);
      if (idemSnap.exists) {
        const existingHash = idemSnap.data()?.requestHash as string | undefined;
        if (existingHash && existingHash !== requestHash) {
          throw new FunctionCustomError({
            errorKey: 'ACCOUNTING_IDEMPOTENCY_MISMATCH',
            message: 'recordPostSettlementCashAction idempotency requestHash mismatch',
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
      if (!ALLOWED_BILL_STATUSES_FOR_CASH_ACTION.has(currentStatus)) {
        throw new FunctionCustomError({
          errorKey: 'ACCOUNTING_INVALID_STATE',
          message: `Cannot record cashAction. Current status: ${currentStatus}. Allowed: ${Array.from(
            ALLOWED_BILL_STATUSES_FOR_CASH_ACTION
          ).join(', ')}`,
          context: { billId, currentStatus },
        });
      }

      // bill.businessDate fallback
      if (resolvedCashflowBusinessDate.length === 0) {
        const billBusinessDate = (billData.businessDate as string | undefined) ?? '';
        if (billBusinessDate.length === 0) {
          throw new FunctionCustomError({
            errorKey: 'ACCOUNTING_CASH_ACTION_INVALID',
            message: 'cashflowBusinessDate cannot be resolved (input not given, calcBusinessDate not OK, bill.businessDate empty)',
            context: { billId },
          });
        }
        resolvedCashflowBusinessDate = billBusinessDate;
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

      // 4) allocation 先 adjustments を read（current cycle 配下のみ）
      const adjustmentsCollectionRef = cycleRef.collection('adjustments');
      const cashActionsCollectionRef = cycleRef.collection('cashActions');

      const allocationAdjustmentRefs: DocumentReference[] = allocations.map((a) =>
        adjustmentsCollectionRef.doc(a.adjustmentId)
      );
      const allocationAdjustmentSnaps = await Promise.all(
        allocationAdjustmentRefs.map((ref) => tx.get(ref))
      );

      const existingAdjustmentsForAllocation: ExistingAdjustmentForAllocation[] = [];
      for (let i = 0; i < allocationAdjustmentSnaps.length; i += 1) {
        const snap = allocationAdjustmentSnaps[i];
        const allocation = allocations[i];
        if (!snap.exists) {
          throw new FunctionCustomError({
            errorKey: 'ACCOUNTING_CASH_ACTION_INVALID_ALLOCATION_TARGET',
            message: `allocation target adjustment not found: ${allocation.adjustmentId}`,
            context: { billId, adjustmentId: allocation.adjustmentId },
          });
        }
        const data = snap.data()!;
        existingAdjustmentsForAllocation.push({
          adjustmentId: snap.id,
          cycleNo: currentSettlementCycle,
          adjustmentDirection: data.adjustmentDirection as AdjustmentDirection,
          adjustmentState: data.adjustmentState as AdjustmentState,
          requiredActionRemainingIncl: data.requiredActionRemainingIncl as number,
        });
      }

      // 同一 cycle 内の全 effective adjustment（不変則検証用）
      // 注意: allocations に含まれない adjustment も remaining 集計の対象になるため全件 read する
      const allAdjustmentsSnap = await tx.get(adjustmentsCollectionRef);
      const allExistingAdjustments: ExistingAdjustmentForAllocation[] =
        allAdjustmentsSnap.docs.map((doc) => {
          const data = doc.data();
          return {
            adjustmentId: doc.id,
            cycleNo: currentSettlementCycle,
            adjustmentDirection: data.adjustmentDirection as AdjustmentDirection,
            adjustmentState: data.adjustmentState as AdjustmentState,
            requiredActionRemainingIncl: data.requiredActionRemainingIncl as number,
          };
        });

      // 4.5) 特殊メソッド処理（残高確認・返金バリデーション）
      const specialEntries = methodBreakdown.filter((e) => isSpecialMethod(e.method));
      const hasSpecial = specialEntries.length > 0;

      let userRef: DocumentReference | null = null;
      let userSnap: DocumentSnapshot | null = null;

      if (hasSpecial) {
        const userId = (billData.party?.userId as string | null) ?? null;
        if (!userId) {
          throw new FunctionCustomError({
            errorKey: 'ACCOUNTING_CASH_ACTION_INVALID',
            message: 'ポイント/チップ決済にはユーザー紐付きの伝票が必要です',
            context: { billId },
          });
        }
        userRef = db.collection('users').doc(userId);
        userSnap = await tx.get(userRef);
        if (!userSnap.exists) {
          throw new FunctionCustomError({
            errorKey: 'ACCOUNTING_CASH_ACTION_INVALID',
            message: 'ユーザー情報が見つかりません',
            context: { billId, userId },
          });
        }
      }

      // 4.6) 返金バリデーション（paymentTotals が存在する bill のみ適用）
      const paymentTotals: Record<string, number> =
        (billData.paymentTotals as Record<string, number> | undefined) ?? {};
      const hasPaymentTotals = Object.keys(paymentTotals).length > 0;

      if (cashActionType === 'refund' && hasPaymentTotals) {
        // 当 cycle の既存 cashActions を全件読み込み、
        // 返金済み額・追加徴収済み額をメソッド別に集計する
        const allCashActionsSnap = await tx.get(cashActionsCollectionRef);
        const alreadyRefundedByMethod: Record<string, number> = {};
        const alreadyCollectedByMethod: Record<string, number> = {};
        for (const caDoc of allCashActionsSnap.docs) {
          const caData = caDoc.data();
          const breakdown = Array.isArray(caData.methodBreakdown) ? caData.methodBreakdown : [];
          for (const entry of breakdown) {
            const m = entry.method as string;
            const amt = (entry.amountIncl as number) ?? 0;
            if (caData.cashActionType === 'refund') {
              alreadyRefundedByMethod[m] = (alreadyRefundedByMethod[m] ?? 0) + amt;
            } else if (caData.cashActionType === 'collection') {
              alreadyCollectedByMethod[m] = (alreadyCollectedByMethod[m] ?? 0) + amt;
            }
          }
        }

        // 各メソッドの返金可能上限を検証（paymentTotals にエントリがある手段のみ）
        // 返金可能上限 = 最初の会計で支払った額 + 追加徴収で受け取った額 - すでに返金した額
        for (const entry of methodBreakdown) {
          const method = entry.method;
          if (!(method in paymentTotals)) continue; // paymentTotals に記録のない手段はスキップ
          const originalPaid = paymentTotals[method] ?? 0;
          const alreadyCollected = alreadyCollectedByMethod[method] ?? 0;
          const alreadyRefunded = alreadyRefundedByMethod[method] ?? 0;
          const remainingRefundable = originalPaid + alreadyCollected - alreadyRefunded;
          if (entry.amountIncl > remainingRefundable) {
            throw new FunctionCustomError({
              errorKey: 'ACCOUNTING_CASH_ACTION_INVALID',
              message: `${method} の返金可能額を超えています。返金可能残額: ¥${remainingRefundable}、要求額: ¥${entry.amountIncl}`,
              context: { billId, method, originalPaid, alreadyCollected, alreadyRefunded, requested: entry.amountIncl },
            });
          }
        }
      }

      // 4.7) 追加徴収時の残高不足チェック
      if (cashActionType === 'collection' && hasSpecial && userSnap) {
        const userData = userSnap.data()!;
        for (const entry of specialEntries) {
          const method = entry.method as SpecialMethod;
          const requiredBalance =
            method === 'sideGameChip'
              ? Math.floor(entry.amountIncl / chipRate)
              : Math.floor(entry.amountIncl);
          const currentBalance = (userData[method] as number | undefined) ?? 0;
          if (currentBalance < requiredBalance) {
            const unit = method === 'sideGameChip' ? '枚' : '円';
            throw new FunctionCustomError({
              errorKey: 'ACCOUNTING_CASH_ACTION_INVALID',
              message: `${method} の残高が不足しています。残高: ${currentBalance}${unit}、必要: ${requiredBalance}${unit}`,
              context: { billId, method, currentBalance, requiredBalance },
            });
          }
        }
      }

      // 5) allocations 検証（仕様書 §9.4 / §15）
      try {
        validateAllocations({
          allocations,
          cashActionAmountIncl: amountIncl,
          existingAdjustments: existingAdjustmentsForAllocation,
          expectedCycleNo: currentSettlementCycle,
          expectedDirection,
        });
      } catch (validationError) {
        const message =
          validationError instanceof Error
            ? validationError.message
            : String(validationError);
        const errorKey: 'ACCOUNTING_CASH_ACTION_OVER_ALLOCATION' | 'ACCOUNTING_CASH_ACTION_INVALID_ALLOCATION_TARGET' | 'ACCOUNTING_CASH_ACTION_INVALID' =
          /over-allocation/.test(message)
            ? 'ACCOUNTING_CASH_ACTION_OVER_ALLOCATION'
            : /not found|cycle|direction|effective|remaining|duplicate/i.test(message)
              ? 'ACCOUNTING_CASH_ACTION_INVALID_ALLOCATION_TARGET'
              : 'ACCOUNTING_CASH_ACTION_INVALID';
        throw new FunctionCustomError({
          errorKey,
          message,
          context: { billId, cashActionType, amountIncl },
        });
      }

      // 6) cashAction doc 組立
      const cashActionDocRef = cashActionsCollectionRef.doc();
      const executedAt = Timestamp.fromDate(executedAtDate);

      let cashActionDoc: CashActionDoc;
      try {
        cashActionDoc = buildCashActionDoc({
          sequenceNo: startSequenceNo,
          cashActionType,
          amountIncl,
          executedAt,
          executedBy: executedBy ?? null,
          cashflowBusinessDate: resolvedCashflowBusinessDate,
          methodBreakdown,
          allocations,
          note,
        });
      } catch (validationError) {
        throw new FunctionCustomError({
          errorKey: 'ACCOUNTING_CASH_ACTION_INVALID',
          message:
            validationError instanceof Error
              ? validationError.message
              : String(validationError),
          context: { billId, cashActionType, amountIncl },
        });
      }

      // 7) adjustment patch 計算
      const allocationResult = applyAllocationsToAdjustments({
        allocations,
        existingAdjustments: allExistingAdjustments,
      });

      // 8) summarize remaining
      const remainingByDirection = summarizeRemainingByDirection(
        allocationResult.adjustmentsAfterUpdate.map((adj) => ({
          adjustmentDirection: adj.adjustmentDirection,
          adjustmentState: adj.adjustmentState,
          requiredActionRemainingIncl: adj.requiredActionRemainingIncl,
        }))
      );

      // 仕様書 03 §16.3 の不変則
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

      // 9) parent 反映材料
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
      }) as Parameters<typeof buildPostSettlementStateAfterCashAction>[0]['existingState'];

      const newPostSettlementState = buildPostSettlementStateAfterCashAction({
        existingState: existingPostSettlementState,
        cashActionType,
        cashActionAmountIncl: amountIncl,
        summarizedRemaining: remainingByDirection,
        lastRecordAt: executedAt,
        lastRecordId: cashActionDocRef.id,
      });

      const existingCurrentSummary = (billData.currentSummary ?? {
        claimTotalIncl: 0,
        receivedTotalIncl: 0,
        refundedTotalIncl: 0,
        netSalesIncl: 0,
      }) as Parameters<typeof buildCurrentSummaryAfterCashAction>[0]['existingSummary'];

      const newCurrentSummary = buildCurrentSummaryAfterCashAction({
        existingSummary: existingCurrentSummary,
        cashActionType,
        cashActionAmountIncl: amountIncl,
      });

      const newStatus = deriveStatusAfterCashAction({
        refundRemainingTotal: remainingByDirection.refundRemainingTotal,
        collectionRemainingTotal: remainingByDirection.collectionRemainingTotal,
      });

      // 10) write
      tx.set(cashActionDocRef, cashActionDoc, { merge: false });

      for (const [adjustmentId, patch] of allocationResult.patches.entries()) {
        if (patch.adjustmentState) {
          tx.update(adjustmentsCollectionRef.doc(adjustmentId), {
            requiredActionRemainingIncl: patch.requiredActionRemainingIncl,
            adjustmentState: patch.adjustmentState,
          });
        } else {
          tx.update(adjustmentsCollectionRef.doc(adjustmentId), {
            requiredActionRemainingIncl: patch.requiredActionRemainingIncl,
          });
        }
      }

      tx.update(cycleRef, {
        nextSequenceNo: startSequenceNo + 1,
      });

      tx.update(billRef, {
        status: newStatus,
        currentSummary: newCurrentSummary,
        postSettlementState: newPostSettlementState,
        updatedAt: Timestamp.now(),
      });

      // 10.5) ユーザー残高更新（特殊メソッドがある場合のみ）
      if (hasSpecial && userRef) {
        const balanceUpdates: Record<string, FieldValue> = {
          updatedAt: FieldValue.serverTimestamp(),
        };
        for (const entry of specialEntries) {
          const method = entry.method as SpecialMethod;
          const delta =
            method === 'sideGameChip'
              ? Math.floor(entry.amountIncl / chipRate)
              : Math.floor(entry.amountIncl);
          if (delta > 0) {
            // collection: 差し引き（-）、refund: 加算（+）
            const sign = cashActionType === 'collection' ? -1 : 1;
            balanceUpdates[method] = FieldValue.increment(sign * delta);
          }
        }
        if (Object.keys(balanceUpdates).length > 1) {
          tx.update(userRef, balanceUpdates);
        }
      }

      // resolvedAdjustments の shape は patch されたものだけを返す
      const resolvedAdjustments = Array.from(allocationResult.patches.entries()).map(
        ([adjustmentId, patch]) => ({
          adjustmentId,
          requiredActionRemainingIncl: patch.requiredActionRemainingIncl,
          adjustmentState:
            patch.adjustmentState ??
            (allocationResult.adjustmentsAfterUpdate.find((a) => a.adjustmentId === adjustmentId)
              ?.adjustmentState as AdjustmentState) ??
            'effective',
        })
      );

      const storedResult: IdempotencyStoredResult = {
        cycleNo: currentSettlementCycle,
        cashActionId: cashActionDocRef.id,
        cashActionSequenceNo: startSequenceNo,
        cashActionType,
        cashActionAmountIncl: amountIncl,
        cashflowBusinessDate: resolvedCashflowBusinessDate,
        resolvedAdjustments,
        parentStatus: newStatus,
        parentRequiredActionType: newPostSettlementState.requiredActionType,
        parentRequiredActionIncl: newPostSettlementState.requiredActionIncl,
      };

      // 11) idempotency doc 保存
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
        cashActionDoc,
        cashActionId: cashActionDocRef.id,
      };

      // Reporting: capture adjustment lines from allocation targets
      const reportingAdjustmentLines: Array<{ targetCategory: string; amountInclDelta: number }> = [];
      for (const snap of allocationAdjustmentSnaps) {
        if (snap.exists) {
          const data = snap.data()!;
          const lines = Array.isArray(data.lines) ? data.lines : [];
          for (const line of lines) {
            if (line.targetCategory && typeof line.amountInclDelta === 'number') {
              reportingAdjustmentLines.push({
                targetCategory: line.targetCategory,
                amountInclDelta: line.amountInclDelta,
              });
            }
          }
        }
      }

      reportingCapture = {
        billBusinessDate: (billData.businessDate as string | undefined) ?? '',
        cashActionDoc,
        cashActionId: cashActionDocRef.id,
        cycleNo: currentSettlementCycle,
        adjustmentLines: reportingAdjustmentLines,
        linkedAdjustmentId: allocations.length === 1 ? allocations[0].adjustmentId : null,
      };

      return storedResult;
    });

    const response = buildResponseFromStored(billId, stored, reused);

    // Step07 changeSpec §5.3.1 / §5.6: analytics 更新は main transaction 後の separate-tx で実施。
    // - reused（idempotent 再呼び出し）: 何もしない（適用済み）
    // - feature flag OFF: 何もしない
    // - businessDate が空: 反映スキップ（古い bill だけ起こり得る防御）
    // - 失敗時: callable 自体は成功させ、ops error log のみ残す
    let analyticsApplied = false;
    if (!reused && analyticsEnabled && analyticsCapture) {
      const capture = analyticsCapture as AnalyticsCaptureFromTx;
      const monthKey = capture.billBusinessDate.length >= 7 ? capture.billBusinessDate.substring(0, 7) : '';
      if (monthKey.length > 0 && capture.billBusinessDate.length > 0) {
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
          analyticsApplied = true;
        } catch (analyticsError) {
          logOpsError({
            message: 'recordPostSettlementCashAction analytics failed',
            functionEntry: 'recordPostSettlementCashAction',
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

    let reportingApplied = false;
    if (!reused && reportingEnabled && reportingCapture) {
      const capture = reportingCapture as ReportingCaptureFromTx;
      if (capture.billBusinessDate.length > 0) {
        try {
          const taxBehavior = await loadTaxReportingBehavior();

          const methodBreakdownMap: Record<string, number> = {};
          for (const mbEntry of capture.cashActionDoc.methodBreakdown) {
            methodBreakdownMap[mbEntry.method] = (methodBreakdownMap[mbEntry.method] ?? 0) + mbEntry.amountIncl;
          }

          const reportingEntry = buildCashActionEntry({
            billId,
            cycleNo: capture.cycleNo,
            cashActionId: capture.cashActionId,
            cashActionType: capture.cashActionDoc.cashActionType,
            amountIncl: capture.cashActionDoc.amountIncl,
            methodBreakdown: methodBreakdownMap,
            adjustmentLines: capture.adjustmentLines,
            businessDate: capture.billBusinessDate,
            cashActionExecutedAt: capture.cashActionDoc.executedAt as Timestamp,
            dateRule: taxBehavior.dateRule,
            linkedAdjustmentId: capture.linkedAdjustmentId,
            isImmediate: false,
          });

          const { written } = await writeReportingEntry(db, reportingEntry);
          if (written) {
            await applyEntryToReportingMonthly(db, reportingEntry);
          }
          reportingApplied = true;
        } catch (reportingError) {
          logOpsError({
            message: 'recordPostSettlementCashAction reporting write failed',
            functionEntry: 'recordPostSettlementCashAction',
            operation: 'writeReportingEntry',
            cause: reportingError,
            context: { billId, cashActionId: capture.cashActionId },
          });
        }
      }
    }

    logOpsSuccess({
      message: 'recordPostSettlementCashAction 成功',
      functionEntry: 'recordPostSettlementCashAction',
      operation: 'recordPostSettlementCashActionRepo',
      context: {
        billId,
        idempotencyKey: idempotencyDocId,
        reused,
        requestHash8: shortHash(requestHash),
        cashActionId: response.cashActionId,
        cashActionType: response.cashAction.cashActionType,
        cashActionAmountIncl: response.cashAction.amountIncl,
        parentStatus: response.parent.status,
        analyticsApplied,
        analyticsEnabled,
        reportingApplied,
        reportingEnabled,
      },
    });

    return response;
  } catch (error) {
    if (error instanceof FunctionCustomError) {
      logOpsError({
        message: 'recordPostSettlementCashAction failed',
        functionEntry: 'recordPostSettlementCashAction',
        operation: operationForErrorKey(error.errorKey),
        cause: error,
        context: {
          billId,
          idempotencyKey: idempotencyDocId,
          cashActionType,
          amountIncl,
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
      message: 'recordPostSettlementCashAction failed',
      functionEntry: 'recordPostSettlementCashAction',
      operation: 'runCashActionTransaction',
      cause: error,
      context: {
        billId,
        idempotencyKey: idempotencyDocId,
        cashActionType,
        amountIncl,
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
      `recordPostSettlementCashAction failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
