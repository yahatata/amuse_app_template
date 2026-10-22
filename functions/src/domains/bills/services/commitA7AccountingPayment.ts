/**
 * A-7: 残高減算・ログ・bill meta を同一 transaction で確定
 *
 * 冪等: 同一 bill の会計ログが既に同一内容で存在し、bill meta も一致する場合は
 * 残高を再減算せず成功扱い。内容不一致は POINT_LOG_IDEMPOTENCY_CONFLICT。
 */

import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { FunctionCustomError } from '../../../shared/logging/functionCustomError';
import {
  ALL_BALANCE_IDS,
  isCurrencyPointId,
  SIDE_GAME_CHIP_ID,
} from '../../user/types/pointIds';
import { readBalanceOrZeroIfMissing } from '../../user/helpers/userBalances';
import {
  accountingPointLogId,
  accountingSideGameChipLogId,
  writeAccountingPointLogInTxWithSnap,
  writeAccountingSideGameChipLogInTxWithSnap,
} from '../../user/services/pointLog';
import { paymentMethodsByAmountEqual } from './paymentMethodAggregation';
import { buildDraftAccountingInputUpdate } from '../repos/startAccounting';
import type { ResolvedA7AccountingPayment } from './resolveA7AccountingPayment';

function billPaymentAlreadyCommitted(
  billData: Record<string, unknown> | undefined,
  resolved: ResolvedA7AccountingPayment,
): boolean {
  if (!billData) return false;
  const meta = (billData.meta || {}) as Record<string, unknown>;
  const draft = (billData.draftAccountingInput || {}) as Record<string, unknown>;
  const byAmount =
    (meta.paymentMethodsByAmount as Record<string, number> | undefined) ||
    (draft.paymentMethodsByAmount as Record<string, number> | undefined);
  if (!byAmount || Object.keys(byAmount).length === 0) return false;
  return paymentMethodsByAmountEqual(byAmount, resolved.paymentMethodsByAmount);
}

export async function commitA7AccountingPayment(params: {
  billId: string;
  userId: string;
  resolved: ResolvedA7AccountingPayment;
}): Promise<{ reused: boolean }> {
  const { billId, userId, resolved } = params;
  const db = getFirestore();
  const userRef = db.collection('users').doc(userId);
  const billRef = db.collection('bills').doc(billId);

  const balanceIdsUsed = ALL_BALANCE_IDS.filter(
    (id) => (resolved.usedBalanceAmounts[id] || 0) > 0,
  );

  let reused = false;

  await db.runTransaction(async (tx) => {
    const billSnap = await tx.get(billRef);
    if (!billSnap.exists) {
      throw new FunctionCustomError({
        errorKey: 'NOT_FOUND',
        message: '請求書が見つかりません',
        context: { billId },
      });
    }
    const billData = billSnap.data() as Record<string, unknown>;

    const userSnap = await tx.get(userRef);
    if (!userSnap.exists) {
      throw new FunctionCustomError({
        errorKey: 'NOT_FOUND',
        message: 'ユーザー情報が見つかりません',
        context: { userId },
      });
    }
    const userData = userSnap.data() as Record<string, unknown>;

    type LogEntry = {
      kind: 'point' | 'chip';
      id: string;
      snap: FirebaseFirestore.DocumentSnapshot;
      ref: FirebaseFirestore.DocumentReference;
      before: number;
      delta: number;
    };
    const logReads: LogEntry[] = [];

    for (const id of balanceIdsUsed) {
      const before = readBalanceOrZeroIfMissing(userData, id);
      const delta = resolved.usedBalanceAmounts[id] || 0;
      if (delta <= 0) continue;

      if (isCurrencyPointId(id)) {
        const ref = userRef
          .collection('pointLogs')
          .doc(accountingPointLogId(billId, id));
        const snap = await tx.get(ref);
        logReads.push({ kind: 'point', id, snap, ref, before, delta: -delta });
      } else if (id === SIDE_GAME_CHIP_ID) {
        const ref = userRef
          .collection('sideGameChipLogs')
          .doc(accountingSideGameChipLogId(billId));
        const snap = await tx.get(ref);
        logReads.push({ kind: 'chip', id, snap, ref, before, delta: -delta });
      }
    }

    const allLogsExist =
      balanceIdsUsed.length === 0 ||
      (logReads.length === balanceIdsUsed.length &&
        logReads.every((e) => e.snap.exists));
    const billAlready = billPaymentAlreadyCommitted(billData, resolved);

    if (allLogsExist && billAlready) {
      // 完全冪等: changeAmount が resolved と一致することを検証
      for (const entry of logReads) {
        const data = entry.snap.data() || {};
        if (data.changeAmount !== entry.delta) {
          throw new FunctionCustomError({
            errorKey: 'POINT_LOG_IDEMPOTENCY_CONFLICT',
            message: '同一会計ログが異なる減算量で既に存在します',
            context: {
              billId,
              logId: entry.ref.id,
              existing: data.changeAmount,
              next: entry.delta,
            },
          });
        }
        if (entry.kind === 'point' && isCurrencyPointId(entry.id)) {
          writeAccountingPointLogInTxWithSnap({
            tx,
            existingSnap: entry.snap,
            ref: entry.ref,
            billId,
            pointType: entry.id,
            balanceBefore: data.balanceBefore as number,
            changeAmount: data.changeAmount as number,
            balanceAfter: data.balanceAfter as number,
          });
        } else if (entry.kind === 'chip') {
          writeAccountingSideGameChipLogInTxWithSnap({
            tx,
            existingSnap: entry.snap,
            ref: entry.ref,
            billId,
            balanceBefore: data.balanceBefore as number,
            changeAmount: data.changeAmount as number,
            balanceAfter: data.balanceAfter as number,
          });
        }
      }
      reused = true;
      return;
    }

    // 一部だけログがある / bill だけある等の中間状態は危険 → conflict
    if (logReads.some((e) => e.snap.exists) || billAlready) {
      throw new FunctionCustomError({
        errorKey: 'POINT_LOG_IDEMPOTENCY_CONFLICT',
        message:
          '会計の途中状態または内容不一致のため、残高・ログを安全に確定できません',
        context: { billId, billAlready },
      });
    }

    for (const entry of logReads) {
      const before = entry.before;
      const deltaAbs = -entry.delta;
      if (before < deltaAbs) {
        throw new FunctionCustomError({
          errorKey: 'ACCOUNTING_INSUFFICIENT_BALANCE',
          message: `${entry.id} の残高が不足しています`,
          context: { id: entry.id, before, delta: deltaAbs },
        });
      }
    }

    const userUpdates: { [key: string]: admin.firestore.FieldValue | number } = {
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    for (const id of balanceIdsUsed) {
      const delta = resolved.usedBalanceAmounts[id] || 0;
      if (delta > 0) {
        userUpdates[id] = admin.firestore.FieldValue.increment(-delta);
      }
    }
    if (balanceIdsUsed.length > 0) {
      tx.update(userRef, userUpdates);
    }

    for (const entry of logReads) {
      if (entry.kind === 'point' && isCurrencyPointId(entry.id)) {
        writeAccountingPointLogInTxWithSnap({
          tx,
          existingSnap: entry.snap,
          ref: entry.ref,
          billId,
          pointType: entry.id,
          balanceBefore: entry.before,
          changeAmount: entry.delta,
          balanceAfter: entry.before + entry.delta,
        });
      } else if (entry.kind === 'chip') {
        writeAccountingSideGameChipLogInTxWithSnap({
          tx,
          existingSnap: entry.snap,
          ref: entry.ref,
          billId,
          balanceBefore: entry.before,
          changeAmount: entry.delta,
          balanceAfter: entry.before + entry.delta,
        });
      }
    }

    tx.update(billRef, {
      'meta.paymentMethodsByCategory': resolved.paymentMethodsByCategory,
      'meta.paymentMethodsByAmount': resolved.paymentMethodsByAmount,
      'meta.paymentMethodDetails': resolved.paymentMethodDetails,
      ...buildDraftAccountingInputUpdate({
        paymentMethodsByCategory: resolved.paymentMethodsByCategory,
        paymentMethodsByAmount: resolved.paymentMethodsByAmount,
      }),
      'draftAccountingInput.paymentMethodDetails':
        resolved.paymentMethodDetails,
    });
  });

  return { reused };
}
