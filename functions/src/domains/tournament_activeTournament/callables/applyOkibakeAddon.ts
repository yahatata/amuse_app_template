/**
 * Phase 3C-1: 置きバケ一時参加者への Addon（詳細仕様書 / ChangeSpec）
 */

import { randomUUID } from 'crypto';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { z } from 'zod';
import type { DeviceDoc } from '../../../shared/devices';
import { getCallerDeviceByUid, hasRequiredOption, isActive } from '../../../shared/devices';
import { logOpsError, logOpsSuccess } from '../../../shared/logging/logOpsError';
import { FunctionCustomError, mapFunctionCustomErrorToHttpsCode } from '../../../shared/logging/functionCustomError';
import { assertTournamentAllowsMutation } from '../lib/assertTournamentAllowsMutation';
import { resolveAddonLimitPerPlayer } from '../../../shared/tournament/resolveAddonLimitPerPlayer';
import { parseSeatKeyToTwoDigitSuffix } from '../lib/parseOkibakeSeatKey';

const applyOkibakeAddonSchema = z.object({
  tournamentId: z.string().min(1, 'tournamentId は必須です'),
  okibakeEntryId: z.string().min(1, 'okibakeEntryId は必須です'),
  operationId: z.string().min(1, 'operationId は必須です'),
  deviceName: z.string().optional(),
  /** 画面から送られても Addon 可否判定には使わない */
  addonIntent: z.enum(['unknown', 'yes', 'no']).optional(),
});

type TxOutcome =
  | { kind: 'replay'; addonRecordId: string }
  | { kind: 'reject_failed_marker' }
  | { kind: 'idempotency_payload_mismatch' }
  | { kind: 'business_fail'; message: string; errorKey: string; addonLimit?: number; okibakeAddonCountBefore?: number }
  | { kind: 'success'; addonRecordId: string };

function slimEntry(data: Record<string, unknown> | undefined): Record<string, unknown> | null {
  if (!data) return null;
  return {
    entryStatus: data.entryStatus,
    billLinkStatus: data.billLinkStatus,
    okibakeAddonCount: data.okibakeAddonCount ?? 0,
    assignedTableId: data.assignedTableId ?? null,
    assignedSeatKey: data.assignedSeatKey ?? null,
  };
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

/** 操作履歴の「対象」表示名（席表示と同系統: linkedUserPokerName 優先）。 */
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

function resolveOkibakeSeatContext(entry: Record<string, unknown>): {
  tableId: string | null;
  seatNumber: number | null;
} {
  const tableRaw = entry.assignedTableId;
  const tableId = typeof tableRaw === 'string' && tableRaw.trim().length > 0 ? tableRaw.trim() : null;
  return {
    tableId,
    seatNumber: seatNumberFromAssignedSeatKey(entry.assignedSeatKey),
  };
}

export const applyOkibakeAddon = onCall(async (request) => {
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

    const parsed = applyOkibakeAddonSchema.safeParse(request.data);
    if (!parsed.success) {
      const msg = parsed.error.errors.map((e) => e.message).join(', ');
      throw new HttpsError('invalid-argument', msg || '入力が不正です');
    }

    const { tournamentId, okibakeEntryId, operationId, deviceName } = parsed.data;

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
        const tid = typeof pl?.tournamentId === 'string' ? pl.tournamentId : null;
        const eid = typeof pl?.okibakeEntryId === 'string' ? pl.okibakeEntryId : null;
        const ar = typeof pl?.addonRecordId === 'string' ? pl.addonRecordId : null;
        if (tid !== tournamentId || eid !== okibakeEntryId || ar == null) {
          throw new HttpsError(
            'failed-precondition',
            'この operationId は別内容の完了済み操作です。新しい operationId を指定してください。'
          );
        }
        logOpsSuccess({
          message: 'applyOkibakeAddon 成功（冪等）',
          functionEntry: 'applyOkibakeAddon',
          context: { tournamentId, okibakeEntryId, operationId, replay: true, callerUid, deviceId: device.id },
        });
        return { success: true, replay: true, addonRecordId: ar };
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
          const ar = typeof pl?.addonRecordId === 'string' ? pl.addonRecordId : null;
          if (tid === tournamentId && eid === okibakeEntryId && ar != null) {
            return { kind: 'replay', addonRecordId: ar };
          }
          return { kind: 'idempotency_payload_mismatch' };
        }
      }

      const nowTs = FieldValue.serverTimestamp();
      const failCommit = (
        msg: string,
        errorKey: string,
        opts?: { addonLimit?: number; okibakeAddonCountBefore?: number }
      ): TxOutcome => {
        const failDoc: Record<string, unknown> = {
          operationId,
          operationName: '置きバケ Addon',
          deviceId: device!.id,
          status: 'failed',
          payload: { tournamentId, okibakeEntryId, errorKey },
          tournamentId,
          createdAt: nowTs,
        };
        const devNameFail = resolveDeviceDisplayName(device!, deviceName);
        if (devNameFail) failDoc.deviceName = devNameFail;
        tx.set(opLogRef, failDoc);
        return {
          kind: 'business_fail',
          message: msg,
          errorKey,
          ...opts,
        };
      };

      const tourSnap = await tx.get(tournamentRef);
      if (!tourSnap.exists) {
        return failCommit('トーナメントが存在しません', 'TOURNAMENT_OKIBAKE_INVALID_STATUS');
      }

      const tourData = tourSnap.data() ?? {};
      const snapshot = (typeof tourData.snapshot === 'object' && tourData.snapshot != null
        ? tourData.snapshot
        : {}) as Record<string, unknown>;

      const addonLimit = resolveAddonLimitPerPlayer({
        isAddon: snapshot.isAddon,
        addonLimitPerPlayer: snapshot.addonLimitPerPlayer,
      });

      if (addonLimit <= 0) {
        return failCommit('このトーナメントでは Addon ができません', 'TOURNAMENT_OKIBAKE_INVALID_STATUS');
      }

      const entrySnap = await tx.get(entryRef);
      if (!entrySnap.exists) {
        return failCommit('置きバケ一時参加者が見つかりません', 'TOURNAMENT_OKIBAKE_NOT_FOUND');
      }
      const d = entrySnap.data() as Record<string, unknown>;
      const entryBefore = slimEntry(d);
      const entryStatus = d.entryStatus;
      const billLinkStatus = d.billLinkStatus;

      if (billLinkStatus !== 'unlinked') {
        return failCommit('置きバケ一時参加者の状態が無効です', 'TOURNAMENT_OKIBAKE_INVALID_STATUS');
      }

      const statusOk = entryStatus === 'registered' || entryStatus === 'seated';
      if (!statusOk) {
        return failCommit('置きバケ一時参加者の状態が無効です', 'TOURNAMENT_OKIBAKE_INVALID_STATUS');
      }

      const prev =
        typeof d.okibakeAddonCount === 'number' && Number.isInteger(d.okibakeAddonCount)
          ? d.okibakeAddonCount
          : 0;

      if (prev >= addonLimit) {
        return failCommit('Addon の上限に達しています', 'TOURNAMENT_OKIBAKE_ADDON_LIMIT_REACHED', {
          addonLimit,
          okibakeAddonCountBefore: prev,
        });
      }

      const viewsSnap = await tx.get(viewsMainRef);
      if (!viewsSnap.exists) {
        return failCommit('トーナメントの views/main が存在しません', 'TOURNAMENT_OKIBAKE_INVALID_STATUS');
      }
      const viewsData = viewsSnap.data() ?? {};
      const addonsBefore =
        typeof viewsData.addons === 'number' && Number.isFinite(viewsData.addons) ? viewsData.addons : 0;

      const addonRecordId = randomUUID();
      const existingRecords = Array.isArray(d.okibakeAddonRecords) ? [...d.okibakeAddonRecords] : [];
      const newRecord = {
        addonRecordId,
        operationId,
        occurredAt: admin.firestore.Timestamp.now(),
        createdByDeviceId: device!.id,
        reflectedToBill: false,
        reflectedToBillAt: null,
        linkedBillId: null,
        rolledBack: false,
        rollBackAt: null,
        rollBackBy: null,
      };

      tx.update(entryRef, {
        okibakeAddonRecords: [...existingRecords, newRecord],
        okibakeAddonCount: prev + 1,
        lastOkibakeAddonAt: nowTs,
        updatedAt: nowTs,
      });

      tx.update(viewsMainRef, {
        addons: addonsBefore + 1,
        updatedAt: nowTs,
      });

      const entryAfter = {
        ...(entryBefore ?? {}),
        okibakeAddonCount: prev + 1,
      };

      const playerName = resolveOkibakePlayerNameForOperationLog(d);
      const { tableId: assignedTableId, seatNumber } = resolveOkibakeSeatContext(d);

      const opPayload: Record<string, unknown> = {
        tournamentId,
        okibakeEntryId,
        addonRecordId,
        addonLimit,
        okibakeAddonCountBefore: prev,
        okibakeAddonCountAfter: prev + 1,
        okibakeEntryBefore: entryBefore,
        okibakeEntryAfter: entryAfter,
        // 操作履歴 UI（getActionLogs → targetPlayerName / tableId / seatNumber）用
        playerName,
        ...(assignedTableId != null && { tableId: assignedTableId }),
        ...(seatNumber != null && { seatNumber }),
      };

      const opLogDoc: Record<string, unknown> = {
        operationId,
        operationName: '置きバケ Addon',
        deviceId: device!.id,
        status: 'succeeded',
        payload: opPayload,
        tournamentId,
        createdAt: nowTs,
        ...(assignedTableId != null && { tableId: assignedTableId }),
      };
      const devNameOut = resolveDeviceDisplayName(device!, deviceName);
      if (devNameOut) opLogDoc.deviceName = devNameOut;

      tx.set(opLogRef, opLogDoc);

      return { kind: 'success', addonRecordId };
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
        context: {
          tournamentId,
          okibakeEntryId,
          operationId,
          ...(txResult.addonLimit !== undefined ? { addonLimit: txResult.addonLimit } : {}),
          ...(txResult.okibakeAddonCountBefore !== undefined
            ? { okibakeAddonCountBefore: txResult.okibakeAddonCountBefore }
            : {}),
        },
      });
    }

    if (txResult.kind === 'replay') {
      logOpsSuccess({
        message: 'applyOkibakeAddon 成功（transaction 内冪等）',
        functionEntry: 'applyOkibakeAddon',
        context: {
          tournamentId,
          okibakeEntryId,
          operationId,
          replay: true,
          callerUid,
          deviceId: device.id,
        },
      });
      return { success: true, replay: true, addonRecordId: txResult.addonRecordId };
    }

    logOpsSuccess({
      message: 'applyOkibakeAddon 成功',
      functionEntry: 'applyOkibakeAddon',
      context: {
        tournamentId,
        okibakeEntryId,
        operationId,
        addonRecordId: txResult.addonRecordId,
        callerUid,
        deviceId: device.id,
      },
    });

    return { success: true, replay: false, addonRecordId: txResult.addonRecordId };
  } catch (error) {
    if (error instanceof HttpsError) {
      logOpsError({
        message: 'applyOkibakeAddon aborted',
        functionEntry: 'applyOkibakeAddon',
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
        message: 'applyOkibakeAddon 業務拒否',
        functionEntry: 'applyOkibakeAddon',
        operation: 'applyOkibakeAddonCatch',
        cause: error,
      });
      throw new HttpsError(mapFunctionCustomErrorToHttpsCode(error.errorKey), error.message);
    }

    logOpsError({
      message: 'applyOkibakeAddon エラー',
      functionEntry: 'applyOkibakeAddon',
      operation: 'applyOkibakeAddonMainCatch',
      cause: error,
    });
    throw new HttpsError(
      'internal',
      error instanceof Error ? error.message : '置きバケ Addon に失敗しました'
    );
  }
});
