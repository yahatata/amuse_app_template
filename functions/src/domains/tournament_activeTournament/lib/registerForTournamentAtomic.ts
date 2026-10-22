/**
 * registerForTournament の atomic 実行
 *
 * - waiting / usersList / views 集計 / bill tournaments / nonce / idempotency を 1 transaction
 * - dualWrite（todaysBills）と operationLog は post-commit ベストエフォート（正本は bills）
 * - 同一 nonce 再送は tournamentRegistrationRequests から成功結果を再構築
 */

import * as admin from 'firebase-admin';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { assertUserNotMigrated } from '../../user/helpers/assertUserNotMigrated';
import * as configLoader from '../../../shared/config/configLoader';
import { getCurrentBusinessDateKeyOrThrow } from '../../storeMeta/repos/getCurrentBusinessDateKeyOrThrow';
import { isRegEndAtPast } from '../../../shared/tournament/liffTournamentDateUtils';
import { isTournamentStatusCancelled } from '../../../shared/tournament/mapScheduledTournamentForLiff';
import { appendAvgStackToMainViewUpdate } from '../../../shared/tournament/calculateAvgStack';
import { findOkibakeLinkedUserConflictInTx } from './okibakeLinkedUserConflict';
import * as dualWrite from '../../bills/repos/dualWrite';
import { throwTournamentHttpsError } from './tournamentHttpsError';
import {
  buildRegisterForTournamentFingerprint,
  buildRegisterIdempotencyKey,
} from './registerForTournamentNonce';

const ALLOWED_ENTRY_STATUSES = new Set(['scheduled', 'running']);

export type RegisterForTournamentSuccessData = {
  tournamentId: string;
  templateId: string;
  clientNonce: string;
  reused: boolean;
  registrationStatus: 'waiting';
  waiting: true;
  registeredAt: string;
  billId: string;
  entryFee: number;
  tournamentName: string;
  pokerName: string;
};

export const registerForTournamentAtomicTestHooks: {
  failPostCommitDualWrite?: boolean;
  /** テスト用: transaction 内で締切超過を模擬するため now を差し替え */
  nowOverride?: Date | null;
  /** テスト用: LIFF 登録設定の上書き（null/undefined で本番経路） */
  liffRegistrationEnabledOverride?: boolean | null;
  /** テスト用: dualWrite 有無の上書き */
  dualWriteEnabledOverride?: boolean | null;
} = {};

function toIso(value: unknown): string {
  if (
    value &&
    typeof value === 'object' &&
    'toDate' in value &&
    typeof (value as { toDate: () => Date }).toDate === 'function'
  ) {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }
  if (typeof value === 'string' && value.length > 0) {
    return value;
  }
  return new Date().toISOString();
}

function parseEntryFee(raw: unknown): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw) || !Number.isInteger(raw) || raw < 0) {
    throwTournamentHttpsError(
      'failed-precondition',
      'TOURNAMENT_FEE_INVALID',
      'entryFee is invalid',
    );
  }
  return raw;
}

function assertRegistrationAllowedStatus(status: string | undefined): void {
  if (isTournamentStatusCancelled(status)) {
    throwTournamentHttpsError(
      'failed-precondition',
      'TOURNAMENT_CANCELLED',
      'Tournament cancelled',
    );
  }
  if (status === 'ended' || status === 'force_ended') {
    throwTournamentHttpsError('failed-precondition', 'TOURNAMENT_ENDED', 'Tournament ended');
  }
  if (status === 'paused') {
    throwTournamentHttpsError('failed-precondition', 'TOURNAMENT_PAUSED', 'Tournament paused');
  }
  if (status === 'registered') {
    throwTournamentHttpsError(
      'failed-precondition',
      'TOURNAMENT_REGISTRATION_CLOSED',
      'Registration closed',
    );
  }
  if (!status || !ALLOWED_ENTRY_STATUSES.has(status)) {
    throwTournamentHttpsError(
      'failed-precondition',
      'TOURNAMENT_INVALID_STATE',
      'Tournament status does not allow registration',
    );
  }
}

function rebuildSuccessFromRequestDoc(params: {
  clientNonce: string;
  requestData: FirebaseFirestore.DocumentData;
}): RegisterForTournamentSuccessData {
  const { clientNonce, requestData } = params;
  const response = (requestData.response || {}) as Record<string, unknown>;
  const tournamentId =
    (typeof response.tournamentId === 'string' && response.tournamentId) ||
    (typeof requestData.tournamentId === 'string' ? requestData.tournamentId : '');
  const templateId =
    (typeof response.templateId === 'string' && response.templateId) ||
    (typeof requestData.templateId === 'string' ? requestData.templateId : '');
  const billId =
    (typeof response.billId === 'string' && response.billId) ||
    (typeof requestData.billId === 'string' ? requestData.billId : '');
  const entryFee =
    typeof response.entryFee === 'number'
      ? response.entryFee
      : typeof requestData.entryFee === 'number'
        ? requestData.entryFee
        : 0;
  const tournamentName =
    (typeof response.tournamentName === 'string' && response.tournamentName) ||
    (typeof requestData.tournamentName === 'string' ? requestData.tournamentName : '');
  const pokerName =
    (typeof response.pokerName === 'string' && response.pokerName) ||
    (typeof requestData.pokerName === 'string' ? requestData.pokerName : '');
  const registeredAt =
    (typeof response.registeredAt === 'string' && response.registeredAt) ||
    toIso(requestData.registeredAt);

  if (!tournamentId || !templateId || !billId) {
    throwTournamentHttpsError(
      'internal',
      'TOURNAMENT_INTERNAL_ERROR',
      'Incomplete registration request snapshot',
    );
  }

  return {
    tournamentId,
    templateId,
    clientNonce,
    reused: true,
    registrationStatus: 'waiting',
    waiting: true,
    registeredAt,
    billId,
    entryFee,
    tournamentName,
    pokerName,
  };
}

export async function executeRegisterForTournamentAtomic(params: {
  userId: string;
  tournamentId: string;
  clientNonce: string;
}): Promise<RegisterForTournamentSuccessData> {
  const { userId, tournamentId, clientNonce } = params;
  const db = getFirestore();

  const userSnap = await db.collection('users').doc(userId).get();
  if (userSnap.exists) {
    assertUserNotMigrated(userSnap.data()!);
  }

  let storeConfig;
  try {
    storeConfig = await configLoader.getStoreConfig(db);
  } catch (_error) {
    throwTournamentHttpsError(
      'internal',
      'TOURNAMENT_INTERNAL_ERROR',
      'Store config unavailable',
    );
  }
  const liffEnabledFromConfig = storeConfig.tournament?.liffRegistrationEnabled === true;
  const liffEnabled =
    typeof registerForTournamentAtomicTestHooks.liffRegistrationEnabledOverride === 'boolean'
      ? registerForTournamentAtomicTestHooks.liffRegistrationEnabledOverride
      : liffEnabledFromConfig;
  if (!liffEnabled) {
    throwTournamentHttpsError(
      'failed-precondition',
      'TOURNAMENT_LIFF_REGISTRATION_DISABLED',
      'LIFF registration disabled',
    );
  }

  const currentBusinessDateKey = await getCurrentBusinessDateKeyOrThrow();

  const activeStayRef = db.collection('activeStays').doc(userId);
  const activeStayDoc = await activeStayRef.get();
  if (!activeStayDoc.exists) {
    throwTournamentHttpsError(
      'failed-precondition',
      'TOURNAMENT_ACTIVE_BILL_NOT_FOUND',
      'Active stay missing',
    );
  }
  const activeStayData = activeStayDoc.data()!;
  if (activeStayData.isActive !== true) {
    throwTournamentHttpsError(
      'failed-precondition',
      'TOURNAMENT_ACTIVE_BILL_NOT_FOUND',
      'Active stay inactive',
    );
  }
  const billId = typeof activeStayData.billId === 'string' ? activeStayData.billId.trim() : '';
  if (!billId) {
    throwTournamentHttpsError(
      'failed-precondition',
      'TOURNAMENT_ACTIVE_BILL_NOT_FOUND',
      'billId missing on active stay',
    );
  }
  const pokerName =
    (typeof activeStayData.pokerName === 'string' && activeStayData.pokerName.trim()) ||
    `Player_${userId}`;

  const billRef = db.collection('bills').doc(billId);
  const registrationRequestRef = billRef
    .collection('tournamentRegistrationRequests')
    .doc(clientNonce);
  const tournamentRef = db.collection('scheduledTournaments').doc(tournamentId);
  const viewsMainRef = tournamentRef.collection('views').doc('main');
  const waitingRef = tournamentRef.collection('tablesSeat').doc('waiting');
  const usersListRef = tournamentRef.collection('views').doc('usersList');
  const idempotencyKey = buildRegisterIdempotencyKey(billId, clientNonce);
  const idempotencyRef = billRef.collection('idempotency').doc(idempotencyKey);

  const dualWriteEnabled =
    typeof registerForTournamentAtomicTestHooks.dualWriteEnabledOverride === 'boolean'
      ? registerForTournamentAtomicTestHooks.dualWriteEnabledOverride
      : await dualWrite.shouldDualWrite();
  const nowForDeadline =
    registerForTournamentAtomicTestHooks.nowOverride instanceof Date
      ? registerForTournamentAtomicTestHooks.nowOverride
      : new Date();

  type TxOut =
    | { kind: 'reused'; requestData: FirebaseFirestore.DocumentData }
    | {
        kind: 'created';
        successData: RegisterForTournamentSuccessData;
        dualWritePayload: {
          templateId: string;
          templateName: string;
          entryFee: number;
          startAtIso: string | null;
        };
      };

  const txResult: TxOut = await db.runTransaction(async (tx) => {
    const requestSnap = await tx.get(registrationRequestRef);
    if (requestSnap.exists) {
      const prev = requestSnap.data() || {};
      const prevUserId = prev.userId as string | undefined;
      if (prevUserId && prevUserId !== userId) {
        throwTournamentHttpsError(
          'failed-precondition',
          'TOURNAMENT_NONCE_CONFLICT',
          'clientNonce owned by another user',
        );
      }
      const prevTournamentId = prev.tournamentId as string | undefined;
      if (prevTournamentId && prevTournamentId !== tournamentId) {
        throwTournamentHttpsError(
          'failed-precondition',
          'TOURNAMENT_NONCE_CONFLICT',
          'clientNonce used for another tournament',
        );
      }
      const prevBillId = prev.billId as string | undefined;
      if (prevBillId && prevBillId !== billId) {
        throwTournamentHttpsError(
          'failed-precondition',
          'TOURNAMENT_NONCE_CONFLICT',
          'clientNonce used for another bill',
        );
      }
      const expectedFp = buildRegisterForTournamentFingerprint({
        tournamentId,
        uid: userId,
        billId,
        businessDate: currentBusinessDateKey,
      });
      const prevFp = prev.requestFingerprint as string | undefined;
      if (prevFp && prevFp !== expectedFp) {
        throwTournamentHttpsError(
          'failed-precondition',
          'TOURNAMENT_NONCE_CONFLICT',
          'clientNonce fingerprint mismatch',
        );
      }
      if (prev.status !== 'succeeded') {
        throwTournamentHttpsError(
          'internal',
          'TOURNAMENT_INTERNAL_ERROR',
          'registration request incomplete',
        );
      }
      return { kind: 'reused' as const, requestData: prev };
    }

    const tournamentSnap = await tx.get(tournamentRef);
    if (!tournamentSnap.exists) {
      throwTournamentHttpsError(
        'not-found',
        'TOURNAMENT_INVALID_STATE',
        'Tournament not found',
      );
    }
    const tournamentData = tournamentSnap.data()!;
    const tournamentStatus = tournamentData.status as string | undefined;
    assertRegistrationAllowedStatus(tournamentStatus);

    if (isRegEndAtPast(tournamentData.regEndAt, nowForDeadline)) {
      throwTournamentHttpsError(
        'failed-precondition',
        'TOURNAMENT_REGISTRATION_CLOSED',
        'Registration deadline passed',
      );
    }

    const tournamentBusinessDate =
      typeof tournamentData.businessDate === 'string' ? tournamentData.businessDate.trim() : '';
    if (tournamentBusinessDate !== currentBusinessDateKey) {
      throwTournamentHttpsError(
        'failed-precondition',
        'TOURNAMENT_NOT_TODAY',
        'Tournament is not today',
      );
    }

    const templateId =
      typeof tournamentData.templateId === 'string' ? tournamentData.templateId.trim() : '';
    if (!templateId) {
      throwTournamentHttpsError(
        'failed-precondition',
        'TOURNAMENT_INVALID_STATE',
        'templateId missing',
      );
    }

    const snapshot = tournamentData.snapshot as Record<string, unknown> | undefined;
    if (!snapshot || typeof snapshot !== 'object') {
      throwTournamentHttpsError(
        'failed-precondition',
        'TOURNAMENT_INVALID_STATE',
        'snapshot missing',
      );
    }

    const entryFee = parseEntryFee(
      snapshot.entryFee === undefined || snapshot.entryFee === null ? 0 : snapshot.entryFee,
    );
    const tournamentName =
      typeof snapshot.name === 'string' && snapshot.name.trim()
        ? snapshot.name.trim()
        : 'トーナメント';
    const startAt = tournamentData.startAt as admin.firestore.Timestamp | undefined;

    const billSnap = await tx.get(billRef);
    if (!billSnap.exists) {
      throwTournamentHttpsError(
        'not-found',
        'TOURNAMENT_ACTIVE_BILL_NOT_FOUND',
        'Bill not found',
      );
    }
    const billData = billSnap.data()!;
    const billStatus = billData.status as string;
    if (billStatus !== 'open' && billStatus !== 'in_progress') {
      throwTournamentHttpsError(
        'failed-precondition',
        'TOURNAMENT_BILL_NOT_OPEN',
        'Bill is not open',
      );
    }
    const partyUserId =
      typeof billData.party?.userId === 'string' ? (billData.party.userId as string) : '';
    if (partyUserId !== userId) {
      throwTournamentHttpsError(
        'permission-denied',
        'TOURNAMENT_ACTIVE_BILL_NOT_FOUND',
        'Bill party mismatch',
      );
    }

    const billTournamentRef = billRef.collection('tournaments').doc(templateId);
    const billTournamentSnap = await tx.get(billTournamentRef);
    if (billTournamentSnap.exists) {
      throwTournamentHttpsError(
        'failed-precondition',
        'TOURNAMENT_ALREADY_REGISTERED',
        'Already registered on bill',
      );
    }

    const viewsMainSnap = await tx.get(viewsMainRef);
    if (!viewsMainSnap.exists) {
      throwTournamentHttpsError(
        'failed-precondition',
        'TOURNAMENT_INVALID_STATE',
        'views/main missing',
      );
    }
    const viewsMainData = viewsMainSnap.data()!;
    const currentPlayersIn =
      typeof viewsMainData.playersIn === 'number' ? viewsMainData.playersIn : 0;
    const currentEntries = typeof viewsMainData.entries === 'number' ? viewsMainData.entries : 0;
    const currentWaitingCount =
      typeof viewsMainData.waitingCount === 'number' ? viewsMainData.waitingCount : 0;

    const waitingSnap = await tx.get(waitingRef);
    const waitingExists = waitingSnap.exists;
    const waitingData = waitingExists ? waitingSnap.data()! : null;
    const currentWaiting = (waitingData?.waiting || {}) as Record<string, unknown>;
    if (Object.prototype.hasOwnProperty.call(currentWaiting, userId)) {
      throwTournamentHttpsError(
        'failed-precondition',
        'TOURNAMENT_ALREADY_REGISTERED',
        'Already in waiting',
      );
    }
    const currentWaitingCountKeys = Object.keys(currentWaiting).length;

    const usersListSnap = await tx.get(usersListRef);
    const usersListExists = usersListSnap.exists;
    const usersListData = usersListExists ? usersListSnap.data()! : null;
    const currentUsers = (usersListData?.users || {}) as Record<string, unknown>;
    if (Object.prototype.hasOwnProperty.call(currentUsers, userId)) {
      throwTournamentHttpsError(
        'failed-precondition',
        'TOURNAMENT_ALREADY_REGISTERED',
        'Already in usersList',
      );
    }

    const okibakeConflict = await findOkibakeLinkedUserConflictInTx({
      tx,
      tournamentRef,
      userId,
    });
    if (okibakeConflict.conflict) {
      throwTournamentHttpsError(
        'failed-precondition',
        'TOURNAMENT_PARTICIPANT_CONFLICT_WITH_OKIBAKE',
        'Participant conflict',
      );
    }

    const idemSnap = await tx.get(idempotencyRef);
    if (idemSnap.exists) {
      throwTournamentHttpsError(
        'failed-precondition',
        'TOURNAMENT_NONCE_CONFLICT',
        'idempotency key exists without registration request',
      );
    }

    const requestFingerprint = buildRegisterForTournamentFingerprint({
      tournamentId,
      uid: userId,
      billId,
      businessDate: currentBusinessDateKey,
    });
    const registeredAtIso = nowForDeadline.toISOString();

    // ---- writes ----
    tx.update(
      viewsMainRef,
      appendAvgStackToMainViewUpdate(
        {
          playersIn: currentPlayersIn + 1,
          entries: currentEntries + 1,
          waitingCount: currentWaitingCount + 1,
          updatedAt: FieldValue.serverTimestamp(),
        },
        viewsMainData,
        snapshot,
      ),
    );

    if (!waitingExists) {
      tx.set(waitingRef, {
        count: 1,
        waiting: {
          [userId]: {
            pokerName,
            joinedAt: FieldValue.serverTimestamp(),
            order: 1,
          },
        },
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    } else {
      const maxOrder = Object.values(currentWaiting)
        .filter((val) => typeof val === 'object' && val !== null)
        .map((val) => (val as { order?: number }).order || 0)
        .reduce((max, order) => Math.max(max, order), 0);
      tx.update(waitingRef, {
        count: currentWaitingCountKeys + 1,
        waiting: {
          ...currentWaiting,
          [userId]: {
            pokerName,
            joinedAt: FieldValue.serverTimestamp(),
            order: maxOrder + 1,
          },
        },
        updatedAt: FieldValue.serverTimestamp(),
      });
    }

    if (usersListExists) {
      tx.update(usersListRef, {
        users: {
          ...currentUsers,
          [userId]: {
            pokerName,
            registeredAt: FieldValue.serverTimestamp(),
            lastUpdatedAt: FieldValue.serverTimestamp(),
          },
        },
        updatedAt: FieldValue.serverTimestamp(),
      });
    } else {
      tx.set(usersListRef, {
        users: {
          [userId]: {
            pokerName,
            registeredAt: FieldValue.serverTimestamp(),
            lastUpdatedAt: FieldValue.serverTimestamp(),
          },
        },
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }

    tx.set(
      billTournamentRef,
      {
        templateId,
        templateName: tournamentName,
        entryFeeIncl: entryFee,
        reentryFeeIncl: null,
        addonFeeIncl: null,
        entryCount: 1,
        reentryCount: 0,
        addonCount: 0,
        registeredAt: FieldValue.serverTimestamp(),
        startAt: startAt || null,
        lastReentryAt: null,
        lastAddonAt: null,
        pointsAwarded: null,
      },
      { merge: true },
    );

    tx.update(billRef, {
      updatedAt: FieldValue.serverTimestamp(),
    });

    tx.set(idempotencyRef, {
      requestHash: requestFingerprint,
      createdAt: FieldValue.serverTimestamp(),
      templateId,
      operation: 'register_for_tournament',
      clientNonce,
    });

    const successData: RegisterForTournamentSuccessData = {
      tournamentId,
      templateId,
      clientNonce,
      reused: false,
      registrationStatus: 'waiting',
      waiting: true,
      registeredAt: registeredAtIso,
      billId,
      entryFee,
      tournamentName,
      pokerName,
    };

    tx.set(registrationRequestRef, {
      status: 'succeeded',
      userId,
      billId,
      tournamentId,
      templateId,
      businessDate: currentBusinessDateKey,
      clientNonce,
      requestFingerprint,
      entryFee,
      registrationStatus: 'waiting',
      waiting: true,
      tournamentName,
      pokerName,
      registeredAt: registeredAtIso,
      response: { ...successData },
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    return {
      kind: 'created' as const,
      successData,
      dualWritePayload: {
        templateId,
        templateName: tournamentName,
        entryFee,
        startAtIso: startAt && typeof startAt.toDate === 'function' ? startAt.toDate().toISOString() : null,
      },
    };
  });

  if (txResult.kind === 'reused') {
    return rebuildSuccessFromRequestDoc({
      clientNonce,
      requestData: txResult.requestData,
    });
  }

  // post-commit: dualWrite best-effort（正本は bills。失敗しても success / nonce 再送で復元可）
  if (dualWriteEnabled) {
    try {
      if (registerForTournamentAtomicTestHooks.failPostCommitDualWrite) {
        throw new Error('test forced dualWrite failure');
      }
      await dualWrite.legacyRecordTournamentActionUpdate(db, {
        billId,
        templateId: txResult.dualWritePayload.templateId,
        templateName: txResult.dualWritePayload.templateName,
        entryFee: txResult.dualWritePayload.entryFee,
        reentryFee: null,
        addonFee: null,
        entryCount: 1,
        reentryCount: 0,
        addonCount: 0,
        registeredAt: txResult.successData.registeredAt,
        lastReentryAt: null,
        lastAddonAt: null,
        startAt: txResult.dualWritePayload.startAtIso,
      });
    } catch (error) {
      logger.warn('dualWrite registerForTournament failed', {
        op: 'registerForTournament',
        billId,
        templateId: txResult.dualWritePayload.templateId,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return txResult.successData;
}
