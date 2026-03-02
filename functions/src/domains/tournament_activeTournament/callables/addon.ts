import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { z } from 'zod';
import type { DeviceDoc } from '../../../shared/devices';
import { getCallerDeviceByUid, hasRequiredOption, isActive } from '../../../shared/devices';
import { recordTournamentAction } from '../../bills/repos/recordTournamentAction';
import { writeSingleOperationLog, toErrorSummary } from '../../logs/lib/operationLog';
import * as crypto from 'crypto';

const addonSchema = z.object({
  operationId: z.string().min(1, 'operationId は必須です'),
  tournamentId: z.string(),
  userId: z.string(),
  pokerName: z.string(),
  deviceName: z.string().optional(),
  /** 卓画面から呼ぶ場合に指定。指定時は operationLog の tableId にそのまま使用する */
  tableId: z.string().optional(),
});

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
      throw new Error('無効なデータが送信されました');
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
      throw new Error('トーナメントが存在しません');
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
      throw new Error('このトーナメントではAddonができません');
    }

    if (!templateId) {
      throw new Error('トーナメントのtemplateIdが存在しません');
    }

    // activeStaysからbillIdを取得（存在チェックは本callable側の責務）
    const activeStayRef = admin.firestore().collection('activeStays').doc(userId);
    const activeStayDoc = await activeStayRef.get();

    if (!activeStayDoc.exists) {
      throw new Error(`ユーザー ${userId} のactiveStaysドキュメントが存在しません`);
    }

    const activeStayData = activeStayDoc.data()!;
    const billId = activeStayData.billId as string;

    if (!billId) {
      throw new Error(`ユーザー ${userId} のactiveStaysにbillIdが設定されていません`);
    }

    // 既にAddon済みかチェック（/bills/{billId}/tournaments/{templateId} を確認）
    const billTournamentRef = admin.firestore().collection('bills').doc(billId).collection('tournaments').doc(templateId);
    const existingTournamentDoc = await billTournamentRef.get();
    
    if (existingTournamentDoc.exists) {
      const tournamentInfo = existingTournamentDoc.data()!;
      const existingAddonCount = tournamentInfo.addonCount || 0;
      if (existingAddonCount >= 1) {
        console.warn('既にAddon済みと判定', {
          billId,
          templateId,
          userId,
          existingAddonCount,
          tournamentInfoKeys: Object.keys(tournamentInfo),
        });
        throw new Error('既にAddon処理済みです');
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
      throw new Error('トーナメントのviews/mainドキュメントが存在しません');
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
      console.error('Failed to record tournament action via recordTournamentAction helper:', error);
      // エラーを再スローせず、メインのcallableは成功とみなす（ベストエフォート）
      // scheduledTournamentsの更新は成功しているため
    }

    // 巻き戻し用: tableId はリクエストで渡されていればそれを使う。なければ tablesSeat から検索
    let tableId: string | null = (tableIdFromRequest != null && tableIdFromRequest !== '') ? tableIdFromRequest : null;
    let seatNumber: number | null = null;
    if (!tableId) {
      try {
        const tablesSeatSnap = await admin.firestore()
          .collection('scheduledTournaments')
          .doc(tournamentId)
          .collection('tablesSeat')
          .get();
        for (const doc of tablesSeatSnap.docs) {
          if (doc.id === 'waiting' || doc.id === 'busted') continue;
          const seats = doc.data().seats || {};
          for (let i = 1; i <= 99; i++) {
            const key = `seat${i.toString().padStart(2, '0')}UserId`;
            if (seats[key] === userId) {
              tableId = doc.id;
              seatNumber = i;
              break;
            }
          }
          if (tableId) break;
        }
      } catch (_) {
        // 座席未割当のまま payload に null を入れる
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
        ...(seatNumber != null && { seatNumber }),
      },
    });

    console.log('=== Addon処理完了 ===');
    console.log('ユーザー', result.pokerName, 'のAddon処理が完了しました');

    return {
      success: true,
      message: 'Addon処理が完了しました',
      userId: result.userId,
      pokerName: result.pokerName,
      addonFee: result.addonFee,
      addonStack: result.addonStack,
    };
  } catch (error) {
    console.error('=== Addon処理エラー ===');
    console.error(error);

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
        console.error('operationLog 書き込み失敗', logErr);
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
