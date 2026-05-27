/**
 * Phase 3C-1: 置きバケ一時参加者を席に割当（詳細仕様書 / ChangeSpec）
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

const assignOkibakeSeatSchema = z.object({
  tournamentId: z.string().min(1, 'tournamentId は必須です'),
  okibakeEntryId: z.string().min(1, 'okibakeEntryId は必須です'),
  tableId: z.string().min(1, 'tableId は必須です'),
  seatKey: z.string().min(1, 'seatKey は必須です'),
  operationId: z.string().min(1, 'operationId は必須です'),
  deviceName: z.string().optional(),
});

type TxOutcome =
  | { kind: 'replay'; okibakeEntryId: string }
  | { kind: 'reject_failed_marker' }
  | { kind: 'idempotency_payload_mismatch' }
  | { kind: 'business_fail'; message: string; errorKey: string }
  | { kind: 'success'; okibakeEntryId: string };

function slimEntry(data: Record<string, unknown> | undefined): Record<string, unknown> | null {
  if (!data) return null;
  return {
    entryStatus: data.entryStatus,
    billLinkStatus: data.billLinkStatus,
    assignedTableId: data.assignedTableId ?? null,
    assignedSeatKey: data.assignedSeatKey ?? null,
    okibakeAddonCount: data.okibakeAddonCount ?? 0,
    temporaryDisplayName: data.temporaryDisplayName ?? null,
    linkedUserPokerName: data.linkedUserPokerName ?? null,
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

function isSeatSlotEmpty(seats: Record<string, unknown>, suffix: string): boolean {
  const uid = seats[`seat${suffix}UserId`];
  const ok = seats[`seat${suffix}OkibakeEntryId`];
  return (uid == null || uid === '') && (ok == null || ok === '');
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

export const assignOkibakeTemporaryEntryToSeat = onCall(async (request) => {
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

    const parsed = assignOkibakeSeatSchema.safeParse(request.data);
    if (!parsed.success) {
      const msg = parsed.error.errors.map((e) => e.message).join(', ');
      throw new HttpsError('invalid-argument', msg || '入力が不正です');
    }

    const { tournamentId, okibakeEntryId, tableId, seatKey: rawSeatKey, operationId, deviceName } =
      parsed.data;

    const suffix = parseSeatKeyToTwoDigitSuffix(rawSeatKey);
    if (!suffix) {
      throw new HttpsError('invalid-argument', 'seatKey の形式が不正です');
    }
    const canonicalSeatKey = canonicalSeatKeyFromSuffix(suffix);

    const db = admin.firestore();
    const opLogRef = db.collection('operationLogs').doc(operationId);
    const tournamentRef = db.collection('scheduledTournaments').doc(tournamentId);
    const entryRef = tournamentRef.collection('okibakeTemporaryEntries').doc(okibakeEntryId);
    const tableSeatRef = tournamentRef.collection('tablesSeat').doc(tableId);
    const viewsMainRef = tournamentRef.collection('views').doc('main');

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
        const eid = typeof pl?.okibakeEntryId === 'string' ? pl.okibakeEntryId : null;
        const tid = typeof pl?.tournamentId === 'string' ? pl.tournamentId : null;
        const tbl = typeof pl?.tableId === 'string' ? pl.tableId : null;
        const sk = typeof pl?.seatKey === 'string' ? pl.seatKey : null;
        if (eid !== okibakeEntryId || tid !== tournamentId || tbl !== tableId || sk !== canonicalSeatKey) {
          throw new HttpsError(
            'failed-precondition',
            'この operationId は別内容の完了済み操作です。新しい operationId を指定してください。'
          );
        }
        logOpsSuccess({
          message: 'assignOkibakeTemporaryEntryToSeat 成功（冪等）',
          functionEntry: 'assignOkibakeTemporaryEntryToSeat',
          context: { tournamentId, okibakeEntryId, operationId, replay: true, callerUid, deviceId: device.id },
        });
        return { success: true, replay: true, okibakeEntryId };
      }
    }

    const txResult = await db.runTransaction(async (tx): Promise<TxOutcome> => {
      const opSnap = await tx.get(opLogRef);
      if (opSnap.exists) {
        const pdata = opSnap.data()!;
        if (pdata.status === 'failed') return { kind: 'reject_failed_marker' };
        if (pdata.status === 'succeeded') {
          const pl = pdata.payload as Record<string, unknown> | undefined;
          const eid = typeof pl?.okibakeEntryId === 'string' ? pl.okibakeEntryId : null;
          const tid = typeof pl?.tournamentId === 'string' ? pl.tournamentId : null;
          const tbl = typeof pl?.tableId === 'string' ? pl.tableId : null;
          const sk = typeof pl?.seatKey === 'string' ? pl.seatKey : null;
          if (eid === okibakeEntryId && tid === tournamentId && tbl === tableId && sk === canonicalSeatKey) {
            return { kind: 'replay', okibakeEntryId };
          }
          return { kind: 'idempotency_payload_mismatch' };
        }
      }

      const nowTs = FieldValue.serverTimestamp();

      const failCommit = (
        msg: string,
        errorKey: string
      ): { kind: 'business_fail'; message: string; errorKey: string } => {
        const failDoc: Record<string, unknown> = {
          operationId,
          operationName: '置きバケ着席',
          deviceId: device!.id,
          status: 'failed',
          payload: { tournamentId, okibakeEntryId, tableId, seatKey: canonicalSeatKey, errorKey },
          tournamentId,
          createdAt: nowTs,
        };
        const devNameFail = resolveDeviceDisplayName(device!, deviceName);
        if (devNameFail) failDoc.deviceName = devNameFail;
        tx.set(opLogRef, failDoc);
        return { kind: 'business_fail', message: msg, errorKey };
      };

      const entrySnap = await tx.get(entryRef);
      if (!entrySnap.exists) {
        return failCommit(
          '置きバケ一時参加者が見つかりません',
          'TOURNAMENT_OKIBAKE_NOT_FOUND'
        );
      }
      const entryBefore = slimEntry(entrySnap.data());
      const d = entrySnap.data()!;
      const entryStatus = d.entryStatus;
      const billLinkStatus = d.billLinkStatus;
      if (entryStatus !== 'registered') {
        return failCommit(
          '置きバケ一時参加者の状態が無効です',
          'TOURNAMENT_OKIBAKE_INVALID_STATUS'
        );
      }
      if (billLinkStatus !== 'unlinked') {
        return failCommit(
          '置きバケ一時参加者の状態が無効です',
          'TOURNAMENT_OKIBAKE_INVALID_STATUS'
        );
      }

      const tableSnap = await tx.get(tableSeatRef);
      if (!tableSnap.exists) {
        return failCommit('テーブルが存在しません', 'TOURNAMENT_OKIBAKE_INVALID_STATUS');
      }
      const td = tableSnap.data()!;
      if (!td.isEnabled) {
        return failCommit('テーブルが無効です', 'TOURNAMENT_OKIBAKE_INVALID_STATUS');
      }
      const seats = (td.seats ?? {}) as Record<string, unknown>;
      if (!isSeatSlotEmpty(seats, suffix)) {
        return failCommit('指定された席は使用中です', 'TOURNAMENT_OKIBAKE_SEAT_OCCUPIED');
      }

      const viewsSnap = await tx.get(viewsMainRef);
      if (!viewsSnap.exists) {
        return failCommit('トーナメントの views/main が存在しません', 'TOURNAMENT_OKIBAKE_INVALID_STATUS');
      }

      const viewsData = viewsSnap.data() ?? {};
      const waitingCountRaw = typeof viewsData.waitingCount === 'number' ? viewsData.waitingCount : 0;
      const waitingCountClamp = waitingCountRaw <= 0;

      const seatBefore = slimSeatSeat(seats, suffix);
      const displayName =
        typeof d.linkedUserPokerName === 'string' && d.linkedUserPokerName.trim().length > 0
          ? d.linkedUserPokerName.trim()
          : typeof d.temporaryDisplayName === 'string'
            ? d.temporaryDisplayName
            : '';

      const updatedSeats = { ...seats };
      updatedSeats[`seat${suffix}UserId`] = null;
      updatedSeats[`seat${suffix}PokerName`] = displayName;
      updatedSeats[`seat${suffix}OkibakeEntryId`] = okibakeEntryId;

      const seatAfter = slimSeatSeat(updatedSeats, suffix);

      tx.update(tableSeatRef, {
        seats: updatedSeats,
        updatedAt: nowTs,
      });

      const entryAfterPatch: Record<string, unknown> = {
        entryStatus: 'seated',
        assignedTableId: tableId,
        assignedSeatKey: canonicalSeatKey,
        seatedAt: nowTs,
        updatedAt: nowTs,
        updatedByDeviceId: device!.id,
      };
      tx.update(entryRef, entryAfterPatch as UpdateData<DocumentData>);

      tx.update(viewsMainRef, {
        waitingCount: Math.max(0, waitingCountRaw - 1),
        updatedAt: nowTs,
      });

      const entryAfter = { ...entryBefore, ...entryAfterPatch } as Record<string, unknown>;

      const opPayload: Record<string, unknown> = {
        tournamentId,
        okibakeEntryId,
        tableId,
        seatKey: canonicalSeatKey,
        // 操作履歴 UI（getActionLogs → targetPlayerName / tableId / seatNumber）用
        playerName: displayName,
        seatNumber: parseInt(suffix, 10),
        seatBefore,
        seatAfter,
        okibakeEntryBefore: entryBefore,
        okibakeEntryAfter: entryAfter,
        ...(waitingCountClamp ? { waitingCountClamp: true, waitingCountBefore: waitingCountRaw } : {}),
      };

      const opLogDoc: Record<string, unknown> = {
        operationId,
        operationName: '置きバケ着席',
        deviceId: device!.id,
        status: 'succeeded',
        payload: opPayload,
        tournamentId,
        tableId,
        createdAt: nowTs,
      };
      const devNameOut = resolveDeviceDisplayName(device!, deviceName);
      if (devNameOut) opLogDoc.deviceName = devNameOut;

      tx.set(opLogRef, opLogDoc);

      return { kind: 'success', okibakeEntryId };
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
        context: { tournamentId, okibakeEntryId, operationId, tableId, seatKey: canonicalSeatKey },
      });
    }
    if (txResult.kind === 'replay') {
      logOpsSuccess({
        message: 'assignOkibakeTemporaryEntryToSeat 成功（transaction 内冪等）',
        functionEntry: 'assignOkibakeTemporaryEntryToSeat',
        context: {
          tournamentId,
          okibakeEntryId,
          operationId,
          replay: true,
          callerUid,
          deviceId: device.id,
        },
      });
      return { success: true, replay: true, okibakeEntryId: txResult.okibakeEntryId };
    }

    logOpsSuccess({
      message: 'assignOkibakeTemporaryEntryToSeat 成功',
      functionEntry: 'assignOkibakeTemporaryEntryToSeat',
      context: {
        tournamentId,
        okibakeEntryId,
        operationId,
        tableId,
        seatKey: canonicalSeatKey,
        callerUid,
        deviceId: device.id,
      },
    });

    return { success: true, replay: false, okibakeEntryId: txResult.okibakeEntryId };
  } catch (error) {
    if (error instanceof HttpsError) {
      logOpsError({
        message: 'assignOkibakeTemporaryEntryToSeat aborted',
        functionEntry: 'assignOkibakeTemporaryEntryToSeat',
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
        message: 'assignOkibakeTemporaryEntryToSeat 業務拒否',
        functionEntry: 'assignOkibakeTemporaryEntryToSeat',
        operation: 'assignOkibakeCatch',
        cause: error,
      });
      throw new HttpsError(mapFunctionCustomErrorToHttpsCode(error.errorKey), error.message);
    }

    logOpsError({
      message: 'assignOkibakeTemporaryEntryToSeat エラー',
      functionEntry: 'assignOkibakeTemporaryEntryToSeat',
      operation: 'assignOkibakeMainCatch',
      cause: error,
    });
    throw new HttpsError(
      'internal',
      error instanceof Error ? error.message : '置きバケ着席に失敗しました'
    );
  }
});
