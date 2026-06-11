import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { z } from 'zod';
import { getCallerDeviceByUid, hasRequiredOption, isActive } from '../../../shared/devices';
import { recordTournamentAction } from '../../bills/repos/recordTournamentAction';
import { writeSingleOperationLog, toErrorSummary } from '../../logs/lib/operationLog';
import * as crypto from 'crypto';
import { logOpsError, logOpsSuccess } from "../../../shared/logging/logOpsError";
import { FunctionCustomError } from '../../../shared/logging/functionCustomError';
import { resolveAddonLimitPerPlayer } from '../../../shared/tournament/resolveAddonLimitPerPlayer';
import { assertTournamentAllowsMutation } from '../lib/assertTournamentAllowsMutation';

const bulkAddonSchema = z.object({
  tournamentId: z.string(),
  /** 操作履歴・取り消し用。未指定時はサーバーで生成 */
  operationId: z.string().optional(),
  /** 卓単位絞り込み用。指定時は operationLog の tableId に保存 */
  tableId: z.string().optional(),
  /** 互換用: 旧payload。normalUsers 未指定時に採用 */
  users: z.array(z.object({
    userId: z.string(),
    pokerName: z.string(),
  })).optional(),
  /** 通常参加者ターゲット */
  normalUsers: z.array(z.object({
    userId: z.string(),
    pokerName: z.string(),
  })).optional(),
  /** 置きバケターゲット（seated + unlinked のみ対象） */
  okibakeEntries: z.array(z.object({
    okibakeEntryId: z.string(),
    pokerName: z.string().optional(),
  })).optional(),
});

type BulkAddonNormalTarget = { userId: string; pokerName: string; billId: string };
type BulkAddonOkibakeTarget = {
  okibakeEntryId: string;
  pokerName: string;
  before: Record<string, unknown>;
  addonRecordId: string;
  okibakeAddonCountBefore: number;
  okibakeAddonCountAfter: number;
};

function slimOkibakeEntry(data: Record<string, unknown> | undefined): Record<string, unknown> | null {
  if (!data) return null;
  return {
    entryStatus: data.entryStatus ?? null,
    billLinkStatus: data.billLinkStatus ?? null,
    okibakeAddonCount: data.okibakeAddonCount ?? 0,
    okibakeAddonRecords: Array.isArray(data.okibakeAddonRecords) ? data.okibakeAddonRecords : [],
    lastOkibakeAddonAt: data.lastOkibakeAddonAt ?? null,
    assignedTableId: data.assignedTableId ?? null,
    assignedSeatKey: data.assignedSeatKey ?? null,
  };
}

export const bulkAddon = onCall(async (request) => {
  // 認証チェック
  if (!request.auth) {
    throw new HttpsError('unauthenticated', '認証が必要です');
  }

  const callerUid = request.auth.uid;
  let device: Awaited<ReturnType<typeof getCallerDeviceByUid>> = null;

  try {
    // デバイス権限の確認（role: admin または options.tournament: true）
    device = await getCallerDeviceByUid(callerUid);
    if (!device || !isActive(device.status)) {
      throw new HttpsError('permission-denied', 'デバイスが見つからないか、アクティブではありません');
    }

    const hasPermission = device.role === 'admin' || hasRequiredOption(device.options, 'tournament');
    if (!hasPermission) {
      throw new HttpsError('permission-denied', 'トーナメント運営の権限がありません');
    }

    console.log('=== まとめてAddon処理開始 ===');
    // 循環参照を避けるため、必要なデータのみをログ出力
    const { data } = request;
    console.log('受信データ:', {
      tournamentId: data === null || data === undefined ? undefined : data.tournamentId,
      userCount: data === null || data === undefined ? undefined : data.users?.length,
    });

    // dataがundefinedまたは無効な場合の処理
    if (!data || typeof data !== 'object') {
      console.log('dataが無効です:', data);
      throw new HttpsError('invalid-argument', '無効なデータが送信されました');
    }

    console.log('処理対象データ:', {
      tournamentId: data.tournamentId,
      userCount: data.users === null || data.users === undefined ? undefined : data.users.length,
    });

    // 入力検証
    const validatedData = bulkAddonSchema.parse(data);
    const {
      tournamentId,
      users: legacyUsers,
      normalUsers: payloadNormalUsers,
      okibakeEntries: payloadOkibakeEntries,
      operationId: clientOperationId,
      tableId,
    } = validatedData;
    const normalUsers = payloadNormalUsers ?? legacyUsers ?? [];
    const okibakeEntries = payloadOkibakeEntries ?? [];
    const operationId = clientOperationId ?? crypto.randomUUID();

    if (normalUsers.length === 0 && okibakeEntries.length === 0) {
      throw new HttpsError('invalid-argument', '処理対象が指定されていません');
    }

    console.log('tournamentId:', tournamentId);
    console.log('対象ユーザー数:', normalUsers.length);
    console.log('対象置きバケ数:', okibakeEntries.length);

    // トーナメント情報を取得
    const tournamentRef = admin.firestore().collection('scheduledTournaments').doc(tournamentId);
    const tournamentDoc = await tournamentRef.get();

    if (!tournamentDoc.exists) {
      throw new FunctionCustomError({
        errorKey: 'TOURNAMENT_INVALID_STATE',
        message: 'トーナメントが存在しません',
        context: { tournamentId, reason: 'tournament_not_found' },
      });
    }

    const tournamentData = tournamentDoc.data();
    assertTournamentAllowsMutation({
      tournamentId,
      status: tournamentData?.status as string | undefined,
    });
    const templateId = tournamentData?.templateId;
    const snapshot = tournamentData?.snapshot || {};
    const addonLimit = resolveAddonLimitPerPlayer({
      isAddon: snapshot.isAddon,
      addonLimitPerPlayer: snapshot.addonLimitPerPlayer,
    });
    const addonFee = snapshot.addonFee !== null && snapshot.addonFee !== undefined ? snapshot.addonFee : 0;
    const addonStack = snapshot.addonStack !== null && snapshot.addonStack !== undefined ? snapshot.addonStack : 0;
    const templateName = snapshot.name || '';
    const startAt = tournamentData?.startAt;

    console.log('addonLimit:', addonLimit);
    console.log('addonFee:', addonFee);
    console.log('addonStack:', addonStack);

    if (addonLimit <= 0) {
      throw new FunctionCustomError({
        errorKey: 'TOURNAMENT_ADDON_NOT_ALLOWED',
        message: 'このトーナメントではAddonができません',
        context: { tournamentId, addonLimit },
      });
    }

    if (!templateId) {
      throw new FunctionCustomError({
        errorKey: 'TOURNAMENT_INVALID_STATE',
        message: 'トーナメントのtemplateIdが存在しません',
        context: { tournamentId, reason: 'templateId_missing' },
      });
    }

    // scheduledTournaments/views/mainを取得
    const viewsMainRef = admin.firestore()
      .collection('scheduledTournaments')
      .doc(tournamentId)
      .collection('views')
      .doc('main');

    const viewsMainDoc = await viewsMainRef.get();

    if (!viewsMainDoc.exists) {
      throw new FunctionCustomError({
        errorKey: 'TOURNAMENT_INVALID_STATE',
        message: 'トーナメントのviews/mainドキュメントが存在しません',
        context: { tournamentId, reason: 'views_main_missing' },
      });
    }

    const viewsMainData = viewsMainDoc.data();
    const currentAddons = viewsMainData?.addons || 0;

    // 通常参加者: activeStays/bills を確認
    const activeStayRefs = normalUsers.map((user) =>
      admin.firestore().collection('activeStays').doc(user.userId)
    );
    const activeStayDocs = await Promise.all(activeStayRefs.map((ref) => ref.get()));
    const missingUsers: string[] = [];
    const alreadyAddonUsers: BulkAddonNormalTarget[] = [];
    const availableUsers: BulkAddonNormalTarget[] = [];

    for (let i = 0; i < normalUsers.length; i++) {
      const user = normalUsers[i];
      const activeStayDoc = activeStayDocs[i];
      if (!activeStayDoc.exists) {
        missingUsers.push(user.pokerName);
        continue;
      }
      const activeStayData = activeStayDoc.data()!;
      const billId = activeStayData.billId as string;
      if (!billId) {
        missingUsers.push(user.pokerName);
        continue;
      }
      const billTournamentRef = admin
        .firestore()
        .collection('bills')
        .doc(billId)
        .collection('tournaments')
        .doc(templateId);
      const existingTournamentDoc = await billTournamentRef.get();
      if (existingTournamentDoc.exists) {
        const tournamentInfo = existingTournamentDoc.data()!;
        const addonCount = typeof tournamentInfo.addonCount === 'number' ? tournamentInfo.addonCount : 0;
        if (addonCount >= addonLimit) {
          alreadyAddonUsers.push({ ...user, billId });
          continue;
        }
      }
      availableUsers.push({ ...user, billId });
    }

    if (missingUsers.length > 0) {
      throw new FunctionCustomError({
        errorKey: 'TOURNAMENT_INVALID_STATE',
        message: `以下のユーザーのactiveStaysドキュメントが見つからないか、billIdが設定されていません: ${missingUsers.join(', ')}`,
        context: { tournamentId, userNames: missingUsers, reason: 'active_stay_or_bill_missing' },
      });
    }

    // 置きバケ: okibakeTemporaryEntries を確認
    const okibakeInvalidEntries: string[] = [];
    const okibakeAtLimitEntries: string[] = [];
    const availableOkibakeEntries: BulkAddonOkibakeTarget[] = [];

    for (const okibake of okibakeEntries) {
      const okibakeEntryId = okibake.okibakeEntryId;
      const entryRef = admin
        .firestore()
        .collection('scheduledTournaments')
        .doc(tournamentId)
        .collection('okibakeTemporaryEntries')
        .doc(okibakeEntryId);
      const entryDoc = await entryRef.get();
      if (!entryDoc.exists) {
        okibakeInvalidEntries.push(okibakeEntryId);
        continue;
      }
      const entryData = (entryDoc.data() ?? {}) as Record<string, unknown>;
      const entryStatus = typeof entryData.entryStatus === 'string' ? entryData.entryStatus : '';
      const billLinkStatus = typeof entryData.billLinkStatus === 'string' ? entryData.billLinkStatus : '';
      const assignedTableId =
        typeof entryData.assignedTableId === 'string' ? entryData.assignedTableId : '';
      const prevCount =
        typeof entryData.okibakeAddonCount === 'number' ? entryData.okibakeAddonCount : 0;

      if (entryStatus !== 'seated' || billLinkStatus !== 'unlinked') {
        okibakeInvalidEntries.push(okibakeEntryId);
        continue;
      }
      if (tableId && assignedTableId && assignedTableId !== tableId) {
        okibakeInvalidEntries.push(okibakeEntryId);
        continue;
      }
      if (prevCount >= addonLimit) {
        okibakeAtLimitEntries.push(okibakeEntryId);
        continue;
      }

      const addonRecordId = crypto.randomUUID();
      const playerName =
        (typeof okibake.pokerName === 'string' && okibake.pokerName.trim().length > 0
          ? okibake.pokerName.trim()
          : (typeof entryData.linkedUserPokerName === 'string'
              ? entryData.linkedUserPokerName
              : typeof entryData.temporaryDisplayName === 'string'
                ? entryData.temporaryDisplayName
                : `置きバケ:${okibakeEntryId}`));
      availableOkibakeEntries.push({
        okibakeEntryId,
        pokerName: playerName,
        before: slimOkibakeEntry(entryData) ?? {},
        addonRecordId,
        okibakeAddonCountBefore: prevCount,
        okibakeAddonCountAfter: prevCount + 1,
      });
    }

    if (okibakeInvalidEntries.length > 0) {
      throw new FunctionCustomError({
        errorKey: 'TOURNAMENT_OKIBAKE_INVALID_STATUS',
        message: '置きバケの状態が無効なため、まとめてAddonを実行できません',
        context: { tournamentId, okibakeEntryIds: okibakeInvalidEntries, reason: 'okibake_invalid_targets' },
      });
    }

    if (availableUsers.length === 0 && availableOkibakeEntries.length === 0) {
      throw new FunctionCustomError({
        errorKey: 'TOURNAMENT_ADDON_ALREADY_DONE',
        message: '全員が Addon 上限に達しています',
        context: {
          tournamentId,
          addonLimit,
          skippedAtLimitCount: alreadyAddonUsers.length,
          okibakeSkippedAtLimitCount: okibakeAtLimitEntries.length,
        },
      });
    }

    // トランザクションで処理を実行
    const result = await admin.firestore().runTransaction(async (transaction) => {
      const now = admin.firestore.FieldValue.serverTimestamp();
      const totalProcessed = availableUsers.length + availableOkibakeEntries.length;
      // scheduledTournaments/views/mainを更新
      transaction.update(viewsMainRef, {
        addons: currentAddons + totalProcessed,
        updatedAt: now,
      });

      // todaysBillsのtournamentsフィールドへの直接更新は削除（recordTournamentAction内のDualWriteに集約）

      // 置きバケへの反映
      for (const target of availableOkibakeEntries) {
        const entryRef = admin
          .firestore()
          .collection('scheduledTournaments')
          .doc(tournamentId)
          .collection('okibakeTemporaryEntries')
          .doc(target.okibakeEntryId);

        const beforeRecords = Array.isArray(target.before.okibakeAddonRecords)
          ? [...(target.before.okibakeAddonRecords as Array<Record<string, unknown>>)]
          : [];
        const newRecord = {
          addonRecordId: target.addonRecordId,
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

        transaction.update(entryRef, {
          okibakeAddonRecords: [...beforeRecords, newRecord],
          okibakeAddonCount: target.okibakeAddonCountAfter,
          lastOkibakeAddonAt: now,
          updatedAt: now,
        });
      }

      return {
        success: true,
        processedCount: totalProcessed,
        processedNormalCount: availableUsers.length,
        processedOkibakeCount: availableOkibakeEntries.length,
        skippedAtLimitCount: alreadyAddonUsers.length + okibakeAtLimitEntries.length,
        skippedNormalAtLimitCount: alreadyAddonUsers.length,
        skippedOkibakeAtLimitCount: okibakeAtLimitEntries.length,
        addonFee,
        addonStack,
        availableUsers: availableUsers.map(u => ({ 
          userId: u.userId, 
          billId: u.billId,
        })),
        availableOkibakeEntries: availableOkibakeEntries.map((o) => ({
          okibakeEntryId: o.okibakeEntryId,
          pokerName: o.pokerName,
          addonRecordId: o.addonRecordId,
          okibakeAddonCountBefore: o.okibakeAddonCountBefore,
          okibakeAddonCountAfter: o.okibakeAddonCountAfter,
          okibakeEntryBefore: o.before,
          okibakeEntryAfter: {
            ...o.before,
            okibakeAddonCount: o.okibakeAddonCountAfter,
          },
        })),
      };
    });

    // トランザクション完了後、各ユーザーに対してrecordTournamentActionを呼び出す（トランザクション外で実行）
    const recordPromises = result.availableUsers.map(async (user) => {
      const clientNonce = crypto.randomUUID();
      const idempotencyKey = `${user.billId}:recordTournamentAction:addon:${clientNonce}`;

      try {
        await recordTournamentAction({
          billId: user.billId,
          templateId,
          action: 'addon',
          templateName: templateName,
          entryFeeIncl: null, // 既存の値を保持（recordTournamentAction内で処理）
          reentryFeeIncl: null, // 既存の値を保持（recordTournamentAction内で処理）
          addonFeeIncl: addonFee,
          startAt: startAt ? (startAt as admin.firestore.Timestamp) : null,
          idempotencyKey,
        });
      } catch (error) {
        logOpsError({
      message: `Failed to record tournament action for user ${user.userId}:`,
      functionEntry: 'bulkAddon',
      operation: 'recordActionPerUserBestEffort',
      cause: error,
    });
        // エラーを再スローせず、メインのcallableは成功とみなす（ベストエフォート）
        // scheduledTournamentsの更新は成功しているため
      }
    });

    await Promise.all(recordPromises);

    // 操作記録（成功）。operationLogs から巻き戻し可能。卓単位の場合は tableId をトップレベルに付与
    const normalDetails = result.availableUsers.map((u) => {
      const u2 = normalUsers.find((us) => us.userId === u.userId);
      return {
        playerUid: u.userId,
        playerName: u2 ? u2.pokerName : `User_${u.userId}`,
        billId: u.billId,
        templateId,
      };
    });
    const okibakeDetails = result.availableOkibakeEntries.map((o: any) => ({
      okibakeEntryId: o.okibakeEntryId,
      playerName: o.pokerName,
      addonRecordId: o.addonRecordId,
      okibakeAddonCountBefore: o.okibakeAddonCountBefore,
      okibakeAddonCountAfter: o.okibakeAddonCountAfter,
      okibakeEntryBefore: o.okibakeEntryBefore,
      okibakeEntryAfter: o.okibakeEntryAfter,
    }));
    const playerUids = normalDetails.map((d) => d.playerUid);
    const playerNames = normalDetails.map((d) => d.playerName);
    const details = result.availableUsers.map((u) => ({
      playerUid: u.userId,
      playerName: normalUsers.find((us) => us.userId === u.userId)?.pokerName ?? `User_${u.userId}`,
      billId: u.billId,
      templateId,
    }));
    await writeSingleOperationLog({
      operationId,
      operationName: '一括アドオン',
      deviceId: device.id,
      deviceName: device.name ?? undefined,
      status: 'succeeded',
      tournamentId,
      ...(tableId != null && tableId !== '' && { tableId }),
      payload: {
        playerUids,
        playerNames,
        ...(tableId != null && tableId !== '' && { tableId }),
        details,
        normalTargets: normalDetails,
        okibakeTargets: okibakeDetails,
        templateId,
        addonLimit,
        processedCount: result.processedCount,
        processedNormalCount: result.processedNormalCount,
        processedOkibakeCount: result.processedOkibakeCount,
        skippedAtLimitCount: result.skippedAtLimitCount,
        skippedNormalAtLimitCount: result.skippedNormalAtLimitCount,
        skippedOkibakeAtLimitCount: result.skippedOkibakeAtLimitCount,
      },
    });

    logOpsSuccess({
      message: 'まとめてAddon処理が完了しました',
      functionEntry: 'bulkAddon',
      context: {
        tournamentId,
        templateId,
        processedCount: result.processedCount,
        processedNormalCount: result.processedNormalCount,
        processedOkibakeCount: result.processedOkibakeCount,
        skippedAtLimitCount: result.skippedAtLimitCount,
        skippedNormalAtLimitCount: result.skippedNormalAtLimitCount,
        skippedOkibakeAtLimitCount: result.skippedOkibakeAtLimitCount,
        addonLimit,
        callerUid,
        deviceId: device.id,
      },
    });

    return {
      success: true,
      message: 'まとめてAddon処理が完了しました',
      processedCount: result.processedCount,
      processedNormalCount: result.processedNormalCount,
      processedOkibakeCount: result.processedOkibakeCount,
      skippedAtLimitCount: result.skippedAtLimitCount,
      skippedNormalAtLimitCount: result.skippedNormalAtLimitCount,
      skippedOkibakeAtLimitCount: result.skippedOkibakeAtLimitCount,
      addonFee: result.addonFee,
      addonStack: result.addonStack,
    };
  } catch (error) {
    logOpsError({
      message: '=== まとめてAddon処理エラー ===',
      functionEntry: 'bulkAddon',
      operation: 'bulkAddonMainCatch',
      cause: error,
    });

    // 操作記録（失敗）
    const rawData = request.data as Record<string, unknown> | undefined;
    const opId = (typeof rawData?.operationId === 'string' ? rawData.operationId : null) ?? crypto.randomUUID();
    if (device != null) {
      try {
        await writeSingleOperationLog({
          operationId: opId,
          operationName: '一括アドオン',
          deviceId: device.id,
          deviceName: device.name ?? undefined,
          status: 'failed',
          errorSummary: toErrorSummary(error),
          tournamentId: typeof rawData?.tournamentId === 'string' ? rawData.tournamentId : undefined,
          ...(typeof rawData?.tableId === 'string' && rawData.tableId !== '' ? { tableId: rawData.tableId } : {}),
          payload: {},
        });
      } catch (logErr) {
        logOpsError({
      message: 'operationLog 書き込み失敗',
      functionEntry: 'bulkAddon',
      operation: 'bulkAddonOperationLogWrite',
      cause: logErr,
    });
      }
    }

    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: '入力検証エラー',
        details: error.errors,
      };
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : '不明なエラー',
    };
  }
});
