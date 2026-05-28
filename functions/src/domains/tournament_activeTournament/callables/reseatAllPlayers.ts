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

// 入力スキーマ
const reseatAllPlayersSchema = z.object({
  operationId: z.string().min(1, 'operationId は必須です'),
  tournamentId: z.string(),
  playerAssignments: z.array(z.object({
    userId: z.string(),
    tableId: z.string(),
    seatNumber: z.number().int().positive(),
  })),
  deviceName: z.string().optional(),
});

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
    const { operationId, tournamentId, playerAssignments, deviceName } = reseatAllPlayersSchema.parse(data);
    
    console.log(`=== 全員リシート開始 ===`);
    console.log(`tournamentId: ${tournamentId}`);
    console.log(`playerAssignments:`, playerAssignments);
    
    const db = admin.firestore();
    
    // トランザクション開始
    const result = await db.runTransaction(async (transaction) => {
      const tablesSeatRef = db
        .collection('scheduledTournaments')
        .doc(tournamentId)
        .collection('tablesSeat');
      
      const tablesSeatDocs = await transaction.get(tablesSeatRef);

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
      
      // 2. activeStaysからユーザー情報を事前に取得（すべての読み取りを最初に実行）
      const userPokerNames: { [userId: string]: string } = {};
      const userBillIds: { [userId: string]: string } = {};
      
      for (const assignment of playerAssignments) {
        const { userId } = assignment;
        
        // activeStaysからユーザー情報を取得（存在チェックは本callable側の責務）
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
        
        userPokerNames[userId] = pokerName;
        userBillIds[userId] = billId;
      }
      
      // 3. 新しい割り当てに必要なテーブルシートを事前に読み取り
      const tableSeatDocsMap = new Map();
      for (const assignment of playerAssignments) {
        const { tableId } = assignment;
        if (!tableSeatDocsMap.has(tableId)) {
          const tableSeatRef = tablesSeatRef.doc(tableId);
          const tableSeatDoc = await transaction.get(tableSeatRef);
          tableSeatDocsMap.set(tableId, tableSeatDoc);
        }
      }
      
      // 4. waitingドキュメントを事前に読み取り
      const waitingRef = tablesSeatRef.doc('waiting');
      const waitingDoc = await transaction.get(waitingRef);
      
      // 全ての読み取りが完了したので、ここから書き込み操作を開始
      
      // 4. 各テーブルのシートをクリアし、新しい割り当てを適用
      const tableUpdates = new Map(); // tableId -> updatedSeats
      
      // まず、すべてのテーブルをクリア
      for (const doc of tablesSeatDocs.docs) {
        if (doc.id !== 'waiting' && doc.data().isEnabled) {
          const seats = doc.data().seats;
          const clearedSeats: { [key: string]: string | null } = {};
          
          // 新しい構造で全シートをnullにリセット
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
      
      // 次に、新しい割り当てを適用
      for (const assignment of playerAssignments) {
        const { userId, tableId, seatNumber } = assignment;
        
        const tableSeatDoc = tableSeatDocsMap.get(tableId);
        
        if (tableSeatDoc && tableSeatDoc.exists) {
          const seatNumberStr = seatNumber.toString().padStart(2, '0');
          
          // 事前に取得したpokerNameを使用
          const pokerName = userPokerNames[userId];
          
          // テーブルの更新データを取得または作成
          let updatedSeats = tableUpdates.get(tableId) || {};
          
          // シートにユーザーを割り当て（新しい構造）
          updatedSeats[`seat${seatNumberStr}UserId`] = userId;
          updatedSeats[`seat${seatNumberStr}PokerName`] = pokerName;
          updatedSeats[`seat${seatNumberStr}OkibakeEntryId`] = null;
          
          tableUpdates.set(tableId, updatedSeats);
        }
      }
      
      // 最後に、すべてのテーブル更新を実行
      for (const [tableId, updatedSeats] of tableUpdates.entries()) {
        const tableSeatRef = tablesSeatRef.doc(tableId);
        transaction.update(tableSeatRef, {
          seats: updatedSeats,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }
      
      // 5. 待機者リストから割り当てられたユーザーのみを削除（事前に読み取ったドキュメントを使用）
      if (waitingDoc.exists) {
        const waitingData = waitingDoc.data()!;
        const currentWaiting = waitingData.waiting || {};
        
        // 割り当てられたユーザーのみを削除
        const assignedUserIds = new Set(playerAssignments.map(assignment => assignment.userId));
        const updatedWaiting = { ...currentWaiting };
        
        for (const userId of assignedUserIds) {
          if (updatedWaiting.hasOwnProperty(userId)) {
            delete updatedWaiting[userId];
          }
        }
        
        transaction.update(waitingRef, {
          waiting: updatedWaiting,
          count: Object.keys(updatedWaiting).length,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }
      
      // 6. eventsサブコレクションに記録（ロールバック用）
      // TODO: 今後実装予定 - eventsサブコレクションへの記録
      // const eventRef = db
      //   .collection('scheduledTournaments')
      //   .doc(tournamentId)
      //   .collection('events')
      //   .doc();
      // transaction.set(eventRef, {
      //   type: 'reseat_all_players',
      //   playerAssignments: playerAssignments,
      //   timestamp: admin.firestore.FieldValue.serverTimestamp(),
      // });
      
      // トランザクション内で取得した情報を返す（トランザクション外で updatePlace と operationLog に使用）
      return { 
        success: true, 
        playerCount: playerAssignments.length,
        previousSeatingData,
        playerAssignments: playerAssignments.map(a => ({
          userId: a.userId,
          tableId: a.tableId,
          seatNumber: a.seatNumber,
          billId: userBillIds[a.userId],
        })),
      };
    });
    
    // トランザクション完了後、トランザクション外で各ユーザーごとにupdatePlaceを逐次呼び出す（ネストトランザクションを避ける）
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
            // updatePlaceの失敗は警告ログのみ（scheduledTournamentsの更新は成功している）
          }
        }
      }
    }
    
    // 操作記録（成功）。op-106。トーナメント単位（卓に紐づかない）のため tableId はトップレベルに付けない
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
