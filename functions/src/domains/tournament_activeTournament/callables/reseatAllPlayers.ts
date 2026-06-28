import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { z } from 'zod';
import { getCallerDeviceByUid, hasRequiredOption, isActive } from '../../../shared/devices';
import type { DeviceDoc } from '../../../shared/devices';
import { updatePlace } from '../../bills/repos/updatePlace';
import { writeSingleOperationLog, toErrorSummary } from '../../logs/lib/operationLog';
import { logOpsError, logOpsSuccess } from "../../../shared/logging/logOpsError";
import { FunctionCustomError, mapFunctionCustomErrorToHttpsCode } from '../../../shared/logging/functionCustomError';
import { canonicalSeatKeyFromSuffix } from '../lib/parseOkibakeSeatKey';
import {
  buildOkibakeEntryAfterForReseatLog,
  slimOkibakeEntryForReseatLog,
  type OkibakeReseatTarget,
} from '../lib/slimOkibakeEntryForReseatLog';
import { assertTournamentAllowsMutation } from '../lib/assertTournamentAllowsMutation';

const playerAssignmentSchema = z.object({
  userId: z.string().optional(),
  okibakeEntryId: z.string().optional(),
  tableId: z.string(),
  seatNumber: z.number().int().positive(),
}).superRefine((value, ctx) => {
  const hasUserId = typeof value.userId === 'string' && value.userId.length > 0;
  const hasOkibake =
    typeof value.okibakeEntryId === 'string' && value.okibakeEntryId.length > 0;
  if (hasUserId === hasOkibake) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'userId または okibakeEntryId のどちらか一方が必須です',
    });
  }
});

// 入力スキーマ
const reseatAllPlayersSchema = z.object({
  operationId: z.string().min(1, 'operationId は必須です'),
  tournamentId: z.string(),
  playerAssignments: z.array(playerAssignmentSchema),
  reseatTableIds: z.array(z.string().min(1)).optional(),
  deviceName: z.string().optional(),
});

function resolveTableMaxSeats(tableData: Record<string, unknown>): number {
  const maxSeatsRaw = tableData.maxSeats;
  if (typeof maxSeatsRaw === 'number' && maxSeatsRaw > 0) {
    return Math.min(Math.trunc(maxSeatsRaw), 99);
  }
  if (typeof maxSeatsRaw === 'string') {
    const parsed = Number.parseInt(maxSeatsRaw, 10);
    if (!Number.isNaN(parsed) && parsed > 0) {
      return Math.min(parsed, 99);
    }
  }

  const seats = (tableData.seats as Record<string, unknown> | undefined) ?? {};
  const re = /^seat(\d{1,2})(UserId|PokerName|OkibakeEntryId)$/;
  let maxN = 0;
  for (const key of Object.keys(seats)) {
    const match = re.exec(key);
    if (match) {
      const n = Number.parseInt(match[1], 10);
      if (!Number.isNaN(n) && n > maxN) maxN = n;
    }
  }
  return maxN > 0 ? maxN : 6;
}

function assertReseatTableIdsValid(params: {
  reseatTableIds: string[] | undefined;
  playerAssignments: Array<{ tableId: string }>;
  tablesSeatDocs: admin.firestore.QuerySnapshot<admin.firestore.DocumentData>;
  tournamentId: string;
}): void {
  const { reseatTableIds, playerAssignments, tablesSeatDocs, tournamentId } = params;
  if (reseatTableIds === undefined) return;

  if (reseatTableIds.length === 0) {
    throw new FunctionCustomError({
      errorKey: 'TOURNAMENT_INVALID_STATE',
      message: 'リシート先の卓を1つ以上選択してください',
      context: { tournamentId, reason: 'reseat_table_ids_empty' },
    });
  }

  const enabledTableIds = tablesSeatDocs.docs
    .filter((doc) => doc.id !== 'waiting' && doc.data().isEnabled === true)
    .map((doc) => doc.id);
  const enabledSet = new Set(enabledTableIds);
  const reseatSet = new Set(reseatTableIds);

  for (const tableId of reseatTableIds) {
    if (!enabledSet.has(tableId)) {
      throw new FunctionCustomError({
        errorKey: 'TOURNAMENT_INVALID_STATE',
        message: `リシート先に指定できない卓です: ${tableId}`,
        context: { tournamentId, tableId, reason: 'invalid_reseat_table_id' },
      });
    }
  }

  for (const assignment of playerAssignments) {
    if (!reseatSet.has(assignment.tableId)) {
      throw new FunctionCustomError({
        errorKey: 'TOURNAMENT_INVALID_STATE',
        message: `リシート先外の卓に割り当てられています: ${assignment.tableId}`,
        context: {
          tournamentId,
          tableId: assignment.tableId,
          reason: 'assignment_outside_reseat_tables',
        },
      });
    }
  }

  let totalSeats = 0;
  for (const tableId of reseatTableIds) {
    const doc = tablesSeatDocs.docs.find((d) => d.id === tableId);
    if (doc) {
      totalSeats += resolveTableMaxSeats(doc.data() as Record<string, unknown>);
    }
  }

  if (playerAssignments.length > totalSeats) {
    throw new FunctionCustomError({
      errorKey: 'TOURNAMENT_INVALID_STATE',
      message: '選択した卓の席数では、対象者を全員配置できません',
      context: {
        tournamentId,
        reason: 'insufficient_reseat_table_seats',
        selectedSeatCount: totalSeats,
        targetParticipantCount: playerAssignments.length,
      },
    });
  }
}

type OkibakeEntrySnapshot = {
  entryStatus: string;
  billLinkStatus: string;
  temporaryDisplayName: string;
  linkedUserPokerName: string | null;
};

function resolveOkibakeDisplayName(entry: OkibakeEntrySnapshot): string {
  if (
    typeof entry.linkedUserPokerName === 'string' &&
    entry.linkedUserPokerName.trim().length > 0
  ) {
    return entry.linkedUserPokerName.trim();
  }
  if (
    typeof entry.temporaryDisplayName === 'string' &&
    entry.temporaryDisplayName.trim().length > 0
  ) {
    return entry.temporaryDisplayName.trim();
  }
  return '';
}

function assertOkibakeReseatCandidate(entry: OkibakeEntrySnapshot, okibakeEntryId: string): void {
  const validEntry = new Set(['registered', 'seated']);
  const validBill = new Set(['unlinked', 'linked']);
  if (
    !validEntry.has(entry.entryStatus) ||
    !validBill.has(entry.billLinkStatus)
  ) {
    throw new FunctionCustomError({
      errorKey: 'TOURNAMENT_OKIBAKE_INVALID_STATUS',
      message: `置きバケ一時参加者 ${okibakeEntryId} の状態がリシート対象外です`,
      context: {
        okibakeEntryId,
        entryStatus: entry.entryStatus,
        billLinkStatus: entry.billLinkStatus,
      },
    });
  }
}

export const reseatAllPlayers = onCall(async (request) => {
  // 認証チェック
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

    const startedAt = FieldValue.serverTimestamp();
    const { data } = request;
    const { operationId, tournamentId, playerAssignments, reseatTableIds, deviceName } = reseatAllPlayersSchema.parse(data);

    console.log(`=== 全員リシート開始 ===`);
    console.log(`tournamentId: ${tournamentId}`);
    console.log(`playerAssignments:`, playerAssignments);

    const db = admin.firestore();
    const tournamentDoc = await db.collection('scheduledTournaments').doc(tournamentId).get();
    if (!tournamentDoc.exists) {
      throw new FunctionCustomError({
        errorKey: 'TOURNAMENT_INVALID_STATE',
        message: 'トーナメントが存在しません',
        context: { tournamentId, reason: 'tournament_not_found' },
      });
    }
    assertTournamentAllowsMutation({
      tournamentId,
      status: tournamentDoc.data()?.status as string | undefined,
    });
    const normalAssignments = playerAssignments.filter((a) => a.userId);
    const okibakeAssignments = playerAssignments.filter((a) => a.okibakeEntryId);

    // トランザクション開始
    const result = await db.runTransaction(async (transaction) => {
      const tablesSeatRef = db
        .collection('scheduledTournaments')
        .doc(tournamentId)
        .collection('tablesSeat');

      const tablesSeatDocs = await transaction.get(tablesSeatRef);

      assertReseatTableIdsValid({
        reseatTableIds,
        playerAssignments,
        tablesSeatDocs,
        tournamentId,
      });

      // 1. 巻き戻し用: 変更前の座席配置を保存（undoReseatAllPlayers で復元する形式）
      const previousSeatingData: Record<string, { waiting?: Record<string, unknown>; count?: number; seats?: Record<string, unknown> }> = {};
      for (const doc of tablesSeatDocs.docs) {
        const d = doc.data();
        if (doc.id === 'waiting') {
          previousSeatingData.waiting = {
            waiting: d.waiting ?? {},
            count: d.count ?? Object.keys((d.waiting as Record<string, unknown>) ?? {}).length,
          };
        } else {
          previousSeatingData[doc.id] = { seats: d.seats ?? {} };
        }
      }

      // 2. activeStaysからユーザー情報を事前に取得（通常参加者のみ）
      const userPokerNames: { [userId: string]: string } = {};
      const userBillIds: { [userId: string]: string } = {};

      for (const assignment of normalAssignments) {
        const { userId } = assignment;
        if (!userId) continue;

        const activeStayRef = db.collection('activeStays').doc(userId);
        const activeStayDoc = await transaction.get(activeStayRef);

        if (!activeStayDoc.exists) {
          throw new FunctionCustomError({
            errorKey: 'TOURNAMENT_INVALID_STATE',
            message: `ユーザー ${userId} のactiveStaysドキュメントが存在しません`,
            context: { tournamentId, userId, reason: 'active_stay_missing' },
          });
        }

        const activeStayData = activeStayDoc.data()!;
        const billId = activeStayData.billId as string;

        if (!billId) {
          throw new FunctionCustomError({
            errorKey: 'TOURNAMENT_INVALID_STATE',
            message: `ユーザー ${userId} のactiveStaysにbillIdが設定されていません`,
            context: { tournamentId, userId, reason: 'billId_missing_on_active_stay' },
          });
        }

        const pokerName = activeStayData.pokerName || `Player_${userId}`;

        userPokerNames[userId] = pokerName;
        userBillIds[userId] = billId;
      }

      // 3. 置きバケ entry を事前に読み取り
      const okibakeEntriesMap = new Map<string, OkibakeEntrySnapshot>();
      const okibakeEntryRefs = new Map<string, admin.firestore.DocumentReference>();
      const okibakeEntryRawBefore = new Map<string, Record<string, unknown>>();
      for (const assignment of okibakeAssignments) {
        const okibakeEntryId = assignment.okibakeEntryId!;
        if (okibakeEntriesMap.has(okibakeEntryId)) continue;

        const entryRef = db
          .collection('scheduledTournaments')
          .doc(tournamentId)
          .collection('okibakeTemporaryEntries')
          .doc(okibakeEntryId);
        const entryDoc = await transaction.get(entryRef);

        if (!entryDoc.exists) {
          throw new FunctionCustomError({
            errorKey: 'TOURNAMENT_OKIBAKE_INVALID_STATUS',
            message: `置きバケ一時参加者 ${okibakeEntryId} が存在しません`,
            context: { tournamentId, okibakeEntryId },
          });
        }

        const entryData = entryDoc.data()!;
        okibakeEntryRawBefore.set(okibakeEntryId, entryData);
        const snapshot: OkibakeEntrySnapshot = {
          entryStatus: typeof entryData.entryStatus === 'string' ? entryData.entryStatus : '',
          billLinkStatus: typeof entryData.billLinkStatus === 'string' ? entryData.billLinkStatus : '',
          temporaryDisplayName:
            typeof entryData.temporaryDisplayName === 'string'
              ? entryData.temporaryDisplayName
              : okibakeEntryId,
          linkedUserPokerName:
            typeof entryData.linkedUserPokerName === 'string'
              ? entryData.linkedUserPokerName
              : null,
        };
        assertOkibakeReseatCandidate(snapshot, okibakeEntryId);

        okibakeEntriesMap.set(okibakeEntryId, snapshot);
        okibakeEntryRefs.set(okibakeEntryId, entryRef);
      }

      // 4. 新しい割り当てに必要なテーブルシートを事前に読み取り
      const tableSeatDocsMap = new Map();
      for (const assignment of playerAssignments) {
        const { tableId } = assignment;
        if (!tableSeatDocsMap.has(tableId)) {
          const tableSeatRef = tablesSeatRef.doc(tableId);
          const tableSeatDoc = await transaction.get(tableSeatRef);
          tableSeatDocsMap.set(tableId, tableSeatDoc);
        }
      }

      // 5. waiting / views/main を事前に読み取り
      const waitingRef = tablesSeatRef.doc('waiting');
      const waitingDoc = await transaction.get(waitingRef);
      const viewsMainRef = db
        .collection('scheduledTournaments')
        .doc(tournamentId)
        .collection('views')
        .doc('main');
      const viewsMainDoc = await transaction.get(viewsMainRef);

      const tableUpdates = new Map<string, Record<string, string | null>>();

      // すべてのテーブルをクリア
      for (const doc of tablesSeatDocs.docs) {
        if (doc.id !== 'waiting' && doc.data().isEnabled) {
          const seats = doc.data().seats;
          const clearedSeats: { [key: string]: string | null } = {};

          Object.keys(seats).forEach(seatKey => {
            if (
              seatKey.endsWith('UserId') ||
              seatKey.endsWith('PokerName') ||
              seatKey.endsWith('OkibakeEntryId')
            ) {
              clearedSeats[seatKey] = null;
            }
          });

          tableUpdates.set(doc.id, clearedSeats);
        }
      }

      const nowTs = admin.firestore.FieldValue.serverTimestamp();
      let registeredOkibakeReseated = 0;
      const okibakeReseatTargets: OkibakeReseatTarget[] = [];

      // 通常参加者の割り当て
      for (const assignment of normalAssignments) {
        const { userId, tableId, seatNumber } = assignment;
        if (!userId) continue;

        const tableSeatDoc = tableSeatDocsMap.get(tableId);

        if (tableSeatDoc && tableSeatDoc.exists) {
          const seatNumberStr = seatNumber.toString().padStart(2, '0');
          const pokerName = userPokerNames[userId];

          const updatedSeats = tableUpdates.get(tableId) || {};

          updatedSeats[`seat${seatNumberStr}UserId`] = userId;
          updatedSeats[`seat${seatNumberStr}PokerName`] = pokerName;
          updatedSeats[`seat${seatNumberStr}OkibakeEntryId`] = null;

          tableUpdates.set(tableId, updatedSeats);
        }
      }

      // 置きバケ参加者の割り当て
      for (const assignment of okibakeAssignments) {
        const { okibakeEntryId, tableId, seatNumber } = assignment;
        if (!okibakeEntryId) continue;

        const tableSeatDoc = tableSeatDocsMap.get(tableId);
        if (!tableSeatDoc || !tableSeatDoc.exists) continue;

        const entry = okibakeEntriesMap.get(okibakeEntryId)!;
        if (entry.entryStatus === 'registered') {
          registeredOkibakeReseated += 1;
        }

        const seatNumberStr = seatNumber.toString().padStart(2, '0');
        const seatKey = canonicalSeatKeyFromSuffix(seatNumberStr);
        const displayName = resolveOkibakeDisplayName(entry);
        const updatedSeats = tableUpdates.get(tableId) || {};

        updatedSeats[`seat${seatNumberStr}UserId`] = null;
        updatedSeats[`seat${seatNumberStr}PokerName`] = displayName;
        updatedSeats[`seat${seatNumberStr}OkibakeEntryId`] = okibakeEntryId;

        tableUpdates.set(tableId, updatedSeats);

        const entryRef = okibakeEntryRefs.get(okibakeEntryId)!;
        transaction.update(entryRef, {
          entryStatus: 'seated',
          assignedTableId: tableId,
          assignedSeatKey: seatKey,
          seatedAt: nowTs,
          updatedAt: nowTs,
          updatedByDeviceId: device!.id,
        });

        const okibakeEntryBefore = slimOkibakeEntryForReseatLog(
          okibakeEntryRawBefore.get(okibakeEntryId),
        );
        if (okibakeEntryBefore != null) {
          okibakeReseatTargets.push({
            okibakeEntryId,
            okibakeEntryBefore,
            okibakeEntryAfter: buildOkibakeEntryAfterForReseatLog({
              tableId,
              seatNumber,
              seatKey,
            }),
          });
        }
      }

      for (const [tableId, updatedSeats] of tableUpdates.entries()) {
        const tableSeatRef = tablesSeatRef.doc(tableId);
        transaction.update(tableSeatRef, {
          seats: updatedSeats,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }

      if (waitingDoc.exists) {
        const waitingData = waitingDoc.data()!;
        const currentWaiting = waitingData.waiting || {};

        const assignedUserIds = new Set(
          normalAssignments.map((assignment) => assignment.userId).filter(Boolean),
        );
        const updatedWaiting = { ...currentWaiting };

        for (const userId of assignedUserIds) {
          if (Object.prototype.hasOwnProperty.call(updatedWaiting, userId!)) {
            delete updatedWaiting[userId!];
          }
        }

        transaction.update(waitingRef, {
          waiting: updatedWaiting,
          count: Object.keys(updatedWaiting).length,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }

      if (registeredOkibakeReseated > 0 && viewsMainDoc.exists) {
        const viewsData = viewsMainDoc.data() ?? {};
        const waitingCountRaw =
          typeof viewsData.waitingCount === 'number' ? viewsData.waitingCount : 0;
        transaction.update(viewsMainRef, {
          waitingCount: Math.max(0, waitingCountRaw - registeredOkibakeReseated),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }

      return {
        success: true,
        playerCount: playerAssignments.length,
        previousSeatingData,
        okibakeReseatTargets,
        playerAssignments: normalAssignments.map((a) => ({
          userId: a.userId!,
          tableId: a.tableId,
          seatNumber: a.seatNumber,
          billId: userBillIds[a.userId!],
        })),
      };
    });

    if (result.playerAssignments) {
      for (const assignment of result.playerAssignments) {
        if (assignment.billId) {
          try {
            await updatePlace({
              billId: assignment.billId,
              table: assignment.tableId,
              seat: assignment.seatNumber,
            });
          } catch (error) {
            logOpsError({
              message: `updatePlace failed for userId ${assignment.userId}`,
              functionEntry: 'reseatAllPlayers',
              operation: 'updatePlacePerAssignmentBestEffort',
              cause: error,
            });
          }
        }
      }
    }

    await writeSingleOperationLog({
      operationId,
      operationName: '全員着席替え',
      deviceId: device.id,
      deviceName: deviceName ?? device.name ?? undefined,
      status: 'succeeded',
      startedAt,
      tournamentId,
      payload: {
        tournamentId,
        previousSeatingData: result.previousSeatingData,
        ...(result.okibakeReseatTargets.length > 0
          ? { okibakeReseatTargets: result.okibakeReseatTargets }
          : {}),
      },
    });

    logOpsSuccess({
      message: '全員着席替えが完了しました',
      functionEntry: 'reseatAllPlayers',
      context: {
        tournamentId,
        playerCount: result.playerCount,
        callerUid,
        deviceId: device.id,
      },
    });

    return { success: true, playerCount: result.playerCount };

  } catch (error) {
    if (error instanceof HttpsError) {
      throw error;
    }

    if (error instanceof z.ZodError) {
      throw new HttpsError('invalid-argument', error.errors.map((e) => e.message).join(', '));
    }

    if (error instanceof FunctionCustomError) {
      logOpsError({
        message: '=== 全員リシートエラー ===',
        functionEntry: 'reseatAllPlayers',
        operation: 'reseatAllPlayersCatch',
        cause: error,
      });
      throw new HttpsError(mapFunctionCustomErrorToHttpsCode(error.errorKey), error.message);
    }

    logOpsError({
      message: '=== 全員リシートエラー ===',
      functionEntry: 'reseatAllPlayers',
      operation: 'reseatAllPlayersGenericCatch',
      cause: error,
    });

    const rawData = request.data as Record<string, unknown> | undefined;
    const opId = typeof rawData?.operationId === 'string' ? rawData.operationId : undefined;
    if (opId && device != null) {
      try {
        await writeSingleOperationLog({
          operationId: opId,
          operationName: '全員着席替え',
          deviceId: device.id,
          deviceName: typeof rawData?.deviceName === 'string' ? rawData.deviceName : device.name ?? undefined,
          status: 'failed',
          errorSummary: toErrorSummary(error),
          payload: {},
        });
      } catch (logErr) {
        logOpsError({
          message: 'operationLog 書き込み失敗',
          functionEntry: 'reseatAllPlayers',
          operation: 'reseatAllPlayersOperationLogWrite',
          cause: logErr,
        });
      }
    }

    throw new HttpsError('internal', error instanceof Error ? error.message : '全員リシートに失敗しました');
  }
});
