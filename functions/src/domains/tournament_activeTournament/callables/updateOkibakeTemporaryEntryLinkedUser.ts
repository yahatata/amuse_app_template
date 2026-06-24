/**
 * Phase 5-A': 置きバケ一時参加者の対象ユーザー後付け（Functions only）。
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { FieldValue, type UpdateData, type DocumentData } from 'firebase-admin/firestore';
import { z } from 'zod';
import type { DeviceDoc } from '../../../shared/devices';
import { getCallerDeviceByUid, isActive } from '../../../shared/devices';
import { logOpsError, logOpsSuccess } from '../../../shared/logging/logOpsError';
import { FunctionCustomError, mapFunctionCustomErrorToHttpsCode } from '../../../shared/logging/functionCustomError';
import { assertTournamentAllowsMutation } from '../lib/assertTournamentAllowsMutation';
import { parseSeatKeyToTwoDigitSuffix } from '../lib/parseOkibakeSeatKey';
import {
  assertOkibakeTournamentOperationPermission,
  assertTableDeviceCanAccessOkibakeEntry,
} from '../lib/okibakeTableDevicePermission';

const updateLinkedUserSchema = z.object({
  tournamentId: z.string().min(1, 'tournamentId は必須です'),
  okibakeEntryId: z.string().min(1, 'okibakeEntryId は必須です'),
  linkedUserId: z.string().min(1, 'linkedUserId は必須です'),
  operationId: z.string().min(1, 'operationId は必須です'),
  deviceName: z.string().optional(),
});

type TxOutcome =
  | { kind: 'replay'; linkedUserPokerName: string }
  | { kind: 'reject_failed_marker' }
  | { kind: 'idempotency_payload_mismatch' }
  | { kind: 'business_fail'; message: string; errorKey: string }
  | { kind: 'success'; linkedUserPokerName: string };

const ALLOWED_ENTRY_STATUSES = new Set(['registered', 'seated', 'busted']);

function resolveDeviceDisplayName(device: DeviceDoc, deviceNameFromRequest?: string): string | undefined {
  const dn =
    typeof deviceNameFromRequest === 'string' && deviceNameFromRequest.trim().length > 0
      ? deviceNameFromRequest.trim()
      : undefined;
  if (dn != null) return dn;
  if (typeof device.name === 'string' && device.name.length > 0) return device.name;
  return undefined;
}

function replayPayloadMatches(
  pl: Record<string, unknown> | undefined,
  tournamentId: string,
  okibakeEntryId: string,
  linkedUserId: string
): boolean {
  if (!pl) return false;
  return (
    pl.tournamentId === tournamentId &&
    pl.okibakeEntryId === okibakeEntryId &&
    pl.linkedUserId === linkedUserId
  );
}

function resolveLinkedUserPokerName(userData: Record<string, unknown> | undefined, linkedUserId: string): string {
  const pokerName = userData?.pokerName;
  if (typeof pokerName === 'string' && pokerName.trim().length > 0) {
    return pokerName.trim();
  }
  return linkedUserId;
}

function slimSeatForLog(
  tableId: string,
  seatKey: string,
  seats: Record<string, unknown>,
  suffix: string
): Record<string, unknown> {
  return {
    tableId,
    seatKey,
    pokerName: seats[`seat${suffix}PokerName`] ?? null,
  };
}

export const updateOkibakeTemporaryEntryLinkedUser = onCall(async (request) => {
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
    assertOkibakeTournamentOperationPermission(device);

    const parsed = updateLinkedUserSchema.safeParse(request.data);
    if (!parsed.success) {
      const msg = parsed.error.errors.map((e) => e.message).join(', ');
      throw new HttpsError('invalid-argument', msg || '入力が不正です');
    }

    const { tournamentId, okibakeEntryId, operationId, deviceName } = parsed.data;
    const linkedUserId = parsed.data.linkedUserId.trim();
    if (linkedUserId.length === 0) {
      throw new HttpsError('invalid-argument', 'linkedUserId は必須です');
    }

    const db = admin.firestore();
    const opLogRef = db.collection('operationLogs').doc(operationId);
    const tournamentRef = db.collection('scheduledTournaments').doc(tournamentId);
    const tournamentSnap = await tournamentRef.get();
    if (!tournamentSnap.exists) {
      throw new FunctionCustomError({
        errorKey: 'TOURNAMENT_INVALID_STATE',
        message: 'トーナメントが存在しません',
        context: { tournamentId, reason: 'tournament_not_found' },
      });
    }
    assertTournamentAllowsMutation({
      tournamentId,
      status: tournamentSnap.data()?.status as string | undefined,
    });
    const entryRef = tournamentRef.collection('okibakeTemporaryEntries').doc(okibakeEntryId);
    const userRef = db.collection('users').doc(linkedUserId);
    const usersListRef = tournamentRef.collection('views').doc('usersList');

    if (device.role === 'table') {
      const entrySnapForPermission = await entryRef.get();
      if (!entrySnapForPermission.exists) {
        throw new HttpsError('not-found', '置きバケエントリが見つかりません');
      }
      assertTableDeviceCanAccessOkibakeEntry({
        device,
        entry: entrySnapForPermission.data(),
      });
    }

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
        if (!replayPayloadMatches(pl, tournamentId, okibakeEntryId, linkedUserId)) {
          throw new FunctionCustomError({
            errorKey: 'TOURNAMENT_OKIBAKE_UPDATE_LINKED_USER_OPERATION_MISMATCH',
            message: 'この operationId は別内容の完了済み操作です。新しい operationId を指定してください。',
            context: { tournamentId, okibakeEntryId, linkedUserId, operationId },
          });
        }
        const linkedUserPokerName =
          typeof pl?.linkedUserPokerName === 'string' && pl.linkedUserPokerName.length > 0
            ? pl.linkedUserPokerName
            : linkedUserId;
        logOpsSuccess({
          message: 'updateOkibakeTemporaryEntryLinkedUser 成功（冪等）',
          functionEntry: 'updateOkibakeTemporaryEntryLinkedUser',
          context: {
            tournamentId,
            okibakeEntryId,
            linkedUserId,
            operationId,
            replay: true,
            callerUid,
            deviceId: device.id,
          },
        });
        return {
          success: true,
          replay: true,
          okibakeEntryId,
          linkedUserId,
          linkedUserPokerName,
        };
      }
    }

    const txResult = await db.runTransaction(async (tx): Promise<TxOutcome> => {
      const opSnap = await tx.get(opLogRef);
      if (opSnap.exists) {
        const pdata = opSnap.data()!;
        if (pdata.status === 'failed') return { kind: 'reject_failed_marker' };
        if (pdata.status === 'succeeded') {
          const pl = pdata.payload as Record<string, unknown> | undefined;
          if (replayPayloadMatches(pl, tournamentId, okibakeEntryId, linkedUserId)) {
            const linkedUserPokerName =
              typeof pl?.linkedUserPokerName === 'string' && pl.linkedUserPokerName.length > 0
                ? pl.linkedUserPokerName
                : linkedUserId;
            return { kind: 'replay', linkedUserPokerName };
          }
          return { kind: 'idempotency_payload_mismatch' };
        }
      }

      const nowTs = FieldValue.serverTimestamp();

      const failCommit = (msg: string, errorKey: string): TxOutcome => {
        const failDoc: Record<string, unknown> = {
          operationId,
          operationName: '置きバケ対象ユーザー設定',
          deviceId: device!.id,
          status: 'failed',
          payload: { tournamentId, okibakeEntryId, linkedUserId, errorKey },
          tournamentId,
          createdAt: nowTs,
        };
        const devNameFail = resolveDeviceDisplayName(device!, deviceName);
        if (devNameFail) failDoc.deviceName = devNameFail;
        tx.set(opLogRef, failDoc);
        return { kind: 'business_fail', message: msg, errorKey };
      };

      const tourSnap = await tx.get(tournamentRef);
      const entrySnap = await tx.get(entryRef);
      const userSnap = await tx.get(userRef);
      const usersListSnap = await tx.get(usersListRef);

      if (!tourSnap.exists) {
        return failCommit('トーナメントが存在しません', 'TOURNAMENT_OKIBAKE_UPDATE_LINKED_USER_NOT_FOUND');
      }
      if (!entrySnap.exists) {
        return failCommit(
          '置きバケ一時参加者が見つかりません',
          'TOURNAMENT_OKIBAKE_UPDATE_LINKED_USER_NOT_FOUND'
        );
      }
      if (!userSnap.exists) {
        return failCommit('対象ユーザーが見つかりません', 'TOURNAMENT_OKIBAKE_UPDATE_LINKED_USER_USER_NOT_FOUND');
      }
      if (!usersListSnap.exists) {
        return failCommit(
          '通常参加済みチェックができません',
          'TOURNAMENT_OKIBAKE_UPDATE_LINKED_USER_CONFLICT'
        );
      }

      const entryData = entrySnap.data() ?? {};
      if (entryData.tournamentId !== tournamentId) {
        return failCommit(
          '置きバケ一時参加者のトーナメントが一致しません',
          'TOURNAMENT_OKIBAKE_UPDATE_LINKED_USER_INVALID_STATUS'
        );
      }

      const billLinkStatus = entryData.billLinkStatus;
      if (billLinkStatus !== 'unlinked') {
        return failCommit(
          'この状態の置きバケには対象ユーザーを設定できません',
          'TOURNAMENT_OKIBAKE_UPDATE_LINKED_USER_INVALID_STATUS'
        );
      }

      const entryStatus = entryData.entryStatus;
      if (typeof entryStatus !== 'string' || !ALLOWED_ENTRY_STATUSES.has(entryStatus)) {
        return failCommit(
          'この状態の置きバケには対象ユーザーを設定できません',
          'TOURNAMENT_OKIBAKE_UPDATE_LINKED_USER_INVALID_STATUS'
        );
      }

      if (
        typeof entryData.linkedUserId === 'string' &&
        entryData.linkedUserId.trim().length > 0
      ) {
        return failCommit(
          '対象ユーザーはすでに設定されています',
          'TOURNAMENT_OKIBAKE_UPDATE_LINKED_USER_INVALID_STATUS'
        );
      }

      const okibakeEntriesSnap = await tx.get(tournamentRef.collection('okibakeTemporaryEntries'));
      for (const okibakeDoc of okibakeEntriesSnap.docs) {
        if (okibakeDoc.id === okibakeEntryId) continue;
        const d = (okibakeDoc.data() ?? {}) as Record<string, unknown>;
        const st = typeof d.entryStatus === 'string' ? d.entryStatus : '';
        if (st === 'voided') continue;
        const uid =
          typeof d.linkedUserId === 'string' && d.linkedUserId.trim().length > 0
            ? d.linkedUserId.trim()
            : null;
        if (uid == null) continue;
        if (uid === linkedUserId) {
          return failCommit(
            '同一トーナメント内でこの対象ユーザーはすでに置きバケに設定されています',
            'TOURNAMENT_OKIBAKE_UPDATE_LINKED_USER_CONFLICT'
          );
        }
      }

      const usersListData = usersListSnap.data() ?? {};
      const users = usersListData.users;
      if (!users || typeof users !== 'object' || Array.isArray(users)) {
        return failCommit(
          '通常参加済みチェックができません',
          'TOURNAMENT_OKIBAKE_UPDATE_LINKED_USER_CONFLICT'
        );
      }
      if (Object.prototype.hasOwnProperty.call(users as Record<string, unknown>, linkedUserId)) {
        return failCommit(
          '対象ユーザーはすでにこのトーナメントに参加済みです',
          'TOURNAMENT_OKIBAKE_UPDATE_LINKED_USER_CONFLICT'
        );
      }

      const linkedUserPokerName = resolveLinkedUserPokerName(userSnap.data(), linkedUserId);

      let tableSeatRef: admin.firestore.DocumentReference | null = null;
      let updatedSeats: Record<string, unknown> | null = null;
      let seatBefore: Record<string, unknown> | null = null;
      let seatAfter: Record<string, unknown> | null = null;

      if (entryStatus === 'seated') {
        const assignedTableId = entryData.assignedTableId;
        const assignedSeatKey = entryData.assignedSeatKey;
        if (
          typeof assignedTableId !== 'string' ||
          assignedTableId.trim().length === 0 ||
          typeof assignedSeatKey !== 'string'
        ) {
          return failCommit(
            '着席情報が不完全です',
            'TOURNAMENT_OKIBAKE_UPDATE_LINKED_USER_SEAT_INCONSISTENCY'
          );
        }

        const suffix = parseSeatKeyToTwoDigitSuffix(assignedSeatKey);
        if (suffix == null) {
          return failCommit(
            '着席情報が不正です',
            'TOURNAMENT_OKIBAKE_UPDATE_LINKED_USER_SEAT_INCONSISTENCY'
          );
        }

        tableSeatRef = tournamentRef.collection('tablesSeat').doc(assignedTableId);
        const tableSnap = await tx.get(tableSeatRef);
        if (!tableSnap.exists) {
          return failCommit(
            'テーブルが存在しません',
            'TOURNAMENT_OKIBAKE_UPDATE_LINKED_USER_SEAT_INCONSISTENCY'
          );
        }

        const tableData = tableSnap.data() ?? {};
        const seats = tableData.seats;
        if (!seats || typeof seats !== 'object' || Array.isArray(seats)) {
          return failCommit(
            '席情報が不正です',
            'TOURNAMENT_OKIBAKE_UPDATE_LINKED_USER_SEAT_INCONSISTENCY'
          );
        }

        const currentSeats = { ...(seats as Record<string, unknown>) };
        if (currentSeats[`seat${suffix}OkibakeEntryId`] !== okibakeEntryId) {
          return failCommit(
            '席情報と置きバケが一致しません',
            'TOURNAMENT_OKIBAKE_UPDATE_LINKED_USER_SEAT_INCONSISTENCY'
          );
        }

        seatBefore = slimSeatForLog(assignedTableId, assignedSeatKey, currentSeats, suffix);
        currentSeats[`seat${suffix}PokerName`] = linkedUserPokerName;
        seatAfter = slimSeatForLog(assignedTableId, assignedSeatKey, currentSeats, suffix);
        updatedSeats = currentSeats;
      }

      const before = {
        linkedUserId: entryData.linkedUserId ?? null,
        linkedUserPokerName: entryData.linkedUserPokerName ?? null,
      };
      const after = { linkedUserId, linkedUserPokerName };

      const entryPatch: Record<string, unknown> = {
        linkedUserId,
        linkedUserPokerName,
        updatedAt: nowTs,
        updatedByDeviceId: device!.id,
      };
      tx.update(entryRef, entryPatch as UpdateData<DocumentData>);

      if (tableSeatRef != null && updatedSeats != null) {
        tx.update(tableSeatRef, {
          seats: updatedSeats,
          updatedAt: nowTs,
        });
      }

      const opPayload: Record<string, unknown> = {
        tournamentId,
        okibakeEntryId,
        linkedUserId,
        linkedUserPokerName,
        before,
        after,
      };
      const devNameOut = resolveDeviceDisplayName(device!, deviceName);
      if (devNameOut) opPayload.deviceName = devNameOut;
      if (seatBefore != null) opPayload.seatBefore = seatBefore;
      if (seatAfter != null) opPayload.seatAfter = seatAfter;

      const opLogDoc: Record<string, unknown> = {
        operationId,
        operationName: '置きバケ対象ユーザー設定',
        deviceId: device!.id,
        status: 'succeeded',
        payload: opPayload,
        tournamentId,
        createdAt: nowTs,
      };
      if (devNameOut) opLogDoc.deviceName = devNameOut;

      tx.set(opLogRef, opLogDoc);

      return { kind: 'success', linkedUserPokerName };
    });

    if (txResult.kind === 'reject_failed_marker') {
      throw new HttpsError(
        'failed-precondition',
        'この operationId は失敗済みです。operationId を新しくして再度お試しください。'
      );
    }
    if (txResult.kind === 'idempotency_payload_mismatch') {
      throw new FunctionCustomError({
        errorKey: 'TOURNAMENT_OKIBAKE_UPDATE_LINKED_USER_OPERATION_MISMATCH',
        message: 'この operationId は別内容の完了済み操作です。新しい operationId を指定してください。',
        context: { tournamentId, okibakeEntryId, linkedUserId, operationId },
      });
    }
    if (txResult.kind === 'business_fail') {
      throw new FunctionCustomError({
        errorKey: txResult.errorKey,
        message: txResult.message,
        context: { tournamentId, okibakeEntryId, linkedUserId, operationId },
      });
    }

    if (txResult.kind === 'replay') {
      logOpsSuccess({
        message: 'updateOkibakeTemporaryEntryLinkedUser 成功（transaction 内冪等）',
        functionEntry: 'updateOkibakeTemporaryEntryLinkedUser',
        context: {
          tournamentId,
          okibakeEntryId,
          linkedUserId,
          operationId,
          replay: true,
          callerUid,
          deviceId: device.id,
        },
      });
      return {
        success: true,
        replay: true,
        okibakeEntryId,
        linkedUserId,
        linkedUserPokerName: txResult.linkedUserPokerName,
      };
    }

    logOpsSuccess({
      message: 'updateOkibakeTemporaryEntryLinkedUser 成功',
      functionEntry: 'updateOkibakeTemporaryEntryLinkedUser',
      context: {
        tournamentId,
        okibakeEntryId,
        linkedUserId,
        operationId,
        callerUid,
        deviceId: device.id,
      },
    });

    return {
      success: true,
      replay: false,
      okibakeEntryId,
      linkedUserId,
      linkedUserPokerName: txResult.linkedUserPokerName,
    };
  } catch (error) {
    if (error instanceof HttpsError) {
      logOpsError({
        message: 'updateOkibakeTemporaryEntryLinkedUser aborted',
        functionEntry: 'updateOkibakeTemporaryEntryLinkedUser',
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
        message: 'updateOkibakeTemporaryEntryLinkedUser 業務拒否',
        functionEntry: 'updateOkibakeTemporaryEntryLinkedUser',
        operation: 'updateLinkedUserCatch',
        cause: error,
      });
      throw new HttpsError(mapFunctionCustomErrorToHttpsCode(error.errorKey), error.message);
    }

    logOpsError({
      message: 'updateOkibakeTemporaryEntryLinkedUser エラー',
      functionEntry: 'updateOkibakeTemporaryEntryLinkedUser',
      operation: 'updateLinkedUserMainCatch',
      cause: error,
    });
    throw new HttpsError(
      'internal',
      error instanceof Error ? error.message : '置きバケ対象ユーザーの設定に失敗しました'
    );
  }
});
