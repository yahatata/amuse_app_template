/**
 * A-7: 通貨型 pointLogs / sideGameChip 会計ログ（transaction 内）
 */

import { Timestamp } from 'firebase-admin/firestore';
import { FunctionCustomError } from '../../../shared/logging/functionCustomError';
import type { CurrencyPointId } from '../types/pointIds';

export function accountingPointLogId(
  billId: string,
  pointType: CurrencyPointId,
): string {
  return `accounting_${billId}_${pointType}`;
}

export function accountingSideGameChipLogId(billId: string): string {
  return `accounting_${billId}`;
}

export function refundPointLogId(
  cashActionId: string,
  pointType: CurrencyPointId,
): string {
  return `refund_${cashActionId}_${pointType}`;
}

export function collectionPointLogId(
  cashActionId: string,
  pointType: CurrencyPointId,
): string {
  return `collection_${cashActionId}_${pointType}`;
}

export function refundSideGameChipLogId(cashActionId: string): string {
  return `refund_${cashActionId}`;
}

export function collectionSideGameChipLogId(cashActionId: string): string {
  return `collection_${cashActionId}`;
}

export function rewardPointLogId(
  grantIdempotencyKey: string,
  pointType: CurrencyPointId,
): string {
  return `reward_${grantIdempotencyKey}_${pointType}`;
}

export function rewardReversalPointLogId(
  grantIdempotencyKey: string,
  pointType: CurrencyPointId,
): string {
  return `reward_reversal_${grantIdempotencyKey}_${pointType}`;
}

export function depositSideGameChipLogId(chipId: string): string {
  return `deposit_${chipId}`;
}

export function withdrawSideGameChipLogId(chipId: string): string {
  return `withdraw_${chipId}`;
}

const POINT_LOG_KEYS = [
  'pointType',
  'changeAmount',
  'balanceBefore',
  'balanceAfter',
  'reasonType',
  'relatedId',
] as const;

export function writeAccountingPointLogInTxWithSnap(params: {
  tx: FirebaseFirestore.Transaction;
  existingSnap: FirebaseFirestore.DocumentSnapshot;
  ref: FirebaseFirestore.DocumentReference;
  billId: string;
  pointType: CurrencyPointId;
  balanceBefore: number;
  changeAmount: number;
  balanceAfter: number;
}): void {
  const {
    tx,
    existingSnap,
    ref,
    billId,
    pointType,
    balanceBefore,
    changeAmount,
    balanceAfter,
  } = params;

  const payload = {
    pointType,
    balanceBefore,
    changeAmount,
    balanceAfter,
    reasonType: 'accounting' as const,
    relatedId: billId,
    createdAt: Timestamp.now(),
  };

  if (existingSnap.exists) {
    const data = existingSnap.data() || {};
    for (const key of POINT_LOG_KEYS) {
      if (data[key] !== payload[key]) {
        throw new FunctionCustomError({
          errorKey: 'POINT_LOG_IDEMPOTENCY_CONFLICT',
          message: '同一 pointLog が異なる内容で既に存在します',
          context: {
            logId: ref.id,
            key,
            existing: data[key],
            next: payload[key],
          },
        });
      }
    }
    return;
  }

  tx.set(ref, payload);
}

/**
 * sideGameChip 会計減算ログ
 * users/{uid}/sideGameChipLogs/accounting_{billId}
 */
export function writeAccountingSideGameChipLogInTxWithSnap(params: {
  tx: FirebaseFirestore.Transaction;
  existingSnap: FirebaseFirestore.DocumentSnapshot;
  ref: FirebaseFirestore.DocumentReference;
  billId: string;
  balanceBefore: number;
  changeAmount: number;
  balanceAfter: number;
}): void {
  const {
    tx,
    existingSnap,
    ref,
    billId,
    balanceBefore,
    changeAmount,
    balanceAfter,
  } = params;

  const payload = {
    reasonType: 'accounting' as const,
    relatedId: billId,
    balanceBefore,
    changeAmount,
    balanceAfter,
    createdAt: Timestamp.now(),
  };

  if (existingSnap.exists) {
    const data = existingSnap.data() || {};
    for (const key of [
      'reasonType',
      'relatedId',
      'balanceBefore',
      'changeAmount',
      'balanceAfter',
    ] as const) {
      if (data[key] !== payload[key]) {
        throw new FunctionCustomError({
          errorKey: 'POINT_LOG_IDEMPOTENCY_CONFLICT',
          message: '同一 sideGameChip 会計ログが異なる内容で既に存在します',
          context: { logId: ref.id, key },
        });
      }
    }
    return;
  }

  tx.set(ref, payload);
}

type PostSettlementReason =
  | 'post_settlement_refund'
  | 'post_settlement_collection';

export function writePostSettlementPointLogInTxWithSnap(params: {
  tx: FirebaseFirestore.Transaction;
  existingSnap: FirebaseFirestore.DocumentSnapshot;
  ref: FirebaseFirestore.DocumentReference;
  cashActionId: string;
  pointType: CurrencyPointId;
  balanceBefore: number;
  changeAmount: number;
  balanceAfter: number;
  reasonType: PostSettlementReason;
}): void {
  const {
    tx,
    existingSnap,
    ref,
    cashActionId,
    pointType,
    balanceBefore,
    changeAmount,
    balanceAfter,
    reasonType,
  } = params;

  const payload = {
    pointType,
    balanceBefore,
    changeAmount,
    balanceAfter,
    reasonType,
    relatedId: cashActionId,
    createdAt: Timestamp.now(),
  };

  if (existingSnap.exists) {
    const data = existingSnap.data() || {};
    for (const key of POINT_LOG_KEYS) {
      if (data[key] !== payload[key]) {
        throw new FunctionCustomError({
          errorKey: 'POINT_LOG_IDEMPOTENCY_CONFLICT',
          message: '同一 pointLog が異なる内容で既に存在します',
          context: {
            logId: ref.id,
            key,
            existing: data[key],
            next: payload[key],
          },
        });
      }
    }
    return;
  }

  tx.set(ref, payload);
}

export function writePostSettlementSideGameChipLogInTxWithSnap(params: {
  tx: FirebaseFirestore.Transaction;
  existingSnap: FirebaseFirestore.DocumentSnapshot;
  ref: FirebaseFirestore.DocumentReference;
  cashActionId: string;
  balanceBefore: number;
  changeAmount: number;
  balanceAfter: number;
  reasonType: PostSettlementReason;
}): void {
  const {
    tx,
    existingSnap,
    ref,
    cashActionId,
    balanceBefore,
    changeAmount,
    balanceAfter,
    reasonType,
  } = params;

  const payload = {
    reasonType,
    relatedId: cashActionId,
    balanceBefore,
    changeAmount,
    balanceAfter,
    createdAt: Timestamp.now(),
  };

  if (existingSnap.exists) {
    const data = existingSnap.data() || {};
    for (const key of [
      'reasonType',
      'relatedId',
      'balanceBefore',
      'changeAmount',
      'balanceAfter',
    ] as const) {
      if (data[key] !== payload[key]) {
        throw new FunctionCustomError({
          errorKey: 'POINT_LOG_IDEMPOTENCY_CONFLICT',
          message: '同一 sideGameChip ログが異なる内容で既に存在します',
          context: { logId: ref.id, key },
        });
      }
    }
    return;
  }

  tx.set(ref, payload);
}

type TournamentRewardReason =
  | 'tournament_reward'
  | 'tournament_reward_reversal';

export function writeTournamentRewardPointLogInTxWithSnap(params: {
  tx: FirebaseFirestore.Transaction;
  existingSnap: FirebaseFirestore.DocumentSnapshot;
  ref: FirebaseFirestore.DocumentReference;
  tournamentId: string;
  pointType: CurrencyPointId;
  balanceBefore: number;
  changeAmount: number;
  balanceAfter: number;
  reasonType: TournamentRewardReason;
}): void {
  const {
    tx,
    existingSnap,
    ref,
    tournamentId,
    pointType,
    balanceBefore,
    changeAmount,
    balanceAfter,
    reasonType,
  } = params;

  const payload = {
    pointType,
    balanceBefore,
    changeAmount,
    balanceAfter,
    reasonType,
    relatedId: tournamentId,
    createdAt: Timestamp.now(),
  };

  if (existingSnap.exists) {
    const data = existingSnap.data() || {};
    for (const key of POINT_LOG_KEYS) {
      if (data[key] !== payload[key]) {
        throw new FunctionCustomError({
          errorKey: 'POINT_LOG_IDEMPOTENCY_CONFLICT',
          message: '同一 pointLog が異なる内容で既に存在します',
          context: {
            logId: ref.id,
            key,
            existing: data[key],
            next: payload[key],
          },
        });
      }
    }
    return;
  }

  tx.set(ref, payload);
}

/** 預入・引出の残高変動ログ（購入明細とは分離した doc） */
export function writeSideGameChipBalanceLogInTxWithSnap(params: {
  tx: FirebaseFirestore.Transaction;
  existingSnap: FirebaseFirestore.DocumentSnapshot;
  ref: FirebaseFirestore.DocumentReference;
  relatedId: string;
  balanceBefore: number;
  changeAmount: number;
  balanceAfter: number;
  reasonType: 'deposit' | 'withdraw';
}): void {
  const {
    tx,
    existingSnap,
    ref,
    relatedId,
    balanceBefore,
    changeAmount,
    balanceAfter,
    reasonType,
  } = params;

  const payload = {
    reasonType,
    relatedId,
    balanceBefore,
    changeAmount,
    balanceAfter,
    category: reasonType === 'deposit' ? ('income' as const) : ('expense' as const),
    amountDelta: changeAmount,
    createdAt: Timestamp.now(),
  };

  if (existingSnap.exists) {
    const data = existingSnap.data() || {};
    for (const key of [
      'reasonType',
      'relatedId',
      'balanceBefore',
      'changeAmount',
      'balanceAfter',
    ] as const) {
      if (data[key] !== payload[key]) {
        throw new FunctionCustomError({
          errorKey: 'POINT_LOG_IDEMPOTENCY_CONFLICT',
          message: '同一 sideGameChip 残高ログが異なる内容で既に存在します',
          context: { logId: ref.id, key },
        });
      }
    }
    return;
  }

  tx.set(ref, payload);
}
