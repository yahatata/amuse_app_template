/**
 * Phase 2: 置きバケ一時参加者作成（詳細仕様書 §11, §6 / ChangeSpec Phase 2）
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { z } from 'zod';
import type { DeviceDoc } from '../../../shared/devices';
import { getCallerDeviceByUid, hasRequiredOption, isActive } from '../../../shared/devices';
import { logOpsError, logOpsSuccess } from '../../../shared/logging/logOpsError';
import { buildOkibakeTemporaryDisplayName } from '../lib/okibakeTemporaryDisplayName';
import type { OkibakeAddonIntent } from '../types/okibake';

const createOkibakeSchema = z.object({
  operationId: z.string().min(1, 'operationId は必須です'),
  tournamentId: z.string().min(1, 'tournamentId は必須です'),
  addonIntent: z.enum(['unknown', 'yes', 'no'], {
    errorMap: () => ({ message: 'addonIntent は unknown / yes / no のいずれかです' }),
  }),
  linkedUserId: z.string().optional().nullable(),
  linkedUserPokerName: z.string().optional().nullable(),
  memo: z.string().optional().nullable(),
  deviceName: z.string().optional(),
});

type TxOutcome =
  | { kind: 'replay'; okibakeEntryId: string; temporaryDisplayName: string }
  | { kind: 'reject_failed_marker' }
  | { kind: 'create'; okibakeEntryId: string; temporaryDisplayName: string }
  | { kind: 'error'; message: string; code: string };

/** memo: trim・空→null・最大200 */
export function normalizeOkibakeMemo(input: unknown): string | null {
  if (input == null || input === undefined) return null;
  const s = String(input).trim();
  return s.length === 0 ? null : s;
}

export const createOkibakeTemporaryEntry = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', '認証が必要です');
  }

  const callerUid = request.auth.uid;

  try {
    const device = await getCallerDeviceByUid(callerUid);
    if (!device || !isActive(device.status)) {
      throw new HttpsError('permission-denied', 'デバイスが見つからないか、アクティブではありません');
    }
    const hasPermission = device.role === 'admin' || hasRequiredOption(device.options, 'tournament');
    if (!hasPermission) {
      throw new HttpsError('permission-denied', 'トーナメント運営の権限がありません');
    }

    const parsed = createOkibakeSchema.safeParse(request.data);
    if (!parsed.success) {
      const msg = parsed.error.errors.map((e) => e.message).join(', ');
      throw new HttpsError('invalid-argument', msg || '入力が不正です');
    }

    const { operationId, tournamentId, addonIntent } = parsed.data;

    let memoNormalized = normalizeOkibakeMemo(parsed.data.memo);
    if (memoNormalized != null && memoNormalized.length > 200) {
      throw new HttpsError('invalid-argument', 'memo は最大 200 文字です');
    }

    const rawUid = parsed.data.linkedUserId;
    const rawName = parsed.data.linkedUserPokerName;
    const linkedUserId =
      typeof rawUid === 'string' && rawUid.trim().length > 0 ? rawUid.trim() : null;
    const linkedUserPokerName =
      typeof rawName === 'string' && rawName.trim().length > 0 ? rawName.trim() : null;
    if ((linkedUserId !== null) !== (linkedUserPokerName !== null)) {
      throw new HttpsError(
        'invalid-argument',
        'linkedUserId と linkedUserPokerName は両方指定するか、両方とも未指定です'
      );
    }

    const db = admin.firestore();

    const opLogRef = db.collection('operationLogs').doc(operationId);

    const preSnap = await opLogRef.get();
    if (preSnap.exists) {
      const pdata = preSnap.data()!;
      if (pdata.status === 'succeeded') {
        const pl = pdata.payload as Record<string, unknown> | undefined;
        const eid = typeof pl?.okibakeEntryId === 'string' ? pl.okibakeEntryId : null;
        const tdn = typeof pl?.temporaryDisplayName === 'string' ? pl.temporaryDisplayName : '';
        if (eid != null) {
          logOpsSuccess({
            message: 'createOkibakeTemporaryEntry 成功（冪等）',
            functionEntry: 'createOkibakeTemporaryEntry',
            context: { tournamentId, callerUid, deviceId: device.id, replay: true },
          });
          return {
            success: true,
            okibakeEntryId: eid,
            temporaryDisplayName: tdn,
            replay: true,
          };
        }
      }
      if (pdata.status === 'failed') {
        throw new HttpsError(
          'failed-precondition',
          'この operationId は失敗済みです。operationId を新しくして再度お試しください。'
        );
      }
    }

    const tournamentRef = db.collection('scheduledTournaments').doc(tournamentId);

    const txResult = await db.runTransaction(async (tx): Promise<TxOutcome> => {
      const opSnap = await tx.get(opLogRef);
      if (opSnap.exists) {
        const pdata = opSnap.data()!;
        if (pdata.status === 'failed') {
          return { kind: 'reject_failed_marker' };
        }
        if (pdata.status === 'succeeded') {
          const pl = pdata.payload as Record<string, unknown> | undefined;
          const eid = typeof pl?.okibakeEntryId === 'string' ? pl.okibakeEntryId : null;
          const tdn = typeof pl?.temporaryDisplayName === 'string' ? pl.temporaryDisplayName : '';
          if (eid != null) {
            return { kind: 'replay', okibakeEntryId: eid, temporaryDisplayName: tdn };
          }
        }
      }

      const tourSnap = await tx.get(tournamentRef);
      if (!tourSnap.exists) {
        return { kind: 'error', code: 'not-found', message: 'トーナメントが存在しません' };
      }

      const viewsMainRef = tournamentRef.collection('views').doc('main');
      const viewsSnap = await tx.get(viewsMainRef);
      if (!viewsSnap.exists) {
        return { kind: 'error', code: 'failed-precondition', message: 'トーナメントの views/main が存在しません' };
      }

      const tourData = tourSnap.data() ?? {};
      const rawNum = tourData.okibakeNextDisplayNumber;
      const seq = typeof rawNum === 'number' && Number.isInteger(rawNum) && rawNum >= 1 ? rawNum : 1;
      const temporaryDisplayName = buildOkibakeTemporaryDisplayName(seq);
      const nextSeq = seq + 1;

      const okibakeColl = tournamentRef.collection('okibakeTemporaryEntries');
      const entryRef = okibakeColl.doc();
      const okibakeEntryId = entryRef.id;

      const viewsData = viewsSnap.data() ?? {};
      const entries = typeof viewsData.entries === 'number' ? viewsData.entries : 0;
      const playersIn = typeof viewsData.playersIn === 'number' ? viewsData.playersIn : 0;
      const waitingCount = typeof viewsData.waitingCount === 'number' ? viewsData.waitingCount : 0;

      const nowTs = FieldValue.serverTimestamp();

      const entryPayload: Record<string, unknown> = {
        okibakeEntryId,
        tournamentId,
        temporaryDisplayName,
        linkedUserId,
        linkedUserPokerName,
        linkedBillId: null,
        linkedAt: null,
        entryStatus: 'registered',
        billLinkStatus: 'unlinked',
        addonIntent: addonIntent as OkibakeAddonIntent,
        memo: memoNormalized,
        okibakeAddonCount: 0,
        lastOkibakeAddonAt: null,
        okibakeAddonRecords: [],
        assignedTableId: null,
        assignedSeatKey: null,
        seatedAt: null,
        bustedAt: null,
        bustedTableId: null,
        bustedSeatKey: null,
        createdAt: nowTs,
        updatedAt: nowTs,
        createdByDeviceId: device.id,
        updatedByDeviceId: device.id,
        voidedAt: null,
        voidedByDeviceId: null,
      };

      tx.set(entryRef, entryPayload);

      tx.update(tournamentRef, {
        okibakeNextDisplayNumber: nextSeq,
        updatedAt: nowTs,
      });

      tx.update(viewsMainRef, {
        entries: entries + 1,
        playersIn: playersIn + 1,
        waitingCount: waitingCount + 1,
        updatedAt: nowTs,
      });

      const opPayload: Record<string, unknown> = {
        tournamentId,
        okibakeEntryId,
        temporaryDisplayName,
        addonIntent,
        memo: memoNormalized,
        linkedUserId,
        linkedUserPokerName,
      };

      const opLogDoc: Record<string, unknown> = {
        operationId,
        operationName: '置きバケ登録',
        deviceId: device.id,
        status: 'succeeded',
        payload: opPayload,
        tournamentId,
        createdAt: nowTs,
      };
      const devNameOut = resolveDeviceDisplayName(device, parsed.data.deviceName);
      if (devNameOut) {
        opLogDoc.deviceName = devNameOut;
      }

      tx.set(opLogRef, opLogDoc);

      return { kind: 'create', okibakeEntryId, temporaryDisplayName };
    });

    if (txResult.kind === 'reject_failed_marker') {
      throw new HttpsError(
        'failed-precondition',
        'この operationId は失敗済みです。operationId を新しくして再度お試しください。'
      );
    }
    if (txResult.kind === 'replay') {
      logOpsSuccess({
        message: 'createOkibakeTemporaryEntry 成功（transaction 内冪等）',
        functionEntry: 'createOkibakeTemporaryEntry',
        context: {
          tournamentId,
          callerUid,
          deviceId: device.id,
          replay: true,
        },
      });
      return {
        success: true,
        okibakeEntryId: txResult.okibakeEntryId,
        temporaryDisplayName: txResult.temporaryDisplayName,
        replay: true,
      };
    }
    if (txResult.kind === 'error') {
      const c = txResult.code;
      if (c === 'not-found') throw new HttpsError('not-found', txResult.message);
      throw new HttpsError('failed-precondition', txResult.message);
    }

    logOpsSuccess({
      message: 'createOkibakeTemporaryEntry 成功',
      functionEntry: 'createOkibakeTemporaryEntry',
      context: {
        tournamentId,
        okibakeEntryId: txResult.okibakeEntryId,
        temporaryDisplayName: txResult.temporaryDisplayName,
        callerUid,
        deviceId: device.id,
      },
    });

    return {
      success: true,
      okibakeEntryId: txResult.okibakeEntryId,
      temporaryDisplayName: txResult.temporaryDisplayName,
      replay: false,
    };
  } catch (error) {
    if (error instanceof HttpsError) {
      logOpsError({
        message: 'createOkibakeTemporaryEntry aborted',
        functionEntry: 'createOkibakeTemporaryEntry',
        operation: 'httpsError',
        cause: error,
      });
      throw error;
    }

    logOpsError({
      message: 'createOkibakeTemporaryEntry エラー',
      functionEntry: 'createOkibakeTemporaryEntry',
      operation: 'createOkibakeMainCatch',
      cause: error,
    });

    throw new HttpsError('internal', error instanceof Error ? error.message : '置きバケ登録に失敗しました');
  }
});

function resolveDeviceDisplayName(device: DeviceDoc, deviceNameFromRequest?: string): string | undefined {
  const dn =
    typeof deviceNameFromRequest === 'string' && deviceNameFromRequest.trim().length > 0
      ? deviceNameFromRequest.trim()
      : undefined;
  if (dn != null) return dn;
  if (typeof device.name === 'string' && device.name.length > 0) return device.name;
  return undefined;
}
