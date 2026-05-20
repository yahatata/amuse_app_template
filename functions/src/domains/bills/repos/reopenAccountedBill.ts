/**
 * reopenAccountedBill ヘルパAPI（Step05 changeSpec §5.2）。
 *
 * 仕様書 05_reopenと再会計.md と上流 11_事後イベントの機能と業務パターン.md §6〜§10 に基づく。
 *
 * 概要:
 * - 会計済み（settled / post_settlement_pending）かつ当日営業日の bill を `open` に戻す
 * - 旧 cycle を `cycleState='reopened'` で閉じる
 * - 旧 cycle 配下の effective adjustments を `cancelled_by_reopen` に遷移
 * - 親 doc を `open` 状態に reset（currentSummary / postSettlementState）
 * - `reopenSummary` を更新（currentSettlementCycle += 1、latestSettledCycle 据え置き）
 * - 新 cycle を `cycleState='open'`、`openedReason='reopen'`、baselineSnapshot なしで生成
 *
 * 旧 reopen 経路（postEventReopen / billsEventsOnCreate）には触らない。
 */

import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import * as crypto from "crypto";

import {
  logOpsError,
  logOpsSuccess,
} from "../../../shared/logging/logOpsError";
import {
  FunctionCustomError,
  mapFunctionCustomErrorToHttpsCode,
} from "../../../shared/logging/functionCustomError";
import { getCurrentBusinessDateKeyOrThrow } from "../../storeMeta/repos/getCurrentBusinessDateKeyOrThrow";
import { buildParentDocPatchForReopen } from "../services/parentSummary";
import {
  buildInitialCycleDoc,
  buildReopenedCycleDocPatch,
} from "../services/settlementCycles";
import {
  AdjustmentLine,
  buildAdjustmentCancelledByReopenPatch,
} from "../services/adjustments";
import { CashActionMethodBreakdownEntry } from "../services/cashActions";
import { getStoreConfig } from "../../../shared/config/configLoader";
import {
  processReopenRollbackAnalyticsAtomically,
  ReopenRollbackInput,
} from "../../analytics/services/applyReopenRollbackToAnalytics";

const IDEMPOTENCY_KEY_PREFIX = "reopenAccountedBill";
const IDEMPOTENCY_TTL_HOURS = 48;

const ALLOWED_BILL_STATUSES_FOR_REOPEN = new Set([
  "settled",
  "post_settlement_pending",
]);

export interface ReopenAccountedBillRequest {
  billId: string;
  idempotencyKey: string;
  /** 任意。reopen 理由メモ */
  reason?: string | null;
  /** 実行者 uid（callable レイヤで context.auth.uid から渡す） */
  reopenedBy: string | null;
}

export interface ReopenAccountedBillResponse {
  success: boolean;
  billId: string;
  oldCycleNo: number;
  newCycleNo: number;
  reopenedAt: Timestamp;
  cancelledAdjustmentIds: string[];
  diagnostics?: {
    reused?: boolean;
  };
}

interface IdempotencyStoredResult {
  oldCycleNo: number;
  newCycleNo: number;
  reopenedAtSeconds: number;
  reopenedAtNanos: number;
  cancelledAdjustmentIds: string[];
}

function stableHashForRequest(input: unknown): string {
  const json = JSON.stringify(input, Object.keys((input as any) ?? {}).sort());
  return crypto.createHash("sha256").update(json).digest("hex");
}

function shortHash(value: string): string {
  return value.substring(0, 8);
}

function operationForErrorKey(key: string): string {
  switch (key) {
    case "ACCOUNTING_IDEMPOTENCY_MISMATCH":
      return "validateIdempotencyRequest";
    case "ACCOUNTING_INVALID_STATE":
      return "validateBillState";
    case "BILLS_REOPEN_NOT_TODAY":
      return "validateReopenBusinessDate";
    case "BILLS_REOPEN_NEVER_SETTLED":
      return "validateLatestSettledCycle";
    case "BILLS_REOPEN_CYCLE_STATE_INVALID":
      return "validateOldCycleState";
    case "ACCOUNTING_BILL_NOT_FOUND":
    case "ACCOUNTING_CYCLE_NOT_FOUND":
      return "loadBillContext";
    default:
      return "runReopenTransaction";
  }
}

function buildResponseFromStored(
  billId: string,
  stored: IdempotencyStoredResult,
  reused: boolean,
): ReopenAccountedBillResponse {
  return {
    success: true,
    billId,
    oldCycleNo: stored.oldCycleNo,
    newCycleNo: stored.newCycleNo,
    reopenedAt: new Timestamp(stored.reopenedAtSeconds, stored.reopenedAtNanos),
    cancelledAdjustmentIds: stored.cancelledAdjustmentIds,
    diagnostics: reused ? { reused: true } : undefined,
  };
}

export async function reopenAccountedBill(
  request: ReopenAccountedBillRequest,
): Promise<ReopenAccountedBillResponse> {
  const { billId, idempotencyKey, reason, reopenedBy } = request;

  if (!billId || typeof billId !== "string") {
    throw new HttpsError("invalid-argument", "billId is required");
  }
  if (!idempotencyKey || typeof idempotencyKey !== "string") {
    throw new HttpsError("invalid-argument", "idempotencyKey is required");
  }

  const db = getFirestore();
  const billRef = db.collection("bills").doc(billId);
  const idempotencyDocId = `${IDEMPOTENCY_KEY_PREFIX}:${idempotencyKey}`;
  const idempotencyRef = billRef
    .collection("idempotency")
    .doc(idempotencyDocId);

  // Step07 changeSpec §5.6: feature flag を transaction 外で読み取る
  const storeConfig = await getStoreConfig();
  const analyticsEnabled =
    storeConfig.features?.settlementAggregatorEnabled === true;

  // Step07 changeSpec §5.3.5 / §5.5.3: transaction 内で組み立てた rollback 入力を
  // transaction 外で再利用するための capture
  interface AnalyticsRollbackCapture {
    monthKey: string;
    businessDate: string;
    oldCycleNo: number;
    billUserId: string | null;
    input: ReopenRollbackInput;
  }
  let analyticsRollbackCapture: AnalyticsRollbackCapture | null = null;

  const requestHash = stableHashForRequest({
    billId,
    idempotencyKey,
    reason: reason ?? null,
    reopenedBy: reopenedBy ?? null,
  });

  let reused = false;

  // 当日営業日 key を transaction 開始前に取得（storeMeta は別 collection で master 管理）
  let currentBusinessDateKey: string;
  try {
    currentBusinessDateKey = await getCurrentBusinessDateKeyOrThrow();
  } catch (error) {
    logOpsError({
      message: "reopenAccountedBill failed at getCurrentBusinessDateKeyOrThrow",
      functionEntry: "reopenAccountedBill",
      operation: "loadCurrentBusinessDateKey",
      cause: error,
      context: { billId, result: "fail" },
    });
    if (error instanceof HttpsError) {
      throw error;
    }
    if (error instanceof FunctionCustomError) {
      throw new HttpsError(
        mapFunctionCustomErrorToHttpsCode(error.errorKey),
        error.message,
      );
    }
    throw new HttpsError(
      "failed-precondition",
      "Cannot resolve current business date for reopen.",
    );
  }

  try {
    const stored: IdempotencyStoredResult = await db.runTransaction(
      async (tx) => {
        // 1) idempotency 既存検知
        const idemSnap = await tx.get(idempotencyRef);
        if (idemSnap.exists) {
          const existingHash = idemSnap.data()?.requestHash as
            | string
            | undefined;
          if (existingHash && existingHash !== requestHash) {
            throw new FunctionCustomError({
              errorKey: "ACCOUNTING_IDEMPOTENCY_MISMATCH",
              message: "reopenAccountedBill idempotency requestHash mismatch",
              context: {
                billId,
                expectedHash8: shortHash(existingHash),
                gotHash8: shortHash(requestHash),
              },
            });
          }
          const storedResult = idemSnap.data()?.result as
            | IdempotencyStoredResult
            | undefined;
          if (!storedResult) {
            throw new HttpsError(
              "internal",
              "idempotency exists but stored result is missing",
            );
          }
          reused = true;
          return storedResult;
        }

        // 2) bill doc read
        const billSnap = await tx.get(billRef);
        if (!billSnap.exists) {
          throw new FunctionCustomError({
            errorKey: "ACCOUNTING_BILL_NOT_FOUND",
            message: `Bill ${billId} not found`,
            context: { billId },
          });
        }
        const billData = billSnap.data()!;

        // 3) status precondition
        const currentStatus: string = billData.status ?? "open";
        if (!ALLOWED_BILL_STATUSES_FOR_REOPEN.has(currentStatus)) {
          throw new FunctionCustomError({
            errorKey: "ACCOUNTING_INVALID_STATE",
            message: `Cannot reopen. Current status: ${currentStatus}. Allowed: ${Array.from(
              ALLOWED_BILL_STATUSES_FOR_REOPEN,
            ).join(", ")}`,
            context: { billId, currentStatus },
          });
        }

        // 4) 当日営業日 precondition (上流 §7)
        const billBusinessDate: string | undefined = billData.businessDate;
        if (!billBusinessDate || billBusinessDate !== currentBusinessDateKey) {
          throw new FunctionCustomError({
            errorKey: "BILLS_REOPEN_NOT_TODAY",
            message: `Cannot reopen. bill.businessDate (${billBusinessDate ?? "null"}) does not match current business date (${currentBusinessDateKey}). Only same-business-day reopen is allowed.`,
            context: {
              billId,
              billBusinessDate: billBusinessDate ?? null,
              currentBusinessDateKey,
            },
          });
        }

        // 5) latestSettledCycle precondition
        const reopenSummary = billData.reopenSummary ?? {
          hasReopenHistory: false,
          reopenCount: 0,
          currentSettlementCycle: 1,
          latestSettledCycle: 0,
          lastReopenedAt: null,
          lastReopenedBy: null,
          lastResettledAt: null,
        };
        const latestSettledCycle: number =
          reopenSummary.latestSettledCycle ?? 0;
        if (latestSettledCycle < 1) {
          throw new FunctionCustomError({
            errorKey: "BILLS_REOPEN_NEVER_SETTLED",
            message: `Cannot reopen bill that has never been settled (latestSettledCycle=${latestSettledCycle}).`,
            context: { billId, latestSettledCycle },
          });
        }

        const oldCycleNo: number = reopenSummary.currentSettlementCycle ?? 1;
        const newCycleNo = oldCycleNo + 1;
        const billParty = (billData.party ?? {}) as {
          userId?: string | null;
          pokerName?: string | null;
        };
        const billUserId = billParty.userId ?? null;
        const billPokerName = billParty.pokerName ?? null;
        const activeStayRef = billUserId
          ? db.collection("activeStays").doc(billUserId)
          : null;
        const activeStaySnap = activeStayRef ? await tx.get(activeStayRef) : null;
        const existingStartedAt = activeStaySnap?.data()?.startedAt;

        // 6) old cycle read
        const oldCycleRef = billRef
          .collection("settlementCycles")
          .doc(String(oldCycleNo));
        const oldCycleSnap = await tx.get(oldCycleRef);
        if (!oldCycleSnap.exists) {
          throw new FunctionCustomError({
            errorKey: "ACCOUNTING_CYCLE_NOT_FOUND",
            message: `settlementCycle ${oldCycleNo} not found for bill ${billId}`,
            context: { billId, oldCycleNo },
          });
        }
        const oldCycleData = oldCycleSnap.data()!;
        const oldCycleState: string = oldCycleData.cycleState ?? "unknown";
        if (oldCycleState !== "settled") {
          throw new FunctionCustomError({
            errorKey: "BILLS_REOPEN_CYCLE_STATE_INVALID",
            message: `Cannot reopen. Old cycle ${oldCycleNo} state is '${oldCycleState}', expected 'settled'.`,
            context: { billId, oldCycleNo, oldCycleState },
          });
        }

        // 7) old cycle 配下 effective adjustments を read
        const adjustmentsColl = oldCycleRef.collection("adjustments");
        const adjustmentsSnap = await tx.get(
          adjustmentsColl.where("adjustmentState", "==", "effective"),
        );
        const cancelledAdjustmentIds: string[] = adjustmentsSnap.docs.map(
          (d) => d.id,
        );

        // Step07 changeSpec §5.3.5: rollback 用に old cycle 配下の adjustments の lines / cashActions の methodBreakdown を read。
        // - effective adjustments 以外（cancelled_by_reopen / completed_by_cash_action / superseded）も含めて、
        //   analytics に反映済みの全 adjustments を rollback 対象とする（settle 直後の場合は通常 effective のみだが、
        //   その後の cashAction 紐付けで `completed_by_cash_action` 状態に遷移しているケースも analytics 反映済み）。
        // - cashActions は `cashActionType==='collection'` のみが paymentTotals に反映されているため
        //   refund はロールバック対象外。
        const allAdjustmentsSnap = await tx.get(adjustmentsColl);
        const adjustmentsLinesForRollback: AdjustmentLine[][] =
          allAdjustmentsSnap.docs
            .filter((d) => {
              const data = d.data();
              // cancelled_by_reopen は元から analytics 反映なしなので除外
              // それ以外は反映済みとして rollback 対象
              return data.adjustmentState !== "cancelled_by_reopen";
            })
            .map((d) => {
              const data = d.data();
              return Array.isArray(data.lines)
                ? (data.lines as AdjustmentLine[])
                : [];
            });

        const cashActionsColl = oldCycleRef.collection("cashActions");
        const cashActionsSnap = await tx.get(cashActionsColl);
        const collectionCashActionsMethodBreakdownForRollback: CashActionMethodBreakdownEntry[][] =
          cashActionsSnap.docs
            .filter((d) => {
              const data = d.data();
              return data.cashActionType === "collection";
            })
            .map((d) => {
              const data = d.data();
              return Array.isArray(data.methodBreakdown)
                ? (data.methodBreakdown as CashActionMethodBreakdownEntry[])
                : [];
            });

        // 8) old cycle patch
        const now = Timestamp.now();
        tx.update(oldCycleRef, buildReopenedCycleDocPatch({ closedAt: now }));

        // 9) effective adjustments を `cancelled_by_reopen` に patch
        const adjustmentPatch = buildAdjustmentCancelledByReopenPatch({
          cancelledAt: now,
          cancelledBy: reopenedBy ?? null,
        });
        for (const adjDoc of adjustmentsSnap.docs) {
          tx.update(adjDoc.ref, adjustmentPatch);
        }

        // 10) parent doc patch
        const parentPatch = buildParentDocPatchForReopen({
          existingReopenSummary: reopenSummary,
          oldCycleNo,
          reopenedAt: now,
          reopenedBy: reopenedBy ?? null,
        });
        tx.update(billRef, {
          ...parentPatch,
          updatedAt: now,
        });

        // 11) activeStays/{uid} を復帰
        if (billUserId && activeStayRef) {
          tx.set(
            activeStayRef,
            {
              uid: billUserId,
              billId,
              pokerName: billPokerName,
              isActive: true,
              startedAt: existingStartedAt ?? now,
            },
            { merge: true },
          );
        }

        // 12) new cycle create (baselineSnapshot は作らない)
        const newCycleRef = billRef
          .collection("settlementCycles")
          .doc(String(newCycleNo));
        tx.set(
          newCycleRef,
          buildInitialCycleDoc({
            cycleNo: newCycleNo,
            openedAt: now,
            openedBy: reopenedBy ?? null,
            openedReason: "reopen",
            openedFromCycleNo: oldCycleNo,
          }),
        );

        // 13) idempotency set
        const storedResult: IdempotencyStoredResult = {
          oldCycleNo,
          newCycleNo,
          reopenedAtSeconds: now.seconds,
          reopenedAtNanos: now.nanoseconds,
          cancelledAdjustmentIds,
        };
        const expiresAt = new Timestamp(
          now.seconds + IDEMPOTENCY_TTL_HOURS * 3600,
          now.nanoseconds,
        );
        tx.set(idempotencyRef, {
          operation: IDEMPOTENCY_KEY_PREFIX,
          requestHash,
          result: storedResult,
          createdAt: now,
          expiresAt,
        });

        // Step07 changeSpec §5.3.5: analytics rollback 用 capture
        const billBusinessDateForCapture: string =
          (billData.businessDate as string | undefined) ?? "";
        const billUserIdForCapture: string | null = billUserId;
        analyticsRollbackCapture = {
          monthKey:
            billBusinessDateForCapture.length >= 7
              ? billBusinessDateForCapture.substring(0, 7)
              : "",
          businessDate: billBusinessDateForCapture,
          oldCycleNo,
          billUserId: billUserIdForCapture,
          input: {
            // billData (transaction 内で読んだもの) は settle 時の snapshot を含む
            // （categoryBreakdown / tournamentsSnapshot / paymentTotals / amounts.grandTotalRounded）
            billDataAtSettle: billData,
            adjustmentsLines: adjustmentsLinesForRollback,
            collectionCashActionsMethodBreakdown:
              collectionCashActionsMethodBreakdownForRollback,
          },
        };

        return storedResult;
      },
    );

    const response = buildResponseFromStored(billId, stored, reused);

    // Step07 changeSpec §5.3.5 / §5.6: analytics rollback は main transaction 後の separate-tx で実施。
    // - reused（idempotent 再呼び出し）: 何もしない（適用済み）
    // - feature flag OFF: 何もしない
    // - businessDate / monthKey が空: 反映スキップ
    // - 失敗時: callable 自体は成功させ、ops error log のみ残す
    let analyticsRollbackApplied = false;
    if (!reused && analyticsEnabled && analyticsRollbackCapture) {
      const capture = analyticsRollbackCapture as AnalyticsRollbackCapture;
      if (capture.monthKey.length > 0 && capture.businessDate.length > 0) {
        try {
          await processReopenRollbackAnalyticsAtomically(db, {
            monthKey: capture.monthKey,
            businessDate: capture.businessDate,
            billId,
            oldCycleNo: capture.oldCycleNo,
            billUserId: capture.billUserId,
            input: capture.input,
          });
          analyticsRollbackApplied = true;
        } catch (analyticsError) {
          logOpsError({
            message: "reopenAccountedBill analytics rollback failed",
            functionEntry: "reopenAccountedBill",
            operation: "processReopenRollbackAnalyticsAtomically",
            cause: analyticsError,
            context: {
              billId,
              oldCycleNo: capture.oldCycleNo,
              result: "fail",
              requestHash8: shortHash(requestHash),
            },
          });
        }
      }
    }

    logOpsSuccess({
      message: "reopenAccountedBill 成功",
      functionEntry: "reopenAccountedBill",
      operation: "reopenAccountedBillRepo",
      context: {
        billId,
        idempotencyKey: idempotencyDocId,
        reused,
        oldCycleNo: stored.oldCycleNo,
        newCycleNo: stored.newCycleNo,
        cancelledAdjustmentCount: stored.cancelledAdjustmentIds.length,
        requestHash8: shortHash(requestHash),
        analyticsRollbackApplied,
        analyticsEnabled,
      },
    });

    return response;
  } catch (error) {
    const errorKey =
      error instanceof FunctionCustomError
        ? error.errorKey
        : "INTERNAL_UNKNOWN";
    logOpsError({
      message: "reopenAccountedBill failed",
      functionEntry: "reopenAccountedBill",
      operation: operationForErrorKey(errorKey),
      cause: error,
      context: {
        billId,
        idempotencyKey: idempotencyDocId,
        result: "fail",
        requestHash8: shortHash(requestHash),
      },
    });

    if (error instanceof FunctionCustomError) {
      throw new HttpsError(
        mapFunctionCustomErrorToHttpsCode(error.errorKey),
        error.message,
      );
    }
    if (error instanceof HttpsError) {
      throw error;
    }
    throw new HttpsError(
      "internal",
      `reopenAccountedBill failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
