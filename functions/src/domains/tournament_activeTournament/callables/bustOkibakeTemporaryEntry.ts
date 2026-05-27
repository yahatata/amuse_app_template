/**
 * Phase 3C-1: 置きバケ一時参加者の bust（詳細仕様書 / ChangeSpec）
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import type { DocumentData, UpdateData } from 'firebase-admin/firestore';
import { z } from 'zod';
import type { DeviceDoc } from '../../../shared/devices';
import { getCallerDeviceByUid, hasRequiredOption, isActive } from '../../../shared/devices';
import { logOpsError, logOpsSuccess } from '../../../shared/logging/logOpsError';
import { FunctionCustomError, mapFunctionCustomErrorToHttpsCode } from '../../../shared/logging/functionCustomError';
import { canonicalSeatKeyFromSuffix, parseSeatKeyToTwoDigitSuffix } from '../lib/parseOkibakeSeatKey';

const bustOkibakeSchema = z.object({
  tournamentId: z.string().min(1, 'tournamentId は必須です'),
  okibakeEntryId: z.string().min(1, 'okibakeEntryId は必須です'),
  operationId: z.string().min(1, 'operationId は必須です'),
  deviceName: z.string().optional(),
});

type TxOutcome =
  | { kind: 'replay' }
  | { kind: 'reject_failed_marker' }
  | { kind: 'idempotency_payload_mismatch' }
  | { kind: 'business_fail'; message: string; errorKey: string }
  | { kind: 'success' };

function slimEntry(data: Record<string, unknown> | undefined): Record<string, unknown> | null {
  if (!data) return null;
  return {
    entryStatus: data.entryStatus,
    billLinkStatus: data.billLinkStatus,
    assignedTableId: data.assignedTableId ?? null,
    assignedSeatKey: data.assignedSeatKey ?? null,
  };
}

function slimSeatSeat(
  seats: Record<string, unknown>,
  suffix: string
): Record<string, unknown> {
  return {
    userId: seats[`seat${suffix}UserId`] ?? null,
    pokerName: seats[`seat${suffix}PokerName`] ?? null,
    okibakeEntryId: seats[`seat${suffix}OkibakeEntryId`] ?? null,
  };
}

function resolveOkibakePlayerNameForOperationLog(entry: Record<string, unknown>): string {
  const linked = entry.linkedUserPokerName;
  if (typeof linked === 'string' && linked.trim().length > 0) return linked.trim();
  const temp = entry.temporaryDisplayName;
  if (typeof temp === 'string' && temp.trim().length > 0) return temp.trim();
  return '置きバケ';
}

function seatNumberFromAssignedSeatKey(seatKey: unknown): number | null {
  if (typeof seatKey !== 'string' || seatKey.trim().length === 0) return null;
  const suffix = parseSeatKeyToTwoDigitSuffix(seatKey);
  if (suffix == null) return null;
  return parseInt(suffix, 10);
}

function resolveDeviceDisplayName(device: DeviceDoc, deviceNameFromRequest?: string): string | undefined {
  const dn =
    typeof deviceNameFromRequest === 'string' && deviceNameFromRequest.trim().length > 0
      ? deviceNameFromRequest.trim()
      : undefined;
  if (dn != null) return dn;
  if (typeof device.name === 'string' && device.name.length > 0) return device.name;
  return undefined;
}

export const bustOkibakeTemporaryEntry = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', '認証が必要です');
  }

  const callerUid = request.auth.uid;
  let device: DeviceDoc | null = null;

  try {
    device = await getCallerDeviceByUid(callerUid);
    if (!device || !isActive(device.status)) {
      throw new HttpsError('permission-denied', 'デバイスが見つからないか、アクティブではありません');
    }
    const hasPermission = device.role === 'admin' || hasRequiredOption(device.options, 'tournament');
    if (!hasPermission) {
      throw new HttpsError('permission-denied', 'トーナメント運営の権限がありません');
    }

    const parsed = bustOkibakeSchema.safeParse(request.data);
    if (!parsed.success) {
      const msg = parsed.error.errors.map((e) => e.message).join(', ');
      throw new HttpsError('invalid-argument', msg || '入力が不正です');
    }

    const { tournamentId, okibakeEntryId, operationId, deviceName } = parsed.data;

    const db = admin.firestore();
    const opLogRef = db.collection('operationLogs').doc(operationId);
    const tournamentRef = db.collection('scheduledTournaments').doc(tournamentId);

    const preSnap = await opLogRef.get();
    if (preSnap.exists) {
      const pdata = preSnap.data()!;
      if (pdata.status === 'failed') {
        throw new HttpsError(
          'failed-precondition',
          'この operationId は失敗済みです。operationId を新しくして再度お試しください。'
        );
      }
      if (pdata.status === 'succeeded') {
        const pl = pdata.payload as Record<string, unknown> | undefined;
        const tid = typeof pl?.tournamentId === 'string' ? pl.tournamentId : null;
        const eid = typeof pl?.okibakeEntryId === 'string' ? pl.okibakeEntryId : null;
        if (tid !== tournamentId || eid !== okibakeEntryId) {
          throw new HttpsError(
            'failed-precondition',
            'この operationId は別内容の完了済み操作です。新しい operationId を指定してください。'
          );
        }
        logOpsSuccess({
          message: 'bustOkibakeTemporaryEntry 成功（冪等）',
          functionEntry: 'bustOkibakeTemporaryEntry',
          context: { tournamentId, okibakeEntryId, operationId, replay: true, callerUid, deviceId: device.id },
        });
        return { success: true, replay: true };
      }
    }

    const txResult = await db.runTransaction(async (tx): Promise<TxOutcome> => {
      const opSnap = await tx.get(opLogRef);
      if (opSnap.exists) {
        const pdata = opSnap.data()!;
        if (pdata.status === 'failed') return { kind: 'reject_failed_marker' };
        if (pdata.status === 'succeeded') {
          const pl = pdata.payload as Record<string, unknown> | undefined;
          const tid = typeof pl?.tournamentId === 'string' ? pl.tournamentId : null;
          const eid = typeof pl?.okibakeEntryId === 'string' ? pl.okibakeEntryId : null;
          if (tid === tournamentId && eid === okibakeEntryId) return { kind: 'replay' };
          return { kind: 'idempotency_payload_mismatch' };
        }
      }

      const nowTs = FieldValue.serverTimestamp();

      const failCommit = (msg: string, errorKey: string): TxOutcome => {
        const failDoc: Record<string, unknown> = {
          operationId,
          operationName: '置きバケ Bust',
          deviceId: device!.id,
          status: 'failed',
          payload: { tournamentId, okibakeEntryId, errorKey },
          tournamentId,
          createdAt: nowTs,
        };
        const devNameFail = resolveDeviceDisplayName(device!, deviceName);
        if (devNameFail) failDoc.deviceName = devNameFail;
        tx.set(opLogRef, failDoc);
        return { kind: 'business_fail', message: msg, errorKey };
      };

      const entryRef = tournamentRef.collection('okibakeTemporaryEntries').doc(okibakeEntryId);
      const entrySnap = await tx.get(entryRef);
      if (!entrySnap.exists) {
        return failCommit('置きバケ一時参加者が見つかりません', 'TOURNAMENT_OKIBAKE_NOT_FOUND');
      }
      const d = entrySnap.data() as Record<string, unknown>;
      const entryBefore = slimEntry(d);
      const entryStatus = d.entryStatus;
      const billLinkStatus = d.billLinkStatus;

      if (entryStatus !== 'seated' || billLinkStatus !== 'unlinked') {
        return failCommit('置きバケ一時参加者の状態が無効です', 'TOURNAMENT_OKIBAKE_INVALID_STATUS');
      }

      const assignedTableId =
        typeof d.assignedTableId === 'string' && d.assignedTableId.trim().length > 0
          ? d.assignedTableId.trim()
          : null;
      const rawSeatKey = typeof d.assignedSeatKey === 'string' ? d.assignedSeatKey : '';
      const suffix = parseSeatKeyToTwoDigitSuffix(rawSeatKey);
      const canonicalSeatKey = suffix ? canonicalSeatKeyFromSuffix(suffix) : null;

      if (!assignedTableId || !suffix || !canonicalSeatKey) {
        return failCommit('着席情報が不完全です', 'TOURNAMENT_OKIBAKE_INVALID_STATUS');
      }

      const tableSeatRef = tournamentRef.collection('tablesSeat').doc(assignedTableId);
      const tableSnap = await tx.get(tableSeatRef);
      if (!tableSnap.exists) {
        return failCommit('テーブルが存在しません', 'TOURNAMENT_OKIBAKE_INVALID_STATUS');
      }

      const seats = ((tableSnap.data() ?? {}).seats ?? {}) as Record<string, unknown>;
      const seatOk = seats[`seat${suffix}OkibakeEntryId`];
      if (seatOk !== okibakeEntryId) {
        return failCommit(
          '卓側の置きバケ席情報と参加者が一致しません',
          'TOURNAMENT_OKIBAKE_SEAT_MISMATCH'
        );
      }

      const seatBefore = slimSeatSeat(seats, suffix);
      const updatedSeats = { ...seats };
      updatedSeats[`seat${suffix}UserId`] = null;
      updatedSeats[`seat${suffix}PokerName`] = null;
      updatedSeats[`seat${suffix}OkibakeEntryId`] = null;

      tx.update(tableSeatRef, {
        seats: updatedSeats,
        updatedAt: nowTs,
      });

      const entryAfterPatch: Record<string, unknown> = {
        entryStatus: 'busted',
        bustedAt: nowTs,
        bustedTableId: assignedTableId,
        bustedSeatKey: canonicalSeatKey,
        updatedAt: nowTs,
      };
      tx.update(entryRef, entryAfterPatch as UpdateData<DocumentData>);

      const entryAfter = { ...entryBefore, ...entryAfterPatch } as Record<string, unknown>;

      const playerName = resolveOkibakePlayerNameForOperationLog(d);
      const seatNumber = seatNumberFromAssignedSeatKey(canonicalSeatKey);

      const opPayload: Record<string, unknown> = {
        tournamentId,
        okibakeEntryId,
        tableId: assignedTableId,
        seatKey: canonicalSeatKey,
        // 操作履歴 UI（getActionLogs → targetPlayerName / tableId / seatNumber）用
        playerName,
        ...(seatNumber != null && { seatNumber }),
        seatBefore,
        seatAfter: slimSeatSeat(updatedSeats, suffix),
        okibakeEntryBefore: entryBefore,
        okibakeEntryAfter: entryAfter,
      };

      const opLogDoc: Record<string, unknown> = {
        operationId,
        operationName: '置きバケ Bust',
        deviceId: device!.id,
        status: 'succeeded',
        payload: opPayload,
        tournamentId,
        tableId: assignedTableId,
        createdAt: nowTs,
      };
      const devNameOut = resolveDeviceDisplayName(device!, deviceName);
      if (devNameOut) opLogDoc.deviceName = devNameOut;

      tx.set(opLogRef, opLogDoc);

      return { kind: 'success' };
    });

    if (txResult.kind === 'reject_failed_marker') {
      throw new HttpsError(
        'failed-precondition',
        'この operationId は失敗済みです。operationId を新しくして再度お試しください。'
      );
    }
    if (txResult.kind === 'idempotency_payload_mismatch') {
      throw new HttpsError(
        'failed-precondition',
        'この operationId は別内容の完了済み操作です。新しい operationId を指定してください。'
      );
    }
    if (txResult.kind === 'business_fail') {
      throw new FunctionCustomError({
        errorKey: txResult.errorKey,
        message: txResult.message,
        context: { tournamentId, okibakeEntryId, operationId },
      });
    }

    if (txResult.kind === 'replay') {
      logOpsSuccess({
        message: 'bustOkibakeTemporaryEntry 成功（transaction 内冪等）',
        functionEntry: 'bustOkibakeTemporaryEntry',
        context: {
          tournamentId,
          okibakeEntryId,
          operationId,
          replay: true,
          callerUid,
          deviceId: device.id,
        },
      });
      return { success: true, replay: true };
    }

    logOpsSuccess({
      message: 'bustOkibakeTemporaryEntry 成功',
      functionEntry: 'bustOkibakeTemporaryEntry',
      context: {
        tournamentId,
        okibakeEntryId,
        operationId,
        callerUid,
        deviceId: device.id,
      },
    });

    return { success: true, replay: false };
  } catch (error) {
    if (error instanceof HttpsError) {
      logOpsError({
        message: 'bustOkibakeTemporaryEntry aborted',
        functionEntry: 'bustOkibakeTemporaryEntry',
        operation: 'httpsError',
        cause: error,
      });
      throw error;
    }
    if (error instanceof z.ZodError) {
      throw new HttpsError('invalid-argument', error.errors.map((e) => e.message).join(', '));
    }
    if (error instanceof FunctionCustomError) {
      logOpsError({
        message: 'bustOkibakeTemporaryEntry 業務拒否',
        functionEntry: 'bustOkibakeTemporaryEntry',
        operation: 'bustOkibakeCatch',
        cause: error,
      });
      throw new HttpsError(mapFunctionCustomErrorToHttpsCode(error.errorKey), error.message);
    }

    logOpsError({
      message: 'bustOkibakeTemporaryEntry エラー',
      functionEntry: 'bustOkibakeTemporaryEntry',
      operation: 'bustOkibakeMainCatch',
      cause: error,
    });
    throw new HttpsError(
      'internal',
      error instanceof Error ? error.message : '置きバケ bust に失敗しました'
    );
  }
});
