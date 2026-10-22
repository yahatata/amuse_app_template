/**
 * 同一営業日再開店時: 閉店 UNSETTLED_MARK 由来で未処理の通常 bill を通常未会計へ復旧する。
 *
 * - next-day open では呼ばない（caller 側で same-day 判定）
 * - closeSummary / closeSnapshot を initial へ戻す（unresolved=false のみは禁止）
 * - unsettledBillsCount を対象分だけ減算
 * - activeStay は衝突時に上書きしない
 * - visitLog / closeRun は変更しない
 */

import * as admin from 'firebase-admin';
import type { Firestore } from 'firebase-admin/firestore';
import { buildInitialCloseSummary } from '../../bills/services/parentSummary';
import {
  classifyCloseMarkEvidence,
  isInitialUnmarkedCloseEvidence,
} from './applyCloseSnapshot';
import { logOpsError, logOpsSuccess } from '../../../shared/logging/logOpsError';

export type SameDayRestoreSkipReason =
  | 'not_found'
  | 'already_restored'
  | 'status_not_open'
  | 'unresolved_not_true'
  | 'closed_business_date_mismatch'
  | 'business_date_mismatch'
  | 'accounting_started'
  | 'invalid_close_summary'
  | 'okibake_remote_payment'
  | 'missing_user_id';

export interface SameDayUnsettledRestoreEligibility {
  eligible: boolean;
  reason?: SameDayRestoreSkipReason;
}

export interface SameDayUnsettledRestoreBillOutcome {
  billId: string;
  action: 'restored' | 'skipped';
  reason?: SameDayRestoreSkipReason;
  userId?: string;
  activeStay?: 'restored' | 'already_ok' | 'skipped_conflict' | 'not_needed';
}

export interface SameDayUnsettledRestoreResult {
  applied: boolean;
  reopenBusinessDate: string;
  openRunId: string;
  restoredBillIds: string[];
  skipped: Array<{ billId: string; reason: SameDayRestoreSkipReason }>;
  activeStayRestoredUserIds: string[];
  activeStaySkippedUserIds: string[];
  usersDecremented: Array<{ userId: string; dec: number }>;
}

function hasTruthyString(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * 同一営業日 reopen 復旧対象か（bill 1 件）。
 */
export function evaluateSameDayUnsettledRestoreEligibility(
  billData: Record<string, unknown>,
  reopenBusinessDate: string,
): SameDayUnsettledRestoreEligibility {
  if (isInitialUnmarkedCloseEvidence(billData.closeSummary)) {
    return { eligible: false, reason: 'already_restored' };
  }

  const status = billData.status as string | undefined;
  if (status !== 'open') {
    return { eligible: false, reason: 'status_not_open' };
  }

  if (billData.billType === 'okibake_remote_payment') {
    return { eligible: false, reason: 'okibake_remote_payment' };
  }

  const closeSummary = billData.closeSummary;
  if (closeSummary == null || typeof closeSummary !== 'object') {
    return { eligible: false, reason: 'invalid_close_summary' };
  }
  const summary = closeSummary as Record<string, unknown>;

  if (summary.unresolved !== true) {
    return { eligible: false, reason: 'unresolved_not_true' };
  }

  if (classifyCloseMarkEvidence(closeSummary) !== 'marked') {
    return { eligible: false, reason: 'invalid_close_summary' };
  }

  const closedBusinessDate =
    typeof summary.closedBusinessDate === 'string'
      ? summary.closedBusinessDate.trim()
      : '';
  if (!closedBusinessDate || closedBusinessDate !== reopenBusinessDate) {
    return { eligible: false, reason: 'closed_business_date_mismatch' };
  }

  const businessDate =
    typeof billData.businessDate === 'string' ? billData.businessDate.trim() : '';
  if (businessDate && businessDate !== reopenBusinessDate) {
    return { eligible: false, reason: 'business_date_mismatch' };
  }

  const ops = billData.ops as Record<string, unknown> | undefined;
  if (ops?.accountingStartedAt != null) {
    return { eligible: false, reason: 'accounting_started' };
  }

  const userId = (billData.party as { userId?: string } | undefined)?.userId;
  if (!hasTruthyString(userId)) {
    return { eligible: false, reason: 'missing_user_id' };
  }

  return { eligible: true };
}

async function restoreActiveStayIfSafe(params: {
  db: Firestore;
  userId: string;
  billId: string;
  pokerName: string | null;
}): Promise<'restored' | 'already_ok' | 'skipped_conflict'> {
  const { db, userId, billId, pokerName } = params;
  const stayRef = db.collection('activeStays').doc(userId);
  const staySnap = await stayRef.get();

  if (staySnap.exists) {
    const stayData = staySnap.data() ?? {};
    const isActive = stayData.isActive === true;
    const existingBillId =
      typeof stayData.billId === 'string' ? stayData.billId.trim() : '';

    if (isActive) {
      if (existingBillId === billId) {
        return 'already_ok';
      }
      return 'skipped_conflict';
    }
  }

  const existingStartedAt = staySnap.exists ? staySnap.data()?.startedAt : null;
  await stayRef.set(
    {
      uid: userId,
      billId,
      pokerName,
      isActive: true,
      startedAt: existingStartedAt ?? admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
  return 'restored';
}

export async function restoreUnsettledBillsOnSameDayReopenCore(
  db: Firestore,
  params: { reopenBusinessDate: string; openRunId: string },
): Promise<SameDayUnsettledRestoreResult> {
  const { reopenBusinessDate, openRunId } = params;
  const initialClose = buildInitialCloseSummary();

  const billsSnap = await db
    .collection('bills')
    .where('businessDate', '==', reopenBusinessDate)
    .where('status', '==', 'open')
    .where('closeSummary.unresolved', '==', true)
    .get();

  const outcomes: SameDayUnsettledRestoreBillOutcome[] = [];
  const decrementByUserId = new Map<string, number>();

  for (const doc of billsSnap.docs) {
    const billId = doc.id;
    const billRef = doc.ref;

    try {
      const txnResult = await db.runTransaction(async (txn) => {
        const billSnap = await txn.get(billRef);
        if (!billSnap.exists) {
          return { action: 'skipped' as const, reason: 'not_found' as const };
        }
        const billData = billSnap.data()!;
        const eligibility = evaluateSameDayUnsettledRestoreEligibility(
          billData as Record<string, unknown>,
          reopenBusinessDate,
        );
        if (!eligibility.eligible) {
          return {
            action: 'skipped' as const,
            reason: eligibility.reason ?? 'invalid_close_summary',
          };
        }

        const userId = (
          (billData.party as { userId?: string } | undefined)?.userId ?? ''
        ).trim();

        txn.update(billRef, {
          closeSummary: initialClose,
          closeSnapshot: initialClose,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        return {
          action: 'restored' as const,
          userId,
          pokerName:
            ((billData.party as { pokerName?: string } | undefined)?.pokerName as
              | string
              | null
              | undefined) ?? null,
        };
      });

      if (txnResult.action === 'restored') {
        decrementByUserId.set(
          txnResult.userId,
          (decrementByUserId.get(txnResult.userId) ?? 0) + 1,
        );

        let activeStay: SameDayUnsettledRestoreBillOutcome['activeStay'] =
          'not_needed';
        try {
          activeStay = await restoreActiveStayIfSafe({
            db,
            userId: txnResult.userId,
            billId,
            pokerName: txnResult.pokerName,
          });
        } catch (stayError) {
          logOpsError({
            message: 'same-day reopen: activeStay restore failed (bill restored)',
            functionEntry: 'openStoreTerminal',
            operation: 'restoreSameDayUnsettled.activeStay',
            cause: stayError,
            errorKey: 'STORE_SAME_DAY_RESTORE_ACTIVE_STAY_FAILED',
            context: { billId, userId: txnResult.userId, openRunId },
          });
          activeStay = 'skipped_conflict';
        }

        outcomes.push({
          billId,
          action: 'restored',
          userId: txnResult.userId,
          activeStay,
        });
      } else {
        outcomes.push({
          billId,
          action: 'skipped',
          reason: txnResult.reason,
        });
      }
    } catch (error) {
      logOpsError({
        message: 'same-day reopen: bill restore transaction failed',
        functionEntry: 'openStoreTerminal',
        operation: 'restoreSameDayUnsettled.billTxn',
        cause: error,
        errorKey: 'STORE_SAME_DAY_RESTORE_BILL_TXN_FAILED',
        context: { billId, reopenBusinessDate, openRunId },
      });
      outcomes.push({
        billId,
        action: 'skipped',
        reason: 'invalid_close_summary',
      });
    }
  }

  const usersDecremented: Array<{ userId: string; dec: number }> = [];
  for (const [userId, dec] of decrementByUserId) {
    try {
      await db.collection('users').doc(userId).update({
        unsettledBillsCount: admin.firestore.FieldValue.increment(-dec),
      });
      usersDecremented.push({ userId, dec });
    } catch (error) {
      logOpsError({
        message: 'same-day reopen: unsettledBillsCount decrement failed',
        functionEntry: 'openStoreTerminal',
        operation: 'restoreSameDayUnsettled.userCount',
        cause: error,
        errorKey: 'STORE_SAME_DAY_RESTORE_USER_COUNT_FAILED',
        context: { userId, dec, reopenBusinessDate, openRunId },
      });
    }
  }

  const restoredBillIds = outcomes
    .filter((o) => o.action === 'restored')
    .map((o) => o.billId);
  const skipped = outcomes
    .filter((o) => o.action === 'skipped' && o.reason != null)
    .map((o) => ({ billId: o.billId, reason: o.reason! }));
  const activeStayRestoredUserIds = outcomes
    .filter((o) => o.activeStay === 'restored' && o.userId != null)
    .map((o) => o.userId!);
  const activeStaySkippedUserIds = outcomes
    .filter((o) => o.activeStay === 'skipped_conflict' && o.userId != null)
    .map((o) => o.userId!);

  logOpsSuccess({
    message: 'same-day reopen unsettled restore completed',
    functionEntry: 'openStoreTerminal',
    operation: 'restoreSameDayUnsettledBills',
    context: {
      openRunId,
      reopenBusinessDate,
      restoredCount: restoredBillIds.length,
      skippedCount: skipped.length,
    },
  });

  return {
    applied: true,
    reopenBusinessDate,
    openRunId,
    restoredBillIds,
    skipped,
    activeStayRestoredUserIds,
    activeStaySkippedUserIds,
    usersDecremented,
  };
}
