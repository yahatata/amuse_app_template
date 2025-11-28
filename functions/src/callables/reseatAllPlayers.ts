import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { z } from 'zod';
import { getCallerDeviceByUid, hasRequiredOption, isActive } from '../lib/devicePermissions';

// 入力スキーマ
const reseatAllPlayersSchema = z.object({
  tournamentId: z.string(),
  playerAssignments: z.array(z.object({
    userId: z.string(),
    tableId: z.string(),
    seatNumber: z.number().int().positive(),
  })),
});

export const reseatAllPlayers = functions.https.onCall(async (data, context: any) => {
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
    const { tournamentId, playerAssignments } = reseatAllPlayersSchema.parse(actualData);
    
    console.log(`=== 全員リシート開始 ===`);
    console.log(`tournamentId: ${tournamentId}`);
    console.log(`playerAssignments:`, playerAssignments);
    
    const db = admin.firestore();
    
    // トランザクション開始
    const result = await db.runTransaction(async (transaction) => {
      // 1. 全テーブルのシートをクリア
      const tablesSeatRef = db
        .collection('scheduledTournaments')
        .doc(tournamentId)
        .collection('tablesSeat');
      
      const tablesSeatDocs = await transaction.get(tablesSeatRef);
      
      // 2. todaysBillsからユーザー情報を事前に取得（すべての読み取りを最初に実行）
      const userPokerNames: { [userId: string]: string } = {};
      const todaysBillsDocs: { [userId: string]: any } = {};
      
      for (const assignment of playerAssignments) {
        const { userId } = assignment;
        
        // todaysBillsからユーザー情報を取得（userIdでクエリ）
        const todayBillsQuery = db.collection('todaysBills')
          .where('userId', '==', userId)
          .where('status', '==', 'open')
          .limit(1);
        
        const todayBillsSnapshot = await transaction.get(todayBillsQuery);
        let pokerName = `Player_${userId}`;
        
        if (!todayBillsSnapshot.empty) {
          const todayBillsDoc = todayBillsSnapshot.docs[0];
          const todayBillsData = todayBillsDoc.data();
          pokerName = todayBillsData.pokerName || pokerName;
          todaysBillsDocs[userId] = todayBillsDoc; // ドキュメント参照を保存
        }
        
        userPokerNames[userId] = pokerName;
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
            if (seatKey.endsWith('UserId') || seatKey.endsWith('PokerName')) {
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

      // 7. todaysBillsのcurrentTable/currentSeatを更新（事前に取得したドキュメント参照を使用）
      for (const assignment of playerAssignments) {
        const { userId, tableId, seatNumber } = assignment;
        
        if (todaysBillsDocs[userId]) {
          const todayBillsDoc = todaysBillsDocs[userId];
          transaction.update(todayBillsDoc.ref, {
            currentTable: tableId,
            currentSeat: seatNumber,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        }
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
      
      return { success: true, playerCount: playerAssignments.length };
    });
    
    console.log(`=== 全員リシート完了 ===`);
    console.log(`結果:`, result);
    
    return result;
    
  } catch (error) {
    console.error('=== 全員リシートエラー ===');
    console.error(error);
    
    // エラーメッセージを適切に返す
    if (error instanceof Error) {
      throw new functions.https.HttpsError('internal', error.message);
    } else {
      throw new functions.https.HttpsError('internal', '全員リシートに失敗しました');
    }
  }
});
