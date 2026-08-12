/**
 * startAccounting 後段 commit 失敗時の状態ベース補償。
 *
 * - errorKey ではなく確定状態で判断する
 * - payment meta 確定済みは触らない
 * - 孤立 pointLog は削除しない（検知のみ）
 * - idempotency は commit 失敗補償として削除（cancelled 文書は削除しない）
 */

import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { FunctionCustomError } from '../../../shared/logging/functionCustomError';
import { ALL_BALANCE_IDS, isCurrencyPointId, SIDE_GAME_CHIP_ID } from '../../user/types/pointIds';
import {
  accountingPointLogId,
  accountingSideGameChipLogId,
} from '../../user/services/pointLog';
import { shouldDualWrite, legacyUpdateBillUpdate } from './dualWrite';
import {
  ACTIVE_ACCOUNTING_START_IDEMPOTENCY_KEY_FIELD,
  isIdempotencyActive,
  isIdempotencyCancelled,
} from './accountingStartIdempotency';

export type AccountingPreStartStatus = 'open' | 'in_progress';

export type RollbackAccountingStartOutcome = 'rolled_back' | 'noop';

export type RollbackAccountingStartResult = {
  outcome: RollbackAccountingStartOutcome;
  reason: string;
  restoredStatus?: AccountingPreStartStatus;
  currentStatus?: string | null;
  paymentCommitted?: boolean;
  orphanPointLogDetected?: boolean;
  activeKeyMatched?: boolean;
  idempotencyStatus?: string | null;
};

export type RollbackAccountingStartParams = {
  billId: string;
  idempotencyKey: string;
  accountingStartedBy: string;
  /** startAccounting helper が返した ISO8601 */
  accountingStartedAtIso: string;
  previousStatus: AccountingPreStartStatus;
  /** 孤立 pointLog 検知用（任意） */
  userId?: string;
};

function isPreStartStatus(value: unknown): value is AccountingPreStartStatus {
  return value === 'open' || value === 'in_progress';
}

function timestampsMatchIso(
  billTs: admin.firestore.Timestamp | undefined | null,
  startedAtIso: string,
): boolean {
  if (!billTs || typeof (billTs as admin.firestore.Timestamp).toMillis !== 'function') {
    return false;
  }
  const expectedMs = Date.parse(startedAtIso);
  if (Number.isNaN(expectedMs)) {
    return false;
  }
  return billTs.toMillis() === expectedMs;
}

/** payment meta / draft の ByAmount があるときのみ支払確定とみなす（pointLog 単独では true にしない） */
export function billPaymentLooksCommitted(
  billData: FirebaseFirestore.DocumentData,
): boolean {
  const meta = (billData.meta || {}) as Record<string, unknown>;
  const draft = (billData.draftAccountingInput || {}) as Record<string, unknown>;
  const byAmount =
    (meta.paymentMethodsByAmount as Record<string, unknown> | undefined) ||
    (draft.paymentMethodsByAmount as Record<string, unknown> | undefined);
  return !!(byAmount && Object.keys(byAmount).length > 0);
}

/**
 * commit が throw したときは常に補償を試みる（状態で no-op する）。
 * commit 成功後はこの関数を呼ばないこと。
 */
export function shouldRollbackAccountingStartAfterCommitFailure(
  _error: unknown,
): boolean {
  return true;
}

async function detectOrphanAccountingPointLogs(params: {
  db: FirebaseFirestore.Firestore;
  userId: string;
  billId: string;
}): Promise<boolean> {
  const { db, userId, billId } = params;
  const userRef = db.collection('users').doc(userId);
  for (const id of ALL_BALANCE_IDS) {
    if (isCurrencyPointId(id)) {
      const snap = await userRef
        .collection('pointLogs')
        .doc(accountingPointLogId(billId, id))
        .get();
      if (snap.exists) return true;
    } else if (id === SIDE_GAME_CHIP_ID) {
      const snap = await userRef
        .collection('sideGameChipLogs')
        .doc(accountingSideGameChipLogId(billId))
        .get();
      if (snap.exists) return true;
    }
  }
  return false;
}

/**
 * 当該 startAccounting が作った settling 中間状態だけを、開始前 status へ戻す。
 * commit 失敗補償用: active idempotency document を削除する。
 */
export async function rollbackAccountingStartIfOwned(
  params: RollbackAccountingStartParams,
): Promise<RollbackAccountingStartResult> {
  const {
    billId,
    idempotencyKey,
    accountingStartedBy,
    accountingStartedAtIso,
    previousStatus,
    userId,
  } = params;

  if (!isPreStartStatus(previousStatus)) {
    return {
      outcome: 'noop',
      reason: 'invalid_previous_status',
      currentStatus: null,
    };
  }

  const db = getFirestore();
  const billRef = db.collection('bills').doc(billId);
  const idempotencyRef = billRef.collection('idempotency').doc(idempotencyKey);

  let orphanPointLogDetected = false;
  if (userId) {
    try {
      orphanPointLogDetected = await detectOrphanAccountingPointLogs({
        db,
        userId,
        billId,
      });
    } catch (error: unknown) {
      logger.warn('orphan pointLog detection failed', {
        op: 'rollbackAccountingStartIfOwned',
        billId,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const result = await db.runTransaction(async (tx) => {
    const billSnap = await tx.get(billRef);
    if (!billSnap.exists) {
      return {
        outcome: 'noop' as const,
        reason: 'bill_not_found',
        currentStatus: null as string | null,
        paymentCommitted: false,
        activeKeyMatched: false,
        idempotencyStatus: null as string | null,
      };
    }

    const billData = billSnap.data()!;
    const currentStatus = (billData.status as string | undefined) || null;
    const ops = billData.ops || {};
    const activeKey = ops.activeAccountingStartIdempotencyKey as string | undefined;
    const paymentCommitted = billPaymentLooksCommitted(billData);

    const idemSnap = await tx.get(idempotencyRef);
    const idemData = idemSnap.exists ? idemSnap.data() : undefined;
    const idempotencyStatus = idemSnap.exists
      ? isIdempotencyCancelled(idemData)
        ? 'cancelled'
        : 'active'
      : null;

    // 既に開始前へ戻っている → 二重補償 noop。cancelled 文書は削除しない。
    if (currentStatus === 'open' || currentStatus === 'in_progress') {
      const startedAt = ops.accountingStartedAt;
      if (!startedAt) {
        if (idemSnap.exists && isIdempotencyActive(idemData)) {
          tx.delete(idempotencyRef);
        }
        if (activeKey === idempotencyKey) {
          tx.update(billRef, {
            [ACTIVE_ACCOUNTING_START_IDEMPOTENCY_KEY_FIELD]: null,
            updatedAt: admin.firestore.Timestamp.now(),
          });
        }
        return {
          outcome: 'noop' as const,
          reason: 'already_pre_start',
          currentStatus,
          paymentCommitted,
          activeKeyMatched: activeKey === idempotencyKey || activeKey == null,
          idempotencyStatus,
        };
      }
    }

    if (currentStatus !== 'settling') {
      return {
        outcome: 'noop' as const,
        reason: 'status_not_settling',
        currentStatus,
        paymentCommitted,
        activeKeyMatched: false,
        idempotencyStatus,
      };
    }

    if (paymentCommitted) {
      return {
        outcome: 'noop' as const,
        reason: 'payment_already_committed',
        currentStatus,
        paymentCommitted: true,
        activeKeyMatched: false,
        idempotencyStatus,
      };
    }

    if (ops.accountingStartedBy !== accountingStartedBy) {
      return {
        outcome: 'noop' as const,
        reason: 'accounting_started_by_mismatch',
        currentStatus,
        paymentCommitted,
        activeKeyMatched: false,
        idempotencyStatus,
      };
    }

    if (!timestampsMatchIso(ops.accountingStartedAt, accountingStartedAtIso)) {
      return {
        outcome: 'noop' as const,
        reason: 'accounting_started_at_mismatch',
        currentStatus,
        paymentCommitted,
        activeKeyMatched: false,
        idempotencyStatus,
      };
    }

    // active key: 旧 bill で欠損している場合は idempotency 文書所有で代替可
    if (activeKey != null && activeKey !== idempotencyKey) {
      return {
        outcome: 'noop' as const,
        reason: 'active_key_mismatch',
        currentStatus,
        paymentCommitted,
        activeKeyMatched: false,
        idempotencyStatus,
      };
    }

    if (!idemSnap.exists) {
      return {
        outcome: 'noop' as const,
        reason: 'idempotency_missing',
        currentStatus,
        paymentCommitted,
        activeKeyMatched: activeKey == null || activeKey === idempotencyKey,
        idempotencyStatus: null,
      };
    }

    if (isIdempotencyCancelled(idemData)) {
      // 手動 cancel 済み。補償で cancelled を消さない／状態も触らない
      return {
        outcome: 'noop' as const,
        reason: 'idempotency_cancelled',
        currentStatus,
        paymentCommitted,
        activeKeyMatched: activeKey === idempotencyKey || activeKey == null,
        idempotencyStatus: 'cancelled',
      };
    }

    const storedPrevious = ops.accountingStartPreviousStatus;
    const restoreStatus: AccountingPreStartStatus = isPreStartStatus(storedPrevious)
      ? storedPrevious
      : previousStatus;

    const now = admin.firestore.Timestamp.now();
    tx.update(billRef, {
      status: restoreStatus,
      'ops.accountingStartedAt': null,
      'ops.accountingStartedBy': null,
      'ops.accountingStartPreviousStatus': null,
      [ACTIVE_ACCOUNTING_START_IDEMPOTENCY_KEY_FIELD]: null,
      updatedAt: now,
    });
    // commit 失敗補償: active idem を削除（cancelled ではない）
    tx.delete(idempotencyRef);

    return {
      outcome: 'rolled_back' as const,
      reason: 'ok',
      restoredStatus: restoreStatus,
      currentStatus,
      paymentCommitted: false,
      activeKeyMatched: true,
      idempotencyStatus: 'active',
    };
  });

  if (result.outcome === 'rolled_back' && result.restoredStatus) {
    if (await shouldDualWrite()) {
      try {
        await legacyUpdateBillUpdate(db, {
          billId,
          updates: { status: result.restoredStatus },
        });
      } catch (error: unknown) {
        logger.warn('dualWrite rollbackAccountingStart failed', {
          op: 'rollbackAccountingStartIfOwned',
          billId,
          idempKey: idempotencyKey,
          restoredStatus: result.restoredStatus,
          reason: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  return {
    ...result,
    orphanPointLogDetected,
  };
}

/**
 * 元エラー context に補償結果を載せる。
 * FCE 以外は可能な範囲で context 付き FCE にしない（元例外を維持）。
 */
export function attachCompensationContextToError(
  error: unknown,
  compensation: {
    attempted: boolean;
    succeeded: boolean;
    outcome?: string;
    reason?: string;
    restoredStatus?: string;
    currentStatus?: string | null;
    compensationError?: string;
    paymentCommitted?: boolean;
    orphanPointLogDetected?: boolean;
    activeKeyMatched?: boolean;
    idempotencyStatus?: string | null;
  },
): unknown {
  const extra = {
    compensationAttempted: compensation.attempted,
    compensationSucceeded: compensation.succeeded,
    compensationOutcome: compensation.outcome,
    compensationReason: compensation.reason,
    restoredStatus: compensation.restoredStatus,
    currentStatusAfterCompensation: compensation.currentStatus,
    compensationError: compensation.compensationError,
    paymentCommitted: compensation.paymentCommitted,
    orphanPointLogDetected: compensation.orphanPointLogDetected,
    activeKeyMatched: compensation.activeKeyMatched,
    idempotencyStatus: compensation.idempotencyStatus,
    phase: 'commitA7AccountingPayment',
  };

  if (error instanceof FunctionCustomError) {
    return new FunctionCustomError({
      errorKey: error.errorKey,
      message: error.message,
      context: {
        ...error.context,
        ...extra,
      },
      cause: (error as Error & { cause?: unknown }).cause,
    });
  }
  return error;
}
