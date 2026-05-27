import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { z } from 'zod';
import type { DeviceDoc } from '../../../shared/devices';
import { getCallerDeviceByUid, hasRequiredOption, isActive } from '../../../shared/devices';
import { recordTournamentAction } from '../../bills/repos/recordTournamentAction';
import { writeSingleOperationLog, toErrorSummary } from '../../logs/lib/operationLog';
import * as crypto from 'crypto';
import { logOpsError, logOpsSuccess } from "../../../shared/logging/logOpsError";
import { FunctionCustomError } from '../../../shared/logging/functionCustomError';
import { resolveAddonLimitPerPlayer } from '../../../shared/tournament/resolveAddonLimitPerPlayer';

const addonSchema = z.object({
  operationId: z.string().min(1, 'operationId は必須です'),
  tournamentId: z.string(),
  userId: z.string(),
  pokerName: z.string(),
  deviceName: z.string().optional(),
  /** 卓画面から呼ぶ場合に指定。指定時は operationLog の tableId にそのまま使用する */
  tableId: z.string().optional(),
});

/** seats マップから userId が座っている席番号（1–99）を返す。無ければ null */
function findSeatNumberForUserInSeats(
  seats: Record<string, unknown>,
  userId: string
): number | null {
  for (let i = 1; i <= 99; i++) {
    const key = `seat${i.toString().padStart(2, '0')}UserId`;
    if (seats[key] === userId) return i;
  }
  return null;
}

export const addon = onCall(async (request) => {
  // 認証チェック
  if (!request.auth) {
    throw new HttpsError('unauthenticated', '認証が必要です');
  }

  const callerUid = request.auth.uid;
  let device: DeviceDoc | null = null;

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

    const startedAt = FieldValue.serverTimestamp();
    console.log('=== Addon処理開始 ===');
    // 循環参照を避けるため、必要なデータのみをログ出力
    const { data } = request;
    console.log('受信データ:', {
      tournamentId: data === null || data === undefined ? undefined : data.tournamentId,
      userId: data === null || data === undefined ? undefined : data.userId,
      pokerName: data === null || data === undefined ? undefined : data.pokerName,
    });

    // dataがundefinedまたは無効な場合の処理
    if (!data || typeof data !== 'object') {
      console.log('dataが無効です:', data);
      throw new HttpsError('invalid-argument', '無効なデータが送信されました');
    }

    console.log('処理対象データ:', {
      tournamentId: data.tournamentId,
      userId: data.userId,
      pokerName: data.pokerName,
    });

    // 入力検証
    const validatedData = addonSchema.parse(data);
    const { operationId, tournamentId, userId, pokerName, deviceName, tableId: tableIdFromRequest } = validatedData;

    console.log('tournamentId:', tournamentId);
    console.log('userId:', userId);
    console.log('pokerName:', pokerName);

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

    // activeStaysからbillIdを取得（存在チェックは本callable側の責務）
    const activeStayRef = admin.firestore().collection('activeStays').doc(userId);
    const activeStayDoc = await activeStayRef.get();

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

    // Addon 上限到達チェック（/bills/{billId}/tournaments/{templateId} を確認）
    const billTournamentRef = admin.firestore().collection('bills').doc(billId).collection('tournaments').doc(templateId);
    const existingTournamentDoc = await billTournamentRef.get();

    let addonCountBefore = 0;
    if (existingTournamentDoc.exists) {
      const tournamentInfo = existingTournamentDoc.data()!;
      addonCountBefore = typeof tournamentInfo.addonCount === 'number' ?
        tournamentInfo.addonCount :
        0;
      if (addonCountBefore >= addonLimit) {
        throw new FunctionCustomError({
          errorKey: 'TOURNAMENT_ADDON_ALREADY_DONE',
          message: 'Addon上限に達しています',
          context: {
            billId,
            templateId,
            userId,
            tournamentId,
            addonLimit,
            addonCountBefore,
          },
        });
      }
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

    // トランザクションで処理を実行
    const result = await admin.firestore().runTransaction(async (transaction) => {
      // scheduledTournaments/views/mainを更新
      transaction.update(viewsMainRef, {
        addons: currentAddons + 1,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      // todaysBillsのtournamentsフィールドへの直接更新は削除（recordTournamentAction内のDualWriteに集約）

      return { 
        success: true, 
        userId, 
        pokerName, 
        addonFee, 
        addonStack, 
        billId, 
        templateId, 
        templateName,
        startAt,
      };
    });

    // トランザクション完了後、recordTournamentActionを呼び出す（トランザクション外で実行）
    const clientNonce = crypto.randomUUID();
    const idempotencyKey = `${result.billId}:recordTournamentAction:addon:${clientNonce}`;

    try {
      await recordTournamentAction({
        billId: result.billId,
        templateId: result.templateId,
        action: 'addon',
        templateName: result.templateName,
        entryFeeIncl: null, // 既存の値を保持（recordTournamentAction内で処理）
        reentryFeeIncl: null, // 既存の値を保持（recordTournamentAction内で処理）
        addonFeeIncl: result.addonFee,
        startAt: result.startAt ? (result.startAt as admin.firestore.Timestamp) : null,
        idempotencyKey,
      });
    } catch (error) {
      logOpsError({
      message: 'Failed to record tournament action via recordTournamentAction helper:',
      functionEntry: 'addon',
      operation: 'recordTournamentActionBestEffort',
      cause: error,
    });
      // エラーを再スローせず、メインのcallableは成功とみなす（ベストエフォート）
      // scheduledTournamentsの更新は成功しているため
    }

    // 巻き戻し用: tableId はリクエストで渡されていればそれを使う。なければ tablesSeat から検索
    let tableId: string | null = (tableIdFromRequest != null && tableIdFromRequest !== '') ? tableIdFromRequest : null;
    let seatNumber: number | null = null;
    if (!tableId) {
      let seatLookupReadOk = false;
      try {
        const tablesSeatSnap = await admin.firestore()
          .collection('scheduledTournaments')
          .doc(tournamentId)
          .collection('tablesSeat')
          .get();
        seatLookupReadOk = true;
        for (const doc of tablesSeatSnap.docs) {
          if (doc.id === 'waiting' || doc.id === 'busted') continue;
          const seats = (doc.data().seats || {}) as Record<string, unknown>;
          const foundSeat = findSeatNumberForUserInSeats(seats, userId);
          if (foundSeat !== null) {
            tableId = doc.id;
            seatNumber = foundSeat;
            break;
          }
        }
      } catch (error) {
        logOpsError({
          message:
            'アドオン購入: tablesSeat の取得に失敗しました（operationLog に卓・席を付与できません）',
          functionEntry: 'addon',
          operation: 'addonResolveSeatReadFailed',
          cause: error,
          sourceProductHint: 'firestore',
          context: { tournamentId, userId },
        });
      }
      if (seatLookupReadOk && !tableId) {
        logOpsError({
          message:
            'アドオン購入: tablesSeat に該当プレイヤーの着席が見つかりません（operationLog に卓・席を付与できません）',
          functionEntry: 'addon',
          operation: 'addonResolveSeatNotFound',
          context: { tournamentId, userId },
        });
      }
    } else {
      // クライアントが tableId を渡した場合: 全件走査はせず、当該卓ドキュメントのみで席を解決
      const declaredTableId = tableId;
      if (declaredTableId === 'waiting' || declaredTableId === 'busted') {
        logOpsError({
          message:
            'アドオン購入: リクエストの tableId が waiting/busted のため seats から席を解決できません',
          functionEntry: 'addon',
          operation: 'addonResolveSeatInvalidTableId',
          context: { tournamentId, userId, tableId: declaredTableId },
        });
      } else {
        try {
          const tableSeatDoc = await admin
            .firestore()
            .collection('scheduledTournaments')
            .doc(tournamentId)
            .collection('tablesSeat')
            .doc(declaredTableId)
            .get();
          if (!tableSeatDoc.exists) {
            logOpsError({
              message:
                'アドオン購入: 指定卓の tablesSeat ドキュメントが存在しません（operationLog に席を付与できません）',
              functionEntry: 'addon',
              operation: 'addonResolveSeatSingleTableDocMissing',
              context: { tournamentId, userId, tableId: declaredTableId },
            });
          } else {
            const seats = (tableSeatDoc.data()?.seats || {}) as Record<string, unknown>;
            seatNumber = findSeatNumberForUserInSeats(seats, userId);
            if (seatNumber === null) {
              logOpsError({
                message:
                  'アドオン購入: 指定卓の seats に該当プレイヤーが見つかりません（operationLog に席を付与できません）',
                functionEntry: 'addon',
                operation: 'addonResolveSeatSingleTableSeatMissing',
                context: { tournamentId, userId, tableId: declaredTableId },
              });
            }
          }
        } catch (error) {
          logOpsError({
            message:
              'アドオン購入: 指定卓の tablesSeat 取得に失敗しました（operationLog に席を付与できません）',
            functionEntry: 'addon',
            operation: 'addonResolveSeatSingleTableReadFailed',
            cause: error,
            sourceProductHint: 'firestore',
            context: { tournamentId, userId, tableId: declaredTableId },
          });
        }
      }
    }

    // 操作記録（成功）。operationLogs から巻き戻し可能。卓単位のため tableId をトップレベルに付与
    await writeSingleOperationLog({
      operationId,
      operationName: 'アドオン購入',
      deviceId: device.id,
      deviceName: deviceName ?? device.name ?? undefined,
      status: 'succeeded',
      startedAt,
      tournamentId,
      ...(tableId != null && { tableId }),
      payload: {
        playerUid: userId,
        playerName: pokerName,
        billId: result.billId,
        templateId: result.templateId,
        addonLimit,
        addonCountBefore,
        ...(seatNumber != null && { seatNumber }),
      },
    });

    logOpsSuccess({
      message: 'Addon処理が完了しました',
      functionEntry: 'addon',
      context: {
        tournamentId,
        userId,
        billId: result.billId,
        templateId: result.templateId,
        addonLimit,
        addonCountBefore,
        callerUid,
        deviceId: device.id,
      },
    });

    return {
      success: true,
      message: 'Addon処理が完了しました',
      userId: result.userId,
      pokerName: result.pokerName,
      addonFee: result.addonFee,
      addonStack: result.addonStack,
    };
  } catch (error) {
    logOpsError({
      message: '=== Addon処理エラー ===',
      functionEntry: 'addon',
      operation: 'addonMainCatch',
      cause: error,
    });

    // 操作記録（失敗）。operationId があれば 1 件作成する
    const rawData = request.data as Record<string, unknown> | undefined;
    const opId = typeof rawData?.operationId === 'string' ? rawData.operationId : undefined;
    if (opId && device != null) {
      try {
        await writeSingleOperationLog({
          operationId: opId,
          operationName: 'アドオン購入',
          deviceId: device.id,
          deviceName: typeof rawData?.deviceName === 'string' ? rawData.deviceName : device.name ?? undefined,
          status: 'failed',
          errorSummary: toErrorSummary(error),
          payload: {},
        });
      } catch (logErr) {
        logOpsError({
      message: 'operationLog 書き込み失敗',
      functionEntry: 'addon',
      operation: 'addonOperationLogWrite',
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

    if (error instanceof HttpsError) {
      throw error;
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : '不明なエラー',
    };
  }
});
