import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { z } from 'zod';
import { getCallerDeviceByUid, hasRequiredOption, isActive } from '../../../shared/devices';
import { recordTournamentAction } from '../../bills/repos/recordTournamentAction';
import { writeSingleOperationLog, toErrorSummary } from '../../logs/lib/operationLog';
import * as crypto from 'crypto';
import { logOpsError, logOpsSuccess } from "../../../shared/logging/logOpsError";
import { FunctionCustomError } from '../../../shared/logging/functionCustomError';

const bulkAddonSchema = z.object({
  tournamentId: z.string(),
  /** 操作履歴・取り消し用。未指定時はサーバーで生成 */
  operationId: z.string().optional(),
  /** 卓単位絞り込み用。指定時は operationLog の tableId に保存 */
  tableId: z.string().optional(),
  users: z.array(z.object({
    userId: z.string(),
    pokerName: z.string(),
  })),
});

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
    const { tournamentId, users, operationId: clientOperationId, tableId } = validatedData;
    const operationId = clientOperationId ?? crypto.randomUUID();

    console.log('tournamentId:', tournamentId);
    console.log('対象ユーザー数:', users.length);

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
    const templateId = tournamentData?.templateId;
    const snapshot = tournamentData?.snapshot || {};
    const isAddon = snapshot.isAddon !== null && snapshot.isAddon !== undefined ? snapshot.isAddon : false;
    const addonFee = snapshot.addonFee !== null && snapshot.addonFee !== undefined ? snapshot.addonFee : 0;
    const addonStack = snapshot.addonStack !== null && snapshot.addonStack !== undefined ? snapshot.addonStack : 0;
    const templateName = snapshot.name || '';
    const startAt = tournamentData?.startAt;

    console.log('isAddon:', isAddon);
    console.log('addonFee:', addonFee);
    console.log('addonStack:', addonStack);

    if (!isAddon) {
      throw new FunctionCustomError({
        errorKey: 'TOURNAMENT_ADDON_NOT_ALLOWED',
        message: 'このトーナメントではAddonができません',
        context: { tournamentId },
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

    // 各ユーザーのactiveStaysドキュメントを取得
    const activeStayRefs = users.map(user => admin.firestore().collection('activeStays').doc(user.userId));
    const activeStayDocs = await Promise.all(activeStayRefs.map(ref => ref.get()));

    // 存在しないユーザーと既にAddon済みのユーザーをチェック
    const missingUsers: string[] = [];
    const alreadyAddonUsers: Array<{ userId: string; pokerName: string; billId: string }> = [];
    const availableUsers: Array<{ userId: string; pokerName: string; billId: string }> = [];

    for (let i = 0; i < users.length; i++) {
      const user = users[i];
      const activeStayDoc = activeStayDocs[i];

      if (!activeStayDoc.exists) {
        missingUsers.push(user.pokerName);
      } else {
        const activeStayData = activeStayDoc.data()!;
        const billId = activeStayData.billId as string;

        if (!billId) {
          missingUsers.push(user.pokerName);
        } else {
          // 既にAddon済みかチェック（/bills/{billId}/tournaments/{templateId} を確認）
          const tournamentRef = admin.firestore().collection('bills').doc(billId).collection('tournaments').doc(templateId);
          const existingTournamentDoc = await tournamentRef.get();
          
          if (existingTournamentDoc.exists) {
            const tournamentInfo = existingTournamentDoc.data()!;
            const addonCount = tournamentInfo.addonCount || 0;
            if (addonCount >= 1) {
              alreadyAddonUsers.push({ ...user, billId });
            } else {
              availableUsers.push({ ...user, billId });
            }
          } else {
            availableUsers.push({ ...user, billId });
          }
        }
      }
    }

    if (missingUsers.length > 0) {
      throw new FunctionCustomError({
        errorKey: 'TOURNAMENT_INVALID_STATE',
        message: `以下のユーザーのactiveStaysドキュメントが見つからないか、billIdが設定されていません: ${missingUsers.join(', ')}`,
        context: { tournamentId, userNames: missingUsers, reason: 'active_stay_or_bill_missing' },
      });
    }

    if (availableUsers.length === 0) {
      throw new FunctionCustomError({
        errorKey: 'TOURNAMENT_ADDON_ALREADY_DONE',
        message: '処理可能なユーザーがいません（全員既にAddon済みです）',
        context: { tournamentId },
      });
    }

    // トランザクションで処理を実行
    const result = await admin.firestore().runTransaction(async (transaction) => {
      // scheduledTournaments/views/mainを更新
      transaction.update(viewsMainRef, {
        addons: currentAddons + availableUsers.length,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      // todaysBillsのtournamentsフィールドへの直接更新は削除（recordTournamentAction内のDualWriteに集約）

      return {
        success: true,
        processedCount: availableUsers.length,
        alreadyAddonCount: alreadyAddonUsers.length,
        addonFee,
        addonStack,
        availableUsers: availableUsers.map(u => ({ 
          userId: u.userId, 
          billId: u.billId,
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
    const playerUids = result.availableUsers.map((u) => u.userId);
    const playerNames = result.availableUsers.map((u) => {
      const u2 = users.find((us) => us.userId === u.userId);
      return u2 ? u2.pokerName : `User_${u.userId}`;
    });
    const details = result.availableUsers.map((u) => ({
      playerUid: u.userId,
      playerName: users.find((us) => us.userId === u.userId)?.pokerName ?? `User_${u.userId}`,
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
      },
    });

    logOpsSuccess({
      message: 'まとめてAddon処理が完了しました',
      functionEntry: 'bulkAddon',
      context: {
        tournamentId,
        processedCount: result.processedCount,
        alreadyAddonCount: result.alreadyAddonCount,
        callerUid,
        deviceId: device.id,
      },
    });

    return {
      success: true,
      message: 'まとめてAddon処理が完了しました',
      processedCount: result.processedCount,
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
