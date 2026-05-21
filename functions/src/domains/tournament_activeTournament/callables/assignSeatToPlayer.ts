import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import * as admin from 'firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { z } from 'zod';
import { getCallerDeviceByUid, hasRequiredOption, isActive } from '../../../shared/devices';
import type { DeviceDoc } from '../../../shared/devices';
import { updatePlace } from '../../bills/repos/updatePlace';
import { writeSingleOperationLog, toErrorSummary } from '../../logs/lib/operationLog';
import { logOpsError, logOpsSuccess } from "../../../shared/logging/logOpsError";
import { FunctionCustomError, mapFunctionCustomErrorToHttpsCode } from '../../../shared/logging/functionCustomError';

// 入力スキーマ
const assignSeatToPlayerSchema = z.object({
  operationId: z.string().min(1, 'operationId は必須です'),
  tournamentId: z.string(),
  userId: z.string(),
  tableId: z.string(),
  seatNumber: z.number().int().positive(),
  deviceName: z.string().optional(),
});

export const assignSeatToPlayer = onCall(async (request) => {
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
    const { operationId, tournamentId, userId, tableId, seatNumber, deviceName } = assignSeatToPlayerSchema.parse(data);
    
    console.log(`=== 待機者着席開始 ===`);
    console.log(`tournamentId: ${tournamentId}`);
    console.log(`userId: ${userId}`);
    console.log(`tableId: ${tableId}`);
    console.log(`seatNumber: ${seatNumber}`);
    
    const db = admin.firestore();
    
    // トランザクション開始（scheduledTournamentsの更新）
    const transactionResult = await db.runTransaction(async (transaction) => {
      // 1. トーナメントのtablesSeatサブコレクションから対象テーブルを取得
      const tableSeatRef = db
        .collection('scheduledTournaments')
        .doc(tournamentId)
        .collection('tablesSeat')
        .doc(tableId);
      
      const tableSeatDoc = await transaction.get(tableSeatRef);
      if (!tableSeatDoc.exists) {
        throw new FunctionCustomError({
          errorKey: 'TOURNAMENT_INVALID_STATE',
          message: 'テーブルが存在しません',
          context: { tournamentId, tableId, reason: 'table_seat_doc_missing' },
        });
      }

      const tableSeatData = tableSeatDoc.data()!;
      if (!tableSeatData.isEnabled) {
        throw new FunctionCustomError({
          errorKey: 'TOURNAMENT_INVALID_STATE',
          message: 'テーブルが無効です',
          context: { tournamentId, tableId, reason: 'table_disabled' },
        });
      }
      
      // 2. 指定されたシートが空いているかチェック（新しい構造）
      const seatNumberStr = seatNumber.toString().padStart(2, '0');
      const seatUserIdKey = `seat${seatNumberStr}UserId`;
      if (tableSeatData.seats[seatUserIdKey] !== null) {
        throw new FunctionCustomError({
          errorKey: 'TOURNAMENT_INVALID_STATE',
          message: '指定されたシートは既に使用中です',
          context: { tournamentId, tableId, seatNumber, reason: 'seat_occupied' },
        });
      }
      
      // 3. 待機者リストから該当ユーザーを削除
      const waitingRef = db
        .collection('scheduledTournaments')
        .doc(tournamentId)
        .collection('tablesSeat')
        .doc('waiting');
      
      const waitingDoc = await transaction.get(waitingRef);
      
      // 4. activeStaysからユーザー情報を取得（存在チェックは本callable側の責務）
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
      
      // 5. ユーザー情報を取得（pokerNameはactiveStaysから取得、todaysBillsには依存しない）
      const pokerName = activeStayData.pokerName || `Player_${userId}`;
      
      // すべての読み取り操作が完了したので、ここから書き込み操作を開始
      
      // 6. 待機者リストから削除（書き込み操作）。waiting にいた場合のみ views/main.waitingCount を -1
      let waitingCountMismatchAtRead: number | undefined;
      if (waitingDoc.exists) {
        const waitingData = waitingDoc.data()!;
        if (waitingData.waiting && waitingData.waiting[userId]) {
          const updatedWaiting = { ...waitingData.waiting };
          delete updatedWaiting[userId];
          
          transaction.update(waitingRef, {
            waiting: updatedWaiting,
            count: Object.keys(updatedWaiting).length,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });

          const currentWaitingCount = viewsMainData.waitingCount || 0;
          if (currentWaitingCount <= 0) {
            waitingCountMismatchAtRead = currentWaitingCount;
          }
          transaction.update(viewsMainRef, {
            waitingCount: Math.max(0, currentWaitingCount - 1),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        }
      }
      
      // 7. シートにユーザーを割り当て（書き込み操作）
      const updatedSeats = { ...tableSeatData.seats };
      updatedSeats[`seat${seatNumberStr}UserId`] = userId;
      updatedSeats[`seat${seatNumberStr}PokerName`] = pokerName;
      
      transaction.update(tableSeatRef, {
        seats: updatedSeats,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      
      // billId, pokerName を返してトランザクション外で updatePlace と operationLog に使用
      return {
        success: true,
        userId,
        pokerName,
        tableId,
        seatNumber,
        billId,
        waitingCountMismatchAtRead,
      };
      
      // 5. usersサブコレクションにユーザー情報を記録
      // TODO: 今後実装予定 - usersサブコレクションへの記録
      // const userRef = db
      //   .collection('scheduledTournaments')
      //   .doc(tournamentId)
      //   .collection('users')
      //   .doc(userId);
      // transaction.set(userRef, {
      //   userId: userId,
      //   displayName: 'ダミー名', // TODO: 実際のユーザー名に置き換え
      //   isSeated: true,
      //   isBusted: false,
      //   tableId: tableId,
      //   seatNo: seatNumber,
      //   pointA: 0,
      //   pointB: 0,
      //   pointC: 0,
      //   entryCount: 1,
      //   reentryCount: 0,
      //   addonCount: 0,
      //   createdAt: admin.firestore.FieldValue.serverTimestamp(),
      //   updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      // });
      
      // 6. eventsサブコレクションに記録（ロールバック用）
      // TODO: 今後実装予定 - eventsサブコレクションへの記録
      // const eventRef = db
      //   .collection('scheduledTournaments')
      //   .doc(tournamentId)
      //   .collection('events')
      //   .doc();
      // transaction.set(eventRef, {
      //   type: 'player_seated',
      //   userId: userId,
      //   tableId: tableId,
      //   seatNumber: seatNumber,
      //   timestamp: admin.firestore.FieldValue.serverTimestamp(),
      // });
    });

    if (transactionResult.waitingCountMismatchAtRead !== undefined) {
      logger.warn(
        'assignSeatToPlayer: views/main.waitingCount に対して waiting からの削除と不整合（<=0 のまま -1 を繰り越し）',
        {
          tournamentId,
          userId,
          reason: 'waiting_count_non_positive_while_user_in_waiting',
          waitingCountAtRead: transactionResult.waitingCountMismatchAtRead,
        },
      );
    }
    
    // トランザクション完了後、トランザクション外でupdatePlaceを呼び出す
    if (transactionResult.billId) {
      try {
        await updatePlace({
          billId: transactionResult.billId,
          table: transactionResult.tableId,
          seat: transactionResult.seatNumber,
        });
      } catch (error) {
        logOpsError({
      message: 'updatePlace failed',
      functionEntry: 'assignSeatToPlayer',
      operation: 'updatePlaceBestEffort',
      cause: error,
    });
      }
    }

    // 操作記録（成功）。op-105。卓単位のため tableId/tournamentId をトップレベルに付与
    await writeSingleOperationLog({
      operationId,
      operationName: '座席割当',
      deviceId: device.id,
      deviceName: deviceName ?? device.name ?? undefined,
      status: 'succeeded',
      startedAt,
      tournamentId,
      tableId,
      payload: {
        playerUid: transactionResult.userId,
        playerName: transactionResult.pokerName,
        tableId,
        seatNumber: transactionResult.seatNumber,
      },
    });

    logOpsSuccess({
      message: '待機者着席が完了しました',
      functionEntry: 'assignSeatToPlayer',
      context: {
        tournamentId,
        userId: transactionResult.userId,
        tableId: transactionResult.tableId,
        seatNumber: transactionResult.seatNumber,
        billId: transactionResult.billId,
        callerUid,
        deviceId: device.id,
      },
    });

    return transactionResult;
    
  } catch (error) {
    if (error instanceof HttpsError) {
      throw error;
    }

    if (error instanceof z.ZodError) {
      throw new HttpsError('invalid-argument', error.errors.map((e) => e.message).join(', '));
    }

    if (error instanceof FunctionCustomError) {
      logOpsError({
        message: '=== 待機者着席エラー ===',
        functionEntry: 'assignSeatToPlayer',
        operation: 'assignSeatToPlayerCatch',
        cause: error,
      });
      throw new HttpsError(mapFunctionCustomErrorToHttpsCode(error.errorKey), error.message);
    }

    logOpsError({
      message: '=== 待機者着席エラー ===',
      functionEntry: 'assignSeatToPlayer',
      operation: 'assignSeatGenericCatch',
      cause: error,
    });

    const rawData = request.data as Record<string, unknown> | undefined;
    const opId = typeof rawData?.operationId === 'string' ? rawData.operationId : undefined;
    if (opId && device != null) {
      try {
        await writeSingleOperationLog({
          operationId: opId,
          operationName: '座席割当',
          deviceId: device.id,
          deviceName: typeof rawData?.deviceName === 'string' ? rawData.deviceName : device.name ?? undefined,
          status: 'failed',
          errorSummary: toErrorSummary(error),
          payload: {},
        });
      } catch (logErr) {
        logOpsError({
      message: 'operationLog 書き込み失敗',
      functionEntry: 'assignSeatToPlayer',
      operation: 'assignSeatOperationLogWrite',
      cause: logErr,
    });
      }
    }
    
    throw new HttpsError('internal', error instanceof Error ? error.message : '待機者着席に失敗しました');
  }
});
