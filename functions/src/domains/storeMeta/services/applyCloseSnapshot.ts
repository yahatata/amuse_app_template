/**
 * Phase6 Step2: closeSnapshot 付与用 Callable
 *
 * 指定された billIds に対して bills に closeSnapshot を付与する。
 * 既に closeSnapshot が妥当な形で存在する場合はスキップ（already_marked）。
 * displayAmountAtMark はクライアント渡しの amountsByBillId を利用（再計算しない）。
 * userId が無い bill は付与せず missing_user_id、金額が無い場合は missing_amount でスキップ。
 * 新規付与できた bill について users/{userId}.unsettledBillsCount を increment する。
 * 部分成功を許容し、updatedBillIds / skipped / updatedCount / usersIncremented / usersUpdateFailed を返す。
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import * as admin from 'firebase-admin';
import { getCurrentBusinessDateKeyOrThrow } from '../repos/getCurrentBusinessDateKeyOrThrow';
import { requireAdmin } from '../../../shared/devices';

const ALLOWED_STATUSES = ['open', 'in_progress', 'settling'] as const;
const LAST_CLOSE_RUN_ID_STEP2 = 'step2-manual';

/** closeSnapshot が「既に付与済みとして扱うべき妥当な形」か。壊れた値は上書きせず invalid_closeSnapshot_shape でスキップする。 */
function isCloseSnapshotValidShape(snapshot: unknown): boolean {
  if (snapshot == null || typeof snapshot !== 'object') return false;
  const s = snapshot as Record<string, unknown>;
  if (s.unresolved === true) return true;
  if (typeof s.lastCloseRunId === 'string' && s.lastCloseRunId.length > 0) return true;
  return false;
}

/** amountsByBillId から指定 bill の金額を取得。無い/不正なら null */
function getAmountForBill(
  amountsByBillId: Record<string, number> | undefined,
  billId: string
): number | null {
  if (amountsByBillId == null || typeof amountsByBillId !== 'object') return null;
  const v = amountsByBillId[billId];
  if (typeof v !== 'number' || Number.isNaN(v)) return null;
  return v;
}

export interface ApplyCloseSnapshotCoreParams {
  billIds: string[];
  amountsByBillId: Record<string, number>;
  closedBusinessDate: string;
  /** Step2 Callable の場合は 'step2-manual'。Step3 ターミナルでは closeRunId。 */
  closeRunId: string;
}

export interface ApplyCloseSnapshotCoreResult {
  updatedBillIds: string[];
  writtenBillIds: string[];
  skipped: Array<{ billId: string; reason: string }>;
  usersIncremented: Array<{ userId: string; inc: number }>;
  usersUpdateFailed: string[];
}

/**
 * Phase6 Step3: closeSnapshot 付与の core。Callable と closeStoreTerminal から利用。
 * writtenBillIds は実際に txn.update した billId のリスト（巻き戻し対象）。
 */
export async function applyCloseSnapshotCore(
  db: ReturnType<typeof getFirestore>,
  params: ApplyCloseSnapshotCoreParams
): Promise<ApplyCloseSnapshotCoreResult> {
  const { billIds, amountsByBillId, closedBusinessDate, closeRunId } = params;
  const uniqueBillIds = Array.from(new Set(billIds));
  const updatedBills: Array<{ billId: string; userId: string }> = [];
  const skipped: Array<{ billId: string; reason: string }> = [];
  const now = admin.firestore.FieldValue.serverTimestamp();

  for (const billId of uniqueBillIds) {
    if (typeof billId !== 'string' || !billId.trim()) {
      skipped.push({ billId: String(billId), reason: 'invalid_bill_id' });
      continue;
    }

    const amount = getAmountForBill(amountsByBillId, billId);
    if (amount === null) {
      skipped.push({ billId, reason: 'missing_amount' });
      continue;
    }

    const billRef = db.collection('bills').doc(billId);

    try {
      const result = await db.runTransaction(async (txn) => {
        const billSnap = await txn.get(billRef);
        if (!billSnap.exists) {
          return { action: 'skipped' as const, reason: 'not_found' };
        }
        const billData = billSnap.data()!;
        const businessDate = billData.businessDate as string | undefined;
        const status = billData.status as string | undefined;
        const existingCloseSnapshot = billData.closeSnapshot;
        const userId = (billData.party?.userId as string) ?? '';
        const userIdTrimmed = typeof userId === 'string' ? userId.trim() : '';

        if (businessDate !== closedBusinessDate) {
          return { action: 'skipped' as const, reason: 'businessDate_mismatch' };
        }
        if (!status || !ALLOWED_STATUSES.includes(status as (typeof ALLOWED_STATUSES)[number])) {
          return { action: 'skipped' as const, reason: 'status_mismatch' };
        }
        if (existingCloseSnapshot != null && typeof existingCloseSnapshot === 'object') {
          if (isCloseSnapshotValidShape(existingCloseSnapshot)) {
            return { action: 'skipped' as const, reason: 'already_marked' };
          }
          return { action: 'skipped' as const, reason: 'invalid_closeSnapshot_shape' };
        }
        if (!userIdTrimmed) {
          return { action: 'skipped' as const, reason: 'missing_user_id' };
        }

        txn.update(billRef, {
          closeSnapshot: {
            lastCloseRunId: closeRunId,
            markedAt: now,
            closedBusinessDate,
            unresolved: true,
            displayAmountAtMark: amount,
          },
          updatedAt: now,
        });
        return { action: 'updated' as const, userId: userIdTrimmed };
      });

      if (result.action === 'updated') {
        updatedBills.push({ billId, userId: result.userId });
      } else {
        skipped.push({ billId, reason: result.reason });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn('applyCloseSnapshot txn failed', { billId, error: msg });
      skipped.push({ billId, reason: 'txn_failed' });
    }
  }

  const updatedBillIds = updatedBills.map((b) => b.billId);

  const usersIncremented: Array<{ userId: string; inc: number }> = [];
  const usersUpdateFailed: string[] = [];
  const countByUserId = new Map<string, number>();
  for (const { userId } of updatedBills) {
    countByUserId.set(userId, (countByUserId.get(userId) ?? 0) + 1);
  }
  for (const [userId, count] of countByUserId) {
    try {
      await db.collection('users').doc(userId).update({
        unsettledBillsCount: admin.firestore.FieldValue.increment(count),
      });
      usersIncremented.push({ userId, inc: count });
    } catch (e) {
      console.warn('applyCloseSnapshot users update failed', { userId, error: e });
      usersUpdateFailed.push(userId);
    }
  }

  return {
    updatedBillIds,
    writtenBillIds: updatedBillIds,
    skipped,
    usersIncremented,
    usersUpdateFailed,
  };
}

export const applyCloseSnapshot = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', '認証が必要です');
  }

  const adminId = request.auth.uid;
  const db = getFirestore();
  await requireAdmin(db, adminId);

  const billIds = request.data?.billIds;
  if (!Array.isArray(billIds) || billIds.length === 0) {
    throw new HttpsError('invalid-argument', 'billIds は空でない配列である必要があります');
  }
  const amountsByBillId =
    request.data?.amountsByBillId != null && typeof request.data.amountsByBillId === 'object'
      ? (request.data.amountsByBillId as Record<string, number>)
      : {};

  let closedBusinessDate: string;
  try {
    closedBusinessDate = await getCurrentBusinessDateKeyOrThrow();
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    throw new HttpsError(
      'failed-precondition',
      `営業日を取得できません: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  const result = await applyCloseSnapshotCore(db, {
    billIds,
    amountsByBillId,
    closedBusinessDate,
    closeRunId: LAST_CLOSE_RUN_ID_STEP2,
  });

  return {
    success: true,
    updatedBillIds: result.updatedBillIds,
    skipped: result.skipped,
    updatedCount: result.updatedBillIds.length,
    ...(result.usersIncremented.length > 0 && { usersIncremented: result.usersIncremented }),
    ...(result.usersUpdateFailed.length > 0 && { usersUpdateFailed: result.usersUpdateFailed }),
  };
});
