import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { z } from 'zod';
import { getCallerDeviceByUid, hasRequiredOption, isActive } from '../../../shared/devices';
import { logOpsError } from "../../../shared/logging/logOpsError";
import { FunctionCustomError, mapFunctionCustomErrorToHttpsCode } from '../../../shared/logging/functionCustomError';

// 入力スキーマ
const addTableToTournamentSchema = z.object({
  tournamentId: z.string(),
  tableId: z.string(),
  maxSeats: z.number().int().positive(),
});

export const addTableToTournament = onCall(async (request) => {
  // 認証チェック
  if (!request.auth) {
    throw new HttpsError('unauthenticated', '認証が必要です');
  }

  const callerUid = request.auth.uid;

  // デバイス権限の確認（role: admin または options.tournament: true）
  const device = await getCallerDeviceByUid(callerUid);
  if (!device || !isActive(device.status)) {
    throw new HttpsError('permission-denied', 'デバイスが見つからないか、アクティブではありません');
  }

  const hasPermission = device.role === 'admin' || hasRequiredOption(device.options, 'tournament');
  if (!hasPermission) {
    throw new HttpsError('permission-denied', 'トーナメント運営の権限がありません');
  }

  try {
    console.log('=== 卓追加: 受信データ ===');
    const { data } = request;
    console.log('data:', data);
    console.log('data type:', typeof data);
    console.log('data keys:', Object.keys(data || {}));
    
    // 入力検証
    const { tournamentId, tableId, maxSeats } = addTableToTournamentSchema.parse(data);
    
    console.log(`=== 卓追加開始 ===`);
    console.log(`tournamentId: ${tournamentId}`);
    console.log(`tableId: ${tableId}`);
    console.log(`maxSeats: ${maxSeats}`);
    
    const db = admin.firestore();
    
    // トランザクション開始
    const result = await db.runTransaction(async (transaction) => {
      // 1. テーブルの存在確認とステータス更新
      const tableRef = db.collection('tables').doc(tableId);
      const tableDoc = await transaction.get(tableRef);
      
      if (!tableDoc.exists) {
        throw new FunctionCustomError({
          errorKey: 'TOURNAMENT_INVALID_STATE',
          message: 'テーブルが存在しません',
          context: { tournamentId, tableId, reason: 'table_doc_missing' },
        });
      }

      const tableData = tableDoc.data()!;
      if (tableData.status !== 'open') {
        throw new FunctionCustomError({
          errorKey: 'TOURNAMENT_INVALID_STATE',
          message: 'テーブルは使用中です',
          context: { tournamentId, tableId, status: tableData.status, reason: 'table_not_open' },
        });
      }
      
      // 2. テーブルステータスをtournamentに変更
      transaction.update(tableRef, {
        status: 'tournament',
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      
      // 3. scheduledTournamentのtablesSeatサブコレクションにドキュメント作成
      const tournamentTableRef = db
        .collection('scheduledTournaments')
        .doc(tournamentId)
        .collection('tablesSeat')
        .doc(tableId);
      
      // シート情報を動的に生成（新しい構造）
      const seats: { [key: string]: string | null } = {};
      for (let i = 1; i <= maxSeats; i++) {
        const seatNumber = i.toString().padStart(2, '0');
        seats[`seat${seatNumber}UserId`] = null;
        seats[`seat${seatNumber}PokerName`] = null;
      }
      
      transaction.set(tournamentTableRef, {
        maxSeats: maxSeats,
        seats: seats,
        isEnabled: true,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      
      // 4. eventsサブコレクションに記録（ロールバック用）
      // TODO: 今後実装予定 - eventsサブコレクションへの記録
      // const eventRef = db
      //   .collection('scheduledTournaments')
      //   .doc(tournamentId)
      //   .collection('events')
      //   .doc();
      // transaction.set(eventRef, {
      //   type: 'table_added',
      //   tableId: tableId,
      //   maxSeats: maxSeats,
      //   timestamp: admin.firestore.FieldValue.serverTimestamp(),
      // });
      
      return { success: true, tableId, maxSeats };
    });
    
    console.log(`=== 卓追加完了 ===`);
    console.log(`結果:`, result);
    
    return result;
    
  } catch (error) {
    if (error instanceof HttpsError) {
      throw error;
    }

    if (error instanceof z.ZodError) {
      throw new HttpsError('invalid-argument', error.errors.map((e) => e.message).join(', '));
    }

    if (error instanceof FunctionCustomError) {
      logOpsError({
        message: '=== 卓追加エラー ===',
        failureType: 'business',
        functionEntry: 'addTableToTournament',
        operation: 'addTableToTournamentCatch',
        cause: error,
      });
      throw new HttpsError(mapFunctionCustomErrorToHttpsCode(error.errorKey), error.message);
    }

    logOpsError({
      message: '=== 卓追加エラー ===',
      failureType: 'business',
      functionEntry: 'addTableToTournament',
      cause: error,
    });

    if (error instanceof Error) {
      throw new HttpsError('internal', error.message);
    }
    throw new HttpsError('internal', '卓追加に失敗しました');
  }
});
