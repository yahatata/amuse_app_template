import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { z } from 'zod';
import { getCallerDeviceByUid, hasRequiredOption, isActive } from '../lib/devicePermissions';
import { updatePlace } from '../helpers/billsApi/updatePlace';

// 入力スキーマ
const assignSeatToPlayerSchema = z.object({
  tournamentId: z.string(),
  userId: z.string(),
  tableId: z.string(),
  seatNumber: z.number().int().positive(),
});

export const assignSeatToPlayer = functions.https.onCall(async (data, context: any) => {
  // 認証チェック
  if (!context || !context.auth) {
    throw new functions.https.HttpsError('unauthenticated', '認証が必要です');
  }

  const callerUid = context.auth.uid;

  // デバイス権限の確認（role: admin または options.tournament: true）
  const device = await getCallerDeviceByUid(callerUid);
  if (!device || !isActive(device.status)) {
    throw new functions.https.HttpsError('permission-denied', 'デバイスが見つからないか、アクティブではありません');
  }

  const hasPermission = device.role === 'admin' || hasRequiredOption(device.options, 'tournament');
  if (!hasPermission) {
    throw new functions.https.HttpsError('permission-denied', 'トーナメント運営の権限がありません');
  }

  try {
    // 正しいデータの場所を取得
    const actualData = data.data || data;
    
    // 入力検証
    const { tournamentId, userId, tableId, seatNumber } = assignSeatToPlayerSchema.parse(actualData);
    
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
        throw new Error('テーブルが存在しません');
      }
      
      const tableSeatData = tableSeatDoc.data()!;
      if (!tableSeatData.isEnabled) {
        throw new Error('テーブルが無効です');
      }
      
      // 2. 指定されたシートが空いているかチェック（新しい構造）
      const seatNumberStr = seatNumber.toString().padStart(2, '0');
      const seatUserIdKey = `seat${seatNumberStr}UserId`;
      if (tableSeatData.seats[seatUserIdKey] !== null) {
        throw new Error('指定されたシートは既に使用中です');
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
        throw new Error(`ユーザー ${userId} のactiveStaysドキュメントが存在しません`);
      }
      
      const activeStayData = activeStayDoc.data()!;
      const billId = activeStayData.billId as string;
      
      if (!billId) {
        throw new Error(`ユーザー ${userId} のactiveStaysにbillIdが設定されていません`);
      }
      
      // 5. ユーザー情報を取得（pokerNameはactiveStaysから取得、todaysBillsには依存しない）
      const pokerName = activeStayData.pokerName || `Player_${userId}`;
      
      // すべての読み取り操作が完了したので、ここから書き込み操作を開始
      
      // 6. 待機者リストから削除（書き込み操作）
      if (waitingDoc.exists) {
        const waitingData = waitingDoc.data()!;
        if (waitingData.waiting && waitingData.waiting[userId]) {
          // 待機者リストから削除
          const updatedWaiting = { ...waitingData.waiting };
          delete updatedWaiting[userId];
          
          transaction.update(waitingRef, {
            waiting: updatedWaiting,
            count: Object.keys(updatedWaiting).length,
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
      
      // billIdを返して、トランザクション外でupdatePlaceを呼び出す
      return { success: true, userId, tableId, seatNumber, billId };
      
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
    
    // トランザクション完了後、トランザクション外でupdatePlaceを呼び出す
    if (transactionResult.billId) {
      try {
        await updatePlace({
          billId: transactionResult.billId,
          table: transactionResult.tableId,
          seat: transactionResult.seatNumber,
        });
      } catch (error) {
        console.error('updatePlace failed', error);
        // updatePlaceの失敗は警告ログのみ（scheduledTournamentsの更新は成功している）
        // ただし、エラーを再スローして呼び出し側に通知することも検討可能
      }
    }
    
    console.log(`=== 待機者着席完了 ===`);
    console.log(`結果:`, transactionResult);
    
    return transactionResult;
    
  } catch (error) {
    console.error('=== 待機者着席エラー ===');
    console.error(error);
    
    // エラーメッセージを適切に返す
    if (error instanceof Error) {
      throw new functions.https.HttpsError('internal', error.message);
    } else {
      throw new functions.https.HttpsError('internal', '待機者着席に失敗しました');
    }
  }
});
