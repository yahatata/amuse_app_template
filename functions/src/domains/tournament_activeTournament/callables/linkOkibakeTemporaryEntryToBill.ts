/**
 * Phase 4-A: 置きバケ一時参加者の伝票紐付け（詳細仕様書 §14）
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { FieldValue, type UpdateData, type DocumentData, type DocumentReference } from 'firebase-admin/firestore';
import { z } from 'zod';
import type { DeviceDoc } from '../../../shared/devices';
import { getCallerDeviceByUid, isActive } from '../../../shared/devices';
import { logOpsError, logOpsSuccess } from '../../../shared/logging/logOpsError';
import { FunctionCustomError, mapFunctionCustomErrorToHttpsCode } from '../../../shared/logging/functionCustomError';
import { assertTournamentAllowsMutation } from '../lib/assertTournamentAllowsMutation';
import { parseSeatKeyToTwoDigitSuffix } from '../lib/parseOkibakeSeatKey';
import {
  buildOkibakeLinkBillTournamentReflection,
  slimOkibakeEntryForLinkLog,
  slimSeatForLinkLog,
} from '../lib/reflectOkibakeToBill';
import { findOkibakeLinkedUserConflictInTx } from '../lib/okibakeLinkedUserConflict';
import {
  assertOkibakeTournamentOperationPermission,
  assertTableDeviceCanAccessOkibakeEntry,
} from '../lib/okibakeTableDevicePermission';
import { assertUserNotMigrated } from '../../user/helpers/assertUserNotMigrated';

const linkOkibakeSchema = z.object({
  tournamentId: z.string().min(1, 'tournamentId は必須です'),
  okibakeEntryId: z.string().min(1, 'okibakeEntryId は必須です'),
  userId: z.string().min(1, 'userId は必須です'),
  billId: z.string().min(1, 'billId は必須です'),
  operationId: z.string().min(1, 'operationId は必須です'),
  deviceName: z.string().optional(),
});

type TxOutcome =
  | { kind: 'replay' }
  | { kind: 'reject_failed_marker' }
  | { kind: 'idempotency_payload_mismatch' }
  | { kind: 'business_fail'; message: string; errorKey: string }
  | { kind: 'success'; reflectedAddonCount: number };

const ALLOWED_BILL_STATUSES = new Set(['open', 'in_progress']);
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

function resolveLinkedPokerName(activeStayPokerName: unknown, billPartyPokerName: unknown): string | null {
  if (typeof activeStayPokerName === 'string' && activeStayPokerName.trim().length > 0) {
    return activeStayPokerName.trim();
  }
  if (typeof billPartyPokerName === 'string' && billPartyPokerName.trim().length > 0) {
    return billPartyPokerName.trim();
  }
  return null;
}

function replayPayloadMatches(
  pl: Record<string, unknown> | undefined,
  tournamentId: string,
  okibakeEntryId: string,
  billId: string,
  userId: string
): boolean {
  if (!pl) return false;
  return (
    pl.tournamentId === tournamentId &&
    pl.okibakeEntryId === okibakeEntryId &&
    pl.billId === billId &&
    pl.userId === userId
  );
}

export const linkOkibakeTemporaryEntryToBill = onCall(async (request) => {
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

    const parsed = linkOkibakeSchema.safeParse(request.data);
    if (!parsed.success) {
      const msg = parsed.error.errors.map((e) => e.message).join(', ');
      throw new HttpsError('invalid-argument', msg || '入力が不正です');
    }

    const { tournamentId, okibakeEntryId, userId, billId, operationId, deviceName } = parsed.data;

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
    const activeStayRef = db.collection('activeStays').doc(userId);
    const billRef = db.collection('bills').doc(billId);
    const waitingRef = tournamentRef.collection('tablesSeat').doc('waiting');
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
        if (!replayPayloadMatches(pl, tournamentId, okibakeEntryId, billId, userId)) {
          throw new HttpsError(
            'failed-precondition',
            'この operationId は別内容の完了済み操作です。新しい operationId を指定してください。'
          );
        }
        logOpsSuccess({
          message: 'linkOkibakeTemporaryEntryToBill 成功（冪等）',
          functionEntry: 'linkOkibakeTemporaryEntryToBill',
          context: {
            tournamentId,
            okibakeEntryId,
            billId,
            userId,
            operationId,
            replay: true,
            callerUid,
            deviceId: device.id,
          },
        });
        return { success: true, replay: true, billId, okibakeEntryId };
      }
    }

    // 移行済み店舗管理ユーザーは伝票紐付け不可（tx 前）
    const linkUserPreSnap = await db.collection('users').doc(userId).get();
    if (linkUserPreSnap.exists) {
      assertUserNotMigrated(linkUserPreSnap.data()!);
    }

    const txResult = await db.runTransaction(async (tx): Promise<TxOutcome> => {
      const opSnap = await tx.get(opLogRef);
      if (opSnap.exists) {
        const pdata = opSnap.data()!;
        if (pdata.status === 'failed') return { kind: 'reject_failed_marker' };
        if (pdata.status === 'succeeded') {
          const pl = pdata.payload as Record<string, unknown> | undefined;
          if (replayPayloadMatches(pl, tournamentId, okibakeEntryId, billId, userId)) {
            return { kind: 'replay' };
          }
          return { kind: 'idempotency_payload_mismatch' };
        }
      }

      const nowTs = FieldValue.serverTimestamp();

      const failCommit = (msg: string, errorKey: string): TxOutcome => {
        const failDoc: Record<string, unknown> = {
          operationId,
          operationName: '置きバケ伝票紐付け',
          deviceId: device!.id,
          status: 'failed',
          payload: { tournamentId, okibakeEntryId, billId, userId, errorKey },
          tournamentId,
          createdAt: nowTs,
        };
        const devNameFail = resolveDeviceDisplayName(device!, deviceName);
        if (devNameFail) failDoc.deviceName = devNameFail;
        tx.set(opLogRef, failDoc);
        return { kind: 'business_fail', message: msg, errorKey };
      };

      const tourSnap = await tx.get(tournamentRef);
      if (!tourSnap.exists) {
        return failCommit('トーナメントが存在しません', 'TOURNAMENT_OKIBAKE_LINK_NOT_FOUND');
      }

      const tourData = tourSnap.data() ?? {};
      const templateId = typeof tourData.templateId === 'string' ? tourData.templateId : null;
      if (!templateId) {
        return failCommit('トーナメントの templateId が存在しません', 'TOURNAMENT_OKIBAKE_LINK_NOT_FOUND');
      }

      const snapshot = (typeof tourData.snapshot === 'object' && tourData.snapshot != null
        ? tourData.snapshot
        : {}) as Record<string, unknown>;
      const templateName = typeof snapshot.name === 'string' ? snapshot.name : '';
      const entryFeeIncl =
        typeof snapshot.entryFee === 'number' && Number.isFinite(snapshot.entryFee) ? snapshot.entryFee : 0;
      const addonFeeIncl =
        typeof snapshot.addonFee === 'number' && Number.isFinite(snapshot.addonFee) ? snapshot.addonFee : 0;
      const startAt =
        tourData.startAt instanceof admin.firestore.Timestamp ? tourData.startAt : null;

      const entrySnap = await tx.get(entryRef);
      if (!entrySnap.exists) {
        return failCommit('置きバケ一時参加者が見つかりません', 'TOURNAMENT_OKIBAKE_LINK_NOT_FOUND');
      }

      const entryData = entrySnap.data() as Record<string, unknown>;
      const entryTournamentId = entryData.tournamentId;
      if (entryTournamentId !== tournamentId) {
        return failCommit('置きバケ一時参加者のトーナメントが一致しません', 'TOURNAMENT_OKIBAKE_LINK_INVALID_STATUS');
      }

      const billLinkStatus = entryData.billLinkStatus;
      if (billLinkStatus === 'linked') {
        return failCommit('置きバケはすでに伝票に紐付け済みです', 'TOURNAMENT_OKIBAKE_LINK_ALREADY_LINKED');
      }
      if (billLinkStatus !== 'unlinked' && billLinkStatus !== 'pending_review') {
        return failCommit('置きバケの状態では伝票紐付けできません', 'TOURNAMENT_OKIBAKE_LINK_INVALID_STATUS');
      }

      const entryStatus = entryData.entryStatus;
      if (entryStatus === 'voided') {
        return failCommit('取消済みの置きバケは伝票に紐付けできません', 'TOURNAMENT_OKIBAKE_LINK_INVALID_STATUS');
      }
      if (typeof entryStatus !== 'string' || !ALLOWED_ENTRY_STATUSES.has(entryStatus)) {
        return failCommit('置きバケの状態では伝票紐付けできません', 'TOURNAMENT_OKIBAKE_LINK_INVALID_STATUS');
      }

      const okibakeLinkedUserConflict = await findOkibakeLinkedUserConflictInTx({
        tx,
        tournamentRef,
        userId,
        excludeOkibakeEntryId: okibakeEntryId,
      });
      if (okibakeLinkedUserConflict.conflict) {
        return failCommit(
          '同一トーナメント内で他の置きバケに設定済みの対象ユーザーには紐付けできません',
          'TOURNAMENT_OKIBAKE_LINK_BILL_TOURNAMENT_CONFLICT'
        );
      }

      const activeStaySnap = await tx.get(activeStayRef);
      if (!activeStaySnap.exists) {
        return failCommit('来店情報が見つかりません', 'TOURNAMENT_OKIBAKE_LINK_BILL_NOT_FOUND');
      }
      const activeStayData = activeStaySnap.data() ?? {};
      if (activeStayData.isActive !== true) {
        return failCommit('来店中のユーザーではありません', 'TOURNAMENT_OKIBAKE_LINK_BILL_NOT_FOUND');
      }
      const stayBillId = activeStayData.billId;
      if (typeof stayBillId !== 'string' || stayBillId !== billId) {
        return failCommit('来店情報と伝票が一致しません', 'TOURNAMENT_OKIBAKE_LINK_USER_MISMATCH');
      }

      const billSnap = await tx.get(billRef);
      if (!billSnap.exists) {
        return failCommit('伝票が見つかりません', 'TOURNAMENT_OKIBAKE_LINK_BILL_NOT_FOUND');
      }
      const billData = billSnap.data() ?? {};
      const billStatus = typeof billData.status === 'string' ? billData.status : '';
      if (!ALLOWED_BILL_STATUSES.has(billStatus)) {
        return failCommit(
          `この状態の伝票には紐付けできません（status: ${billStatus}）`,
          'TOURNAMENT_OKIBAKE_LINK_BILL_INVALID_STATUS'
        );
      }

      const party = (typeof billData.party === 'object' && billData.party != null
        ? billData.party
        : {}) as Record<string, unknown>;
      const billUserId = party.userId;
      if (typeof billUserId !== 'string' || billUserId !== userId) {
        return failCommit('伝票のユーザーと一致しません', 'TOURNAMENT_OKIBAKE_LINK_USER_MISMATCH');
      }

      const resolvedPokerName = resolveLinkedPokerName(activeStayData.pokerName, party.pokerName);
      if (resolvedPokerName == null) {
        return failCommit('ユーザー表示名を取得できません', 'TOURNAMENT_OKIBAKE_LINK_BILL_NOT_FOUND');
      }

      const billTournamentRef = billRef.collection('tournaments').doc(templateId);
      const billTournamentSnap = await tx.get(billTournamentRef);
      if (billTournamentSnap.exists) {
        return failCommit(
          'この伝票にはすでに同一トーナメントの参加情報があります',
          'TOURNAMENT_OKIBAKE_LINK_BILL_TOURNAMENT_CONFLICT'
        );
      }

      const okibakeEntryBefore = slimOkibakeEntryForLinkLog(entryData);

      let seatBefore: Record<string, unknown> | null = null;
      let seatAfter: Record<string, unknown> | null = null;
      let tableIdForLog: string | undefined;
      let tableSeatRef: DocumentReference | null = null;
      let seatedSeatsUpdate: Record<string, unknown> | null = null;
      let waitingBefore: Record<string, unknown> | null = null;
      let waitingAfter: Record<string, unknown> | null = null;
      let usersListBefore: Record<string, unknown> | null = null;
      let usersListAfter: Record<string, unknown> | null = null;
      let registeredWaitingSet: Record<string, unknown> | null = null;
      let registeredWaitingUpdate: Record<string, unknown> | null = null;
      let linkedUsersListUpdate: Record<string, unknown> | null = null;

      if (entryStatus === 'seated') {
        const assignedTableId = entryData.assignedTableId;
        const assignedSeatKey = entryData.assignedSeatKey;
        if (
          typeof assignedTableId !== 'string' ||
          assignedTableId.trim().length === 0 ||
          typeof assignedSeatKey !== 'string'
        ) {
          return failCommit('着席情報が不完全です', 'TOURNAMENT_OKIBAKE_LINK_INVALID_STATUS');
        }

        const suffix = parseSeatKeyToTwoDigitSuffix(assignedSeatKey);
        if (suffix == null) {
          return failCommit('着席情報が不正です', 'TOURNAMENT_OKIBAKE_LINK_INVALID_STATUS');
        }

        tableSeatRef = tournamentRef.collection('tablesSeat').doc(assignedTableId);
        const tableSnap = await tx.get(tableSeatRef);
        if (!tableSnap.exists) {
          return failCommit('テーブルが存在しません', 'TOURNAMENT_OKIBAKE_LINK_INVALID_STATUS');
        }

        const tableData = tableSnap.data() ?? {};
        const seats = { ...((tableData.seats ?? {}) as Record<string, unknown>) };
        const seatOkibakeId = seats[`seat${suffix}OkibakeEntryId`];
        if (seatOkibakeId !== okibakeEntryId) {
          return failCommit('席情報と置きバケが一致しません', 'TOURNAMENT_OKIBAKE_LINK_INVALID_STATUS');
        }

        seatBefore = slimSeatForLinkLog(seats, suffix);
        seats[`seat${suffix}UserId`] = userId;
        seats[`seat${suffix}PokerName`] = resolvedPokerName;
        seatAfter = slimSeatForLinkLog(seats, suffix);
        tableIdForLog = assignedTableId;
        seatedSeatsUpdate = seats;
      }

      if (entryStatus === 'registered') {
        const waitingSnap = await tx.get(waitingRef);

        const waitingData = waitingSnap.exists ? waitingSnap.data() ?? {} : {};
        const currentWaiting = (
          typeof waitingData.waiting === 'object' && waitingData.waiting != null
            ? waitingData.waiting
            : {}
        ) as Record<string, unknown>;
        if (currentWaiting[userId] != null) {
          return failCommit(
            '対象ユーザーはすでに待機者一覧に存在します',
            'TOURNAMENT_OKIBAKE_LINK_BILL_TOURNAMENT_CONFLICT'
          );
        }

        const maxOrder = Object.values(currentWaiting)
          .filter((val) => typeof val === 'object' && val !== null)
          .map((val) => {
            const order = (val as Record<string, unknown>).order;
            return typeof order === 'number' && Number.isFinite(order) ? order : 0;
          })
          .reduce((max, order) => Math.max(max, order), 0);
        const waitingEntry = {
          pokerName: resolvedPokerName,
          joinedAt: nowTs,
          order: maxOrder + 1,
        };
        const nextWaiting = {
          ...currentWaiting,
          [userId]: waitingEntry,
        };

        waitingBefore = {
          exists: waitingSnap.exists,
          count: waitingData.count ?? null,
          userEntry: null,
        };
        waitingAfter = {
          count: Object.keys(nextWaiting).length,
          userEntry: waitingEntry,
        };

        if (waitingSnap.exists) {
          registeredWaitingUpdate = {
            count: Object.keys(nextWaiting).length,
            waiting: nextWaiting,
            updatedAt: nowTs,
          };
        } else {
          registeredWaitingSet = {
            count: 1,
            waiting: nextWaiting,
            createdAt: nowTs,
            updatedAt: nowTs,
          };
        }
      }

      if (entryStatus === 'registered' || entryStatus === 'seated' || entryStatus === 'busted') {
        const usersListSnap = await tx.get(usersListRef);
        const usersListData = usersListSnap.exists ? usersListSnap.data() ?? {} : {};
        const currentUsers = (
          typeof usersListData.users === 'object' && usersListData.users != null
            ? usersListData.users
            : {}
        ) as Record<string, unknown>;
        if (currentUsers[userId] != null) {
          return failCommit(
            '対象ユーザーはすでにこのトーナメントに参加済みです',
            'TOURNAMENT_OKIBAKE_LINK_BILL_TOURNAMENT_CONFLICT'
          );
        }

        const usersListEntry = {
          pokerName: resolvedPokerName,
          registeredAt: nowTs,
          lastUpdatedAt: nowTs,
        };
        const nextUsers = {
          ...currentUsers,
          [userId]: usersListEntry,
        };
        usersListBefore = {
          exists: usersListSnap.exists,
          userEntry: null,
        };
        usersListAfter = {
          userEntry: usersListEntry,
        };
        linkedUsersListUpdate = {
          users: nextUsers,
          updatedAt: nowTs,
          ...(usersListSnap.exists ? {} : { createdAt: nowTs }),
        };
      }

      const reflection = buildOkibakeLinkBillTournamentReflection({
        fees: { templateId, templateName, entryFeeIncl, addonFeeIncl, startAt },
        existingTournamentData: null,
        okibakeAddonRecords: Array.isArray(entryData.okibakeAddonRecords) ? entryData.okibakeAddonRecords : [],
        billId,
        nowTs,
      });

      tx.set(billTournamentRef, reflection.tournamentUpdate, { merge: true });
      tx.update(billRef, { updatedAt: nowTs });

      const entryPatch: Record<string, unknown> = {
        linkedUserId: userId,
        linkedUserPokerName: resolvedPokerName,
        linkedBillId: billId,
        linkedAt: nowTs,
        billLinkStatus: 'linked',
        okibakeAddonRecords: reflection.updatedAddonRecords,
        updatedAt: nowTs,
        updatedByDeviceId: device!.id,
      };

      if (entryStatus === 'seated' && tableSeatRef != null && seatedSeatsUpdate != null) {
        tx.update(tableSeatRef, {
          seats: seatedSeatsUpdate,
          updatedAt: nowTs,
        });
      }
      if (entryStatus === 'registered') {
        if (registeredWaitingSet != null) {
          tx.set(waitingRef, registeredWaitingSet);
        } else if (registeredWaitingUpdate != null) {
          tx.update(waitingRef, registeredWaitingUpdate as UpdateData<DocumentData>);
        }
      }
      if (linkedUsersListUpdate != null) {
        tx.set(usersListRef, linkedUsersListUpdate, { merge: true });
      }

      if ((entryStatus === 'registered' || entryStatus === 'seated' || entryStatus === 'busted') && usersListBefore == null) {
        return failCommit(
          '操作履歴の保存に必要な usersListBefore を取得できませんでした',
          'TOURNAMENT_OKIBAKE_LINK_LOG_INCOMPLETE'
        );
      }
      if (entryStatus === 'registered' && waitingBefore == null) {
        return failCommit(
          '操作履歴の保存に必要な waitingBefore を取得できませんでした',
          'TOURNAMENT_OKIBAKE_LINK_LOG_INCOMPLETE'
        );
      }
      if (entryStatus === 'seated' && seatBefore == null) {
        return failCommit(
          '操作履歴の保存に必要な seatBefore を取得できませんでした',
          'TOURNAMENT_OKIBAKE_LINK_LOG_INCOMPLETE'
        );
      }

      tx.update(entryRef, entryPatch as UpdateData<DocumentData>);

      const okibakeEntryAfter = {
        ...(okibakeEntryBefore ?? {}),
        billLinkStatus: 'linked',
        linkedUserId: userId,
        linkedUserPokerName: resolvedPokerName,
        linkedBillId: billId,
      };

      const opPayload: Record<string, unknown> = {
        okibakeEntryId,
        billId,
        userId,
        tournamentId,
        templateId,
        sourceEntryStatus: entryStatus,
        playerName: resolvedPokerName,
        before: {
          billLinkStatus: okibakeEntryBefore?.billLinkStatus ?? 'unlinked',
          linkedBillId: okibakeEntryBefore?.linkedBillId ?? null,
          linkedUserId: okibakeEntryBefore?.linkedUserId ?? null,
          linkedUserPokerName: okibakeEntryBefore?.linkedUserPokerName ?? null,
        },
        after: {
          billLinkStatus: 'linked',
          linkedBillId: billId,
          linkedUserId: userId,
          linkedUserPokerName: resolvedPokerName,
        },
        reflectedEntry: reflection.reflectedEntry,
        reflectedAddonRecordIds: reflection.reflectedAddonRecordIds,
        reflectedAddonCount: reflection.reflectedAddonCount,
        reflectedAddonAmount: reflection.reflectedAddonAmount,
        okibakeEntryBefore,
        okibakeEntryAfter,
        billTournamentBefore: reflection.billTournamentBefore,
        billTournamentAfter: reflection.billTournamentAfter,
        ...(seatBefore != null && { seatBefore }),
        ...(seatAfter != null && { seatAfter }),
        ...(waitingBefore != null && { waitingBefore }),
        ...(waitingAfter != null && { waitingAfter }),
        ...(usersListBefore != null && { usersListBefore }),
        ...(usersListAfter != null && { usersListAfter }),
        ...(tableIdForLog != null && { tableId: tableIdForLog }),
      };

      const opLogDoc: Record<string, unknown> = {
        operationId,
        operationName: '置きバケ伝票紐付け',
        deviceId: device!.id,
        status: 'succeeded',
        payload: opPayload,
        tournamentId,
        createdAt: nowTs,
        ...(tableIdForLog != null && { tableId: tableIdForLog }),
      };
      const devNameOut = resolveDeviceDisplayName(device!, deviceName);
      if (devNameOut) opLogDoc.deviceName = devNameOut;

      tx.set(opLogRef, opLogDoc);

      return { kind: 'success', reflectedAddonCount: reflection.reflectedAddonCount };
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
        context: { tournamentId, okibakeEntryId, billId, userId, operationId },
      });
    }

    if (txResult.kind === 'replay') {
      logOpsSuccess({
        message: 'linkOkibakeTemporaryEntryToBill 成功（transaction 内冪等）',
        functionEntry: 'linkOkibakeTemporaryEntryToBill',
        context: {
          tournamentId,
          okibakeEntryId,
          billId,
          userId,
          operationId,
          replay: true,
          callerUid,
          deviceId: device.id,
        },
      });
      return { success: true, replay: true, billId, okibakeEntryId };
    }

    logOpsSuccess({
      message: 'linkOkibakeTemporaryEntryToBill 成功',
      functionEntry: 'linkOkibakeTemporaryEntryToBill',
      context: {
        tournamentId,
        okibakeEntryId,
        billId,
        userId,
        operationId,
        reflectedAddonCount: txResult.reflectedAddonCount,
        callerUid,
        deviceId: device.id,
      },
    });

    return { success: true, replay: false, billId, okibakeEntryId };
  } catch (error) {
    if (error instanceof HttpsError) {
      logOpsError({
        message: 'linkOkibakeTemporaryEntryToBill aborted',
        functionEntry: 'linkOkibakeTemporaryEntryToBill',
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
        message: 'linkOkibakeTemporaryEntryToBill 業務拒否',
        functionEntry: 'linkOkibakeTemporaryEntryToBill',
        operation: 'linkOkibakeCatch',
        cause: error,
      });
      throw new HttpsError(mapFunctionCustomErrorToHttpsCode(error.errorKey), error.message);
    }

    logOpsError({
      message: 'linkOkibakeTemporaryEntryToBill エラー',
      functionEntry: 'linkOkibakeTemporaryEntryToBill',
      operation: 'linkOkibakeMainCatch',
      cause: error,
    });
    throw new HttpsError(
      'internal',
      error instanceof Error ? error.message : '置きバケの伝票紐付けに失敗しました'
    );
  }
});
