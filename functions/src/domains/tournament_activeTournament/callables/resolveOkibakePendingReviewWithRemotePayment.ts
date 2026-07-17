import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { z } from 'zod';
import {
  getCallerDeviceByUid,
  hasRequiredOption,
  isActive,
  type DeviceDoc,
} from '../../../shared/devices';
import { logOpsSuccess } from '../../../shared/logging/logOpsError';
import {
  assertOkibakePendingReviewResolvable,
  assertTournamentExistsForPendingReviewResolution,
} from '../lib/assertOkibakePendingReviewResolvable';
import { getCurrentBusinessDateKeyOrThrow } from '../../storeMeta/repos/getCurrentBusinessDateKeyOrThrow';
import {
  buildDraftAccountingInput,
  buildInitialCloseSummary,
  buildInitialCurrentSummary,
  buildInitialOps,
  buildInitialPostSettlementState,
  buildInitialReopenSummary,
  buildInitialSettlementSnapshot,
} from '../../bills/services/parentSummary';
import {
  buildInitialCycleDoc,
  INITIAL_SETTLEMENT_CYCLE,
} from '../../bills/services/settlementCycles';

const schema = z.object({
  tournamentId: z.string().min(1),
  okibakeEntryId: z.string().min(1),
  operationId: z.string().min(1),
  amountIncl: z.number().int().nonnegative(),
  paymentMethod: z.enum(['cash', 'electronic_money']),
  memo: z.string().optional().nullable(),
  paidAt: z.string().optional().nullable(),
  deviceName: z.string().optional(),
});

function isSameOperationPayload(
  payload: Record<string, unknown>,
  args: {
    tournamentId: string;
    okibakeEntryId: string;
    amountIncl: number;
    paymentMethod: 'cash' | 'electronic_money';
  }
): boolean {
  return (
    payload.tournamentId === args.tournamentId &&
    payload.okibakeEntryId === args.okibakeEntryId &&
    payload.amountIncl === args.amountIncl &&
    payload.paymentMethod === args.paymentMethod &&
    typeof payload.billId === 'string'
  );
}

function resolveDeviceName(device: DeviceDoc, reqName?: string): string | undefined {
  if (typeof reqName === 'string' && reqName.trim().length > 0) return reqName.trim();
  if (typeof device.name === 'string' && device.name.length > 0) return device.name;
  return undefined;
}

export const resolveOkibakePendingReviewWithRemotePayment = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', '認証が必要です');
  const callerUid = request.auth.uid;
  const parsed = schema.safeParse(request.data);
  if (!parsed.success) {
    throw new HttpsError(
      'invalid-argument',
      parsed.error.errors.map((e) => e.message).join(', ')
    );
  }

  const {
    tournamentId,
    okibakeEntryId,
    operationId,
    amountIncl,
    paymentMethod,
    memo,
    paidAt,
    deviceName,
  } = parsed.data;

  const device = await getCallerDeviceByUid(callerUid);
  if (!device || !isActive(device.status)) {
    throw new HttpsError('permission-denied', 'デバイスが見つからないか、アクティブではありません');
  }
  const hasPermission = device.role === 'admin' || hasRequiredOption(device.options, 'tournament');
  if (!hasPermission) {
    throw new HttpsError('permission-denied', 'トーナメント運営の権限がありません');
  }

  const db = admin.firestore();
  const opRef = db.collection('operationLogs').doc(operationId);
  const tournamentRef = db.collection('scheduledTournaments').doc(tournamentId);
  const tournamentSnap = await tournamentRef.get();
  // 終了済みでも来店なし入金は許可する（要対応精算）。存在確認のみ。
  assertTournamentExistsForPendingReviewResolution({
    tournamentId,
    exists: tournamentSnap.exists,
  });
  const entryRef = tournamentRef.collection('okibakeTemporaryEntries').doc(okibakeEntryId);
  const billRef = db.collection('bills').doc();
  const cycleRef = billRef
    .collection('settlementCycles')
    .doc(String(INITIAL_SETTLEMENT_CYCLE));

  const pre = await opRef.get();
  if (pre.exists) {
    const d = pre.data() ?? {};
    if (d.status === 'succeeded') {
      const p = (d.payload ?? {}) as Record<string, unknown>;
      if (
        isSameOperationPayload(p, {
          tournamentId,
          okibakeEntryId,
          amountIncl,
          paymentMethod,
        })
      ) {
        return { success: true, replay: true, billId: p.billId };
      }
      throw new HttpsError(
        'failed-precondition',
        'この operationId は別内容の完了済み操作です。'
      );
    }
    if (d.status === 'failed') {
      throw new HttpsError('failed-precondition', 'この operationId は失敗済みです。');
    }
  }

  const businessDate = await getCurrentBusinessDateKeyOrThrow();
  const now = FieldValue.serverTimestamp();
  let resolvedBillId = '';

  await db.runTransaction(async (tx) => {
    const opSnap = await tx.get(opRef);
    if (opSnap.exists) {
      const d = opSnap.data() ?? {};
      if (d.status === 'succeeded') {
        const p = (d.payload ?? {}) as Record<string, unknown>;
        if (
          isSameOperationPayload(p, {
            tournamentId,
            okibakeEntryId,
            amountIncl,
            paymentMethod,
          })
        ) {
          resolvedBillId = String(p.billId);
          return;
        }
        throw new HttpsError(
          'failed-precondition',
          'この operationId は別内容の完了済み操作です。'
        );
      }
      if (d.status === 'failed') {
        throw new HttpsError('failed-precondition', 'この operationId は失敗済みです。');
      }
    }

    const tSnap = await tx.get(tournamentRef);
    assertTournamentExistsForPendingReviewResolution({
      tournamentId,
      exists: tSnap.exists,
    });
    const tData = tSnap.data() ?? {};
    const templateId =
      typeof tData.templateId === 'string' && tData.templateId.trim().length > 0
        ? tData.templateId.trim()
        : null;
    if (!templateId) throw new HttpsError('failed-precondition', 'templateId がありません');

    const entrySnap = await tx.get(entryRef);
    const {linkedUserId, linkedUserPokerName} = assertOkibakePendingReviewResolvable({
      exists: entrySnap.exists,
      entryData: entrySnap.data(),
    });
    const e = (entrySnap.data() ?? {}) as Record<string, unknown>;

    const snapshot = (tData.snapshot ?? {}) as Record<string, unknown>;
    const nowLiteral = Timestamp.now();
    const entryFeeIncl =
      typeof snapshot.entryFee === 'number' && Number.isFinite(snapshot.entryFee)
        ? snapshot.entryFee
        : 0;
    const addonFeeIncl =
      typeof snapshot.addonFee === 'number' && Number.isFinite(snapshot.addonFee)
        ? snapshot.addonFee
        : 0;
    const templateName = typeof snapshot.name === 'string' ? snapshot.name : '';
    const addonCount =
      typeof e.okibakeAddonCount === 'number' && Number.isFinite(e.okibakeAddonCount)
        ? Math.max(0, Math.floor(e.okibakeAddonCount))
        : 0;

    resolvedBillId = billRef.id;
    tx.set(
      billRef,
      {
        billId: billRef.id,
        businessDate,
        status: 'open',
        billType: 'okibake_remote_payment',
        sourceOkibakeEntryId: okibakeEntryId,
        sourceTournamentId: tournamentId,
        party: { userId: linkedUserId, pokerName: linkedUserPokerName },
        place: { table: null, seat: null },
        ops: buildInitialOps(),
        draftAccountingInput: buildDraftAccountingInput({
          paymentMethodsByAmount: { [paymentMethod]: amountIncl },
          paymentMethodsByCategory: null,
        }),
        settlementSnapshot: buildInitialSettlementSnapshot(),
        currentSummary: buildInitialCurrentSummary(),
        postSettlementState: buildInitialPostSettlementState(),
        reopenSummary: buildInitialReopenSummary(),
        closeSummary: buildInitialCloseSummary(),
        meta: {
          schemaVersion: '1.3',
          contentHash: null,
          paymentMethodsByAmount: { [paymentMethod]: amountIncl },
        },
        remotePayment: {
          amountIncl,
          method: paymentMethod,
          paidAt: paidAt ?? null,
          memo: memo ?? null,
          recordedAt: now,
          recordedByUid: callerUid,
          recordedByDeviceId: device.id,
        },
        createdAt: now,
        updatedAt: now,
      },
      { merge: false }
    );

    tx.set(
      cycleRef,
      buildInitialCycleDoc({
        cycleNo: INITIAL_SETTLEMENT_CYCLE,
        openedAt: now,
        openedBy: null,
        openedReason: 'initial',
        openedFromCycleNo: null,
      }),
      { merge: false }
    );

    tx.set(
      billRef.collection('tournaments').doc(templateId),
      {
        templateId,
        templateName,
        entryCount: 1,
        entryFeeIncl,
        reentryCount: 0,
        reentryFeeIncl: 0,
        addonCount,
        addonFeeIncl,
        operationLogs: [
          {
            operationId,
            action: 'okibake_remote_payment',
            operatedAt: nowLiteral,
            by: device.id,
            sourceOkibakeEntryId: okibakeEntryId,
          },
        ],
        createdAt: now,
        updatedAt: now,
      },
      { merge: false }
    );

    const opDoc: Record<string, unknown> = {
      operationId,
      operationName: '置きバケ来店なし入金',
      status: 'succeeded',
      deviceId: device.id,
      payload: {
        tournamentId,
        okibakeEntryId,
        billId: billRef.id,
        amountIncl,
        paymentMethod,
      },
      tournamentId,
      createdAt: now,
    };
    const dn = resolveDeviceName(device, deviceName);
    if (dn) opDoc.deviceName = dn;
    tx.set(opRef, opDoc);
  });

  // open -> settled (別コミット)
  await billRef.update({
    status: 'settled',
    'ops.accountingStartedAt': now,
    'ops.accountingStartedBy': callerUid,
    'ops.accountingCompletedAt': now,
    'ops.accountingCompletedBy': callerUid,
    updatedAt: now,
  });

  await entryRef.update({
    billLinkStatus: 'linked',
    linkedBillId: resolvedBillId,
    linkedAt: now,
    updatedAt: now,
    updatedByDeviceId: device.id,
  });

  logOpsSuccess({
    message: 'resolveOkibakePendingReviewWithRemotePayment 成功',
    functionEntry: 'resolveOkibakePendingReviewWithRemotePayment',
    context: { tournamentId, okibakeEntryId, billId: resolvedBillId, operationId },
  });

  return { success: true, billId: resolvedBillId, okibakeEntryId };
});
