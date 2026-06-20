import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { z } from 'zod';
import { getCallerDeviceByUid, hasRequiredOption, isActive } from '../../../shared/devices';
import type { DeviceDoc } from '../../../shared/devices';
import { recordTournamentAction } from '../../bills/repos/recordTournamentAction';
import { writeSingleOperationLog, toErrorSummary } from '../../logs/lib/operationLog';
import * as crypto from 'crypto';
import { logOpsError, logOpsSuccess } from "../../../shared/logging/logOpsError";
import { FunctionCustomError } from '../../../shared/logging/functionCustomError';
import {
  isLinkedOkibakeActiveForNormalBustSync,
  syncLinkedOkibakeOnNormalBustInTx,
} from '../lib/syncLinkedOkibakeOnNormalBust';
import { assertTournamentAllowsMutation } from '../lib/assertTournamentAllowsMutation';
import { assertTableDeviceCanAccessTable } from '../../../table_device/lib/shared';

// 入力スキーマ
const bustAndReentrySchema = z.object({
  operationId: z.string().min(1, 'operationId は必須です'),
  tournamentId: z.string(),
  userId: z.string(),
  tableId: z.string(),
  seatNumber: z.number().int().positive(),
  deviceName: z.string().optional(),
});

export const bustAndReentry = onCall(async (request) => {
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
    const hasPermission =
      device.role === 'admin' ||
      device.role === 'table' ||
      hasRequiredOption(device.options, 'tournament');
    if (!hasPermission) {
      throw new HttpsError('permission-denied', 'トーナメント運営の権限がありません');
    }

    const startedAt = FieldValue.serverTimestamp();
    const { data } = request;
    const { operationId, tournamentId, userId, tableId, seatNumber, deviceName } = bustAndReentrySchema.parse(data);
    assertTableDeviceCanAccessTable({ device, requestedTableId: tableId });
    
    console.log(`=== Bust＆リエントリー開始 ===`);
    console.log(`tournamentId: ${tournamentId}`);
    console.log(`userId: ${userId}`);
    console.log(`tableId: ${tableId}`);
    console.log(`seatNumber: ${seatNumber}`);
    
    const db = admin.firestore();
    
    // トランザクションで処理を実行
    const result = await db.runTransaction(async (transaction) => {
      // 1. トーナメント情報を取得
      const tournamentRef = db.collection('scheduledTournaments').doc(tournamentId);
      const tournamentDoc = await transaction.get(tournamentRef);
      
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

      const tournamentData = tournamentDoc.data()!;
      const templateId = tournamentData.templateId;
      const reentryFee = tournamentData.snapshot?.reentryFee || 0;
      const maxReentriesPerPlayer = tournamentData.snapshot?.maxReentriesPerPlayer;
      const templateName = tournamentData.snapshot?.name || '';
      const startAt = tournamentData.startAt;

      if (!templateId) {
        throw new FunctionCustomError({
          errorKey: 'TOURNAMENT_INVALID_STATE',
          message: 'トーナメントのtemplateIdが存在しません',
          context: { tournamentId, reason: 'templateId_missing' },
        });
      }

      // 2. テンプレート情報を取得
      const templateRef = db.collection('tournamentTemplates').doc(templateId);
      const templateDoc = await transaction.get(templateRef);

      if (!templateDoc.exists) {
        throw new FunctionCustomError({
          errorKey: 'TOURNAMENT_INVALID_STATE',
          message: 'トーナメントテンプレートが存在しません',
          context: { tournamentId, templateId, reason: 'template_doc_missing' },
        });
      }

      // 3. activeStaysからbillIdを取得（存在チェックは本callable側の責務）
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
      
      // pokerNameはactiveStaysから取得（todaysBillsには依存しない）
      const pokerName = activeStayData.pokerName || `Player_${userId}`;
      
      // 4. リエントリー回数を計算（/bills/{billId}/tournaments/{templateId} から取得）
      const billTournamentRef = db.collection('bills').doc(billId).collection('tournaments').doc(templateId);
      const existingTournamentDoc = await transaction.get(billTournamentRef);
      let currentReentryCount = 0;
      
      if (existingTournamentDoc.exists) {
        const tournamentInfo = existingTournamentDoc.data()!;
        currentReentryCount = tournamentInfo.reentryCount || 0;
        console.log(`既存のリエントリー回数: ${currentReentryCount}`);
      }
      
      // 5. リエントリー制限チェック
      if (maxReentriesPerPlayer != null && currentReentryCount >= maxReentriesPerPlayer) {
        throw new FunctionCustomError({
          errorKey: 'TOURNAMENT_REENTRY_LIMIT_REACHED',
          message: 'リエントリー制限に達しています',
          context: { tournamentId, userId, currentReentryCount, maxReentriesPerPlayer },
        });
      }

      // 6. テーブルシート情報を取得
      const tableSeatRef = db
        .collection('scheduledTournaments')
        .doc(tournamentId)
        .collection('tablesSeat')
        .doc(tableId);

      const tableSeatDoc = await transaction.get(tableSeatRef);

      if (!tableSeatDoc.exists) {
        throw new FunctionCustomError({
          errorKey: 'TOURNAMENT_INVALID_STATE',
          message: 'テーブルシート情報が存在しません',
          context: { tournamentId, tableId, reason: 'table_seat_missing' },
        });
      }
      
      const tableSeatData = tableSeatDoc.data()!;
      const seats = tableSeatData.seats || {};
      
      const seatNumberStr = seatNumber.toString().padStart(2, '0');
      const seatUserIdKey = `seat${seatNumberStr}UserId`;
      const seatPokerNameKey = `seat${seatNumberStr}PokerName`;
      const seatOkibakeEntryIdKey = `seat${seatNumberStr}OkibakeEntryId`;
      
      // 7. シートにユーザーが座っているかチェック
      if (seats[seatUserIdKey] !== userId) {
        throw new FunctionCustomError({
          errorKey: 'TOURNAMENT_INVALID_STATE',
          message: '指定されたシートにユーザーが座っていません',
          context: { tournamentId, tableId, seatNumber, userId, reason: 'seat_user_mismatch' },
        });
      }

      // 8. scheduledTournaments/views/mainを取得
      const viewsMainRef = db
        .collection('scheduledTournaments')
        .doc(tournamentId)
        .collection('views')
        .doc('main');

      const viewsMainDoc = await transaction.get(viewsMainRef);
      if (!viewsMainDoc.exists) {
        throw new FunctionCustomError({
          errorKey: 'TOURNAMENT_INVALID_STATE',
          message: 'トーナメントのviews/mainドキュメントが存在しません',
          context: { tournamentId, reason: 'views_main_missing' },
        });
      }
      
      const viewsMainData = viewsMainDoc.data()!;
      const currentPlayersBusted = viewsMainData.playersBusted || 0;
      const currentReentries = viewsMainData.reentries || 0;
      const currentWaitingCount = viewsMainData.waitingCount || 0;
      
      // 9. scheduledTournaments/tablesSeat/waitingを取得
      const waitingRef = db
        .collection('scheduledTournaments')
        .doc(tournamentId)
        .collection('tablesSeat')
        .doc('waiting');
      
      const waitingDoc = await transaction.get(waitingRef);
      const waitingExists = waitingDoc.exists;
      const waitingData = waitingExists ? waitingDoc.data()! : null;
      const currentWaiting = waitingData?.waiting || {};
      const currentCount = Object.keys(currentWaiting).length;
      const waitingCount = waitingData?.count || 0;
      
      console.log(`waiting情報: count=${waitingCount}, currentCount=${currentCount}, waitingExists=${waitingExists}`);
      
      // 10. 全テーブルの空席数を計算
      const allTablesSeatRef = db
        .collection('scheduledTournaments')
        .doc(tournamentId)
        .collection('tablesSeat');
      
      const allTablesSeatDocs = await transaction.get(allTablesSeatRef);
      let totalEmptySeats = 0;
      
      allTablesSeatDocs.forEach((doc) => {
        if (doc.id === 'waiting') return; // waitingドキュメントを除外
        
        const tableData = doc.data();
        const seats = tableData.seats || {};
        
        // seatXXUserIdフィールドの数をカウント
        for (const [key, value] of Object.entries(seats)) {
          if (key.endsWith('UserId')) {
            if (value === null || value === '') {
              totalEmptySeats++;
            }
          }
        }
      });
      
      console.log(`空席数: ${totalEmptySeats}, waiting数: ${waitingCount}`);
      
      // 11. ユーザーが既にwaitingに存在するかチェック
      const isAlreadyInWaiting = currentWaiting[userId] ? true : false;
      
      console.log(`ユーザー ${userId} のwaiting状態: isAlreadyInWaiting=${isAlreadyInWaiting}`);

      const linkedOkibakeSnap = await transaction.get(
        tournamentRef.collection('okibakeTemporaryEntries').where('linkedUserId', '==', userId),
      );
      const linkedOkibakeEntryIds = linkedOkibakeSnap.docs
        .filter((doc) =>
          isLinkedOkibakeActiveForNormalBustSync(doc.data() as Record<string, unknown>),
        )
        .map((doc) => doc.id);
      const seatOkibakeEntryId =
        typeof seats[seatOkibakeEntryIdKey] === 'string' ? seats[seatOkibakeEntryIdKey] : null;
      
      // 全ての読み取りが完了したので、ここから書き込み操作を開始
      
      // 12. 空席数 - waiting数 ≥ 3の場合、シートに残す（waitingに追加しない）
      if (totalEmptySeats - waitingCount >= 3) {
        console.log(`空席数(${totalEmptySeats}) - waiting数(${waitingCount}) = ${totalEmptySeats - waitingCount} ≥ 3のため、ユーザー ${userId} をシートに残します`);
        
        // シートは変更せず、統計のみ更新
        transaction.update(viewsMainRef, {
          playersBusted: currentPlayersBusted + 1,
          reentries: currentReentries + 1,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        
        // todaysBillsのtournamentsフィールドへの直接更新は削除（recordTournamentAction内のDualWriteに集約）
        
        return { 
          success: true, 
          userId, 
          pokerName, 
          billId, 
          templateId, 
          reentryFee, 
          templateName,
          startAt,
        };
      }
      
      // 13. waitingのcountが0より大きい場合、通常の処理
      console.log(`waitingのcountが${waitingCount}のため、通常のリエントリー処理を実行します`);

      await syncLinkedOkibakeOnNormalBustInTx({
        transaction,
        tournamentRef,
        userId,
        mode: 'reentry',
        tableId,
        seatNumber,
        seatOkibakeEntryId,
        preloadedEntryIds: linkedOkibakeEntryIds,
        now: admin.firestore.FieldValue.serverTimestamp(),
      });
      
      // テーブルシートからユーザーを削除
      const updatedSeats = { ...seats };
      updatedSeats[seatUserIdKey] = null;
      updatedSeats[seatPokerNameKey] = null;
      updatedSeats[seatOkibakeEntryIdKey] = null;
      
      transaction.update(tableSeatRef, {
        seats: updatedSeats,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      
      // scheduledTournaments/views/mainを更新
      transaction.update(viewsMainRef, {
        playersBusted: currentPlayersBusted + 1,
        reentries: currentReentries + 1,
        waitingCount: isAlreadyInWaiting ? currentWaitingCount : currentWaitingCount + 1,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      
      // scheduledTournaments/tablesSeat/waitingを更新（ユーザーが既にwaitingに存在しない場合のみ）
      if (!isAlreadyInWaiting) {
        if (!waitingExists) {
          // waitingドキュメントが存在しない場合は作成
          transaction.set(waitingRef, {
            count: 1,
            waiting: {
              [userId]: {
                pokerName: pokerName,
                joinedAt: admin.firestore.FieldValue.serverTimestamp(),
                order: 1,
                isReentry: true,
                reentryCount: currentReentryCount + 1,
              }
            },
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        } else {
          // 既存のwaitingドキュメントを更新
          const currentWaitingData = currentWaiting || {};
          const maxOrder = Object.values(currentWaitingData)
            .filter(val => typeof val === 'object' && val !== null)
            .map(val => (val as any).order || 0)
            .reduce((max, order) => Math.max(max, order), 0);
          
          transaction.update(waitingRef, {
            count: currentCount + 1,
            waiting: {
              ...currentWaitingData,
              [userId]: {
                pokerName: pokerName,
                joinedAt: admin.firestore.FieldValue.serverTimestamp(),
                order: maxOrder + 1,
                isReentry: true,
                reentryCount: currentReentryCount + 1,
              }
            },
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        }
      }
      
      // todaysBillsのtournamentsフィールドへの直接更新は削除（recordTournamentAction内のDualWriteに集約）
      
      return { 
        success: true, 
        userId, 
        pokerName, 
        billId, 
        templateId, 
        reentryFee, 
        templateName,
        startAt,
      };
    });
    
    // トランザクション完了後、recordTournamentActionを呼び出す（トランザクション外で実行）
    const clientNonce = crypto.randomUUID();
    const idempotencyKey = `${result.billId}:recordTournamentAction:reentry:${clientNonce}`;
    
    try {
      await recordTournamentAction({
        billId: result.billId,
        templateId: result.templateId,
        action: 'reentry',
        templateName: result.templateName,
        entryFeeIncl: null, // 既存の値を保持（recordTournamentAction内で処理）
        reentryFeeIncl: result.reentryFee,
        addonFeeIncl: null, // 既存の値を保持（recordTournamentAction内で処理）
        startAt: result.startAt ? (result.startAt as admin.firestore.Timestamp) : null,
        idempotencyKey,
      });
    } catch (error) {
      logOpsError({
      message: 'Failed to record tournament action via recordTournamentAction helper:',
      functionEntry: 'bustAndReentry',
      operation: 'recordTournamentActionBestEffort',
      cause: error,
    });
      // エラーを再スローせず、メインのcallableは成功とみなす（ベストエフォート）
      // scheduledTournamentsの更新は成功しているため
    }
    
    // 操作記録（成功）。op-104。卓単位のため tableId/tournamentId をトップレベルに付与。巻き戻し時に bills の reentryCount を戻すため billId/templateId を保存
    await writeSingleOperationLog({
      operationId,
      operationName: 'バスト＆再入場',
      deviceId: device.id,
      deviceName: deviceName ?? device.name ?? undefined,
      status: 'succeeded',
      startedAt,
      tournamentId,
      tableId,
      payload: {
        playerUid: result.userId,
        playerName: result.pokerName,
        tableId,
        seatNumber,
        billId: result.billId,
        templateId: result.templateId,
      },
    });

    logOpsSuccess({
      message: 'Bust＆リエントリーが完了しました',
      functionEntry: 'bustAndReentry',
      context: {
        tournamentId,
        userId: result.userId,
        tableId,
        seatNumber,
        billId: result.billId,
        templateId: result.templateId,
        callerUid,
        deviceId: device.id,
      },
    });

    return {
      success: true,
      userId: result.userId,
      message: 'Bust＆リエントリーが完了しました',
    };
    
  } catch (error) {
    logOpsError({
      message: '=== Bust＆リエントリーエラー ===',
      functionEntry: 'bustAndReentry',
      operation: 'bustAndReentryMainCatch',
      cause: error,
    });

    const rawData = request.data as Record<string, unknown> | undefined;
    const opId = typeof rawData?.operationId === 'string' ? rawData.operationId : undefined;
    if (opId && device != null) {
      try {
        await writeSingleOperationLog({
          operationId: opId,
          operationName: 'バスト＆再入場',
          deviceId: device.id,
          deviceName: typeof rawData?.deviceName === 'string' ? rawData.deviceName : device.name ?? undefined,
          status: 'failed',
          errorSummary: toErrorSummary(error),
          payload: {},
        });
      } catch (logErr) {
        logOpsError({
      message: 'operationLog 書き込み失敗',
      functionEntry: 'bustAndReentry',
      operation: 'bustAndReentryOperationLogWrite',
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
    if (error instanceof HttpsError) throw error;
    return {
      success: false,
      error: error instanceof Error ? error.message : '不明なエラー',
    };
  }
});
