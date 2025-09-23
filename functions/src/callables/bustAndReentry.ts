import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { z } from 'zod';

// 入力スキーマ
const bustAndReentrySchema = z.object({
  tournamentId: z.string(),
  userId: z.string(),
  tableId: z.string(),
  seatNumber: z.number().int().positive(),
});

export const bustAndReentry = functions.https.onCall(async (data, context) => {
  try {
    // 正しいデータの場所を取得
    const actualData = data.data || data;
    
    // 入力検証
    const { tournamentId, userId, tableId, seatNumber } = bustAndReentrySchema.parse(actualData);
    
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
        throw new Error('トーナメントが存在しません');
      }
      
      const tournamentData = tournamentDoc.data()!;
      const templateId = tournamentData.templateId;
      const reentryFee = tournamentData.snapshot?.reentryFee || 0;
      const maxReentriesPerPlayer = tournamentData.snapshot?.maxReentriesPerPlayer;
      
      // 2. テンプレート情報を取得
      const templateRef = db.collection('tournamentTemplates').doc(templateId);
      const templateDoc = await transaction.get(templateRef);
      
      if (!templateDoc.exists) {
        throw new Error('トーナメントテンプレートが存在しません');
      }
      
      // 3. todaysBillsからユーザー情報を取得
      const todayBillsQuery = db.collection('todaysBills')
        .where('userId', '==', userId)
        .where('status', '==', 'open')
        .limit(1);
      
      const todayBillsSnapshot = await transaction.get(todayBillsQuery);
      
      if (todayBillsSnapshot.empty) {
        throw new Error(`ユーザー ${userId} のオープンなtodaysBillsドキュメントが存在しません`);
      }
      
      const todayBillsDoc = todayBillsSnapshot.docs[0];
      const todayBillsData = todayBillsDoc.data();
      
      const pokerName = todayBillsData.pokerName || `Player_${userId}`;
      const existingTournaments = todayBillsData.tournaments || {};
      
      // 4. リエントリー回数を計算
      let currentReentryCount = 0;
      if (existingTournaments[tournamentId]) {
        // 既存のトーナメント情報からリエントリー回数を計算
        const tournamentInfo = existingTournaments[tournamentId];
        
        // reentryCountフィールドがある場合はその値を使用、ない場合は0
        currentReentryCount = tournamentInfo.reentryCount || 0;
        
        console.log(`既存のリエントリー回数: ${currentReentryCount}`);
      }
      
      // 5. リエントリー制限チェック
      if (maxReentriesPerPlayer != null && currentReentryCount >= maxReentriesPerPlayer) {
        throw new Error('リエントリー制限に達しています');
      }
      
      // 6. テーブルシート情報を取得
      const tableSeatRef = db
        .collection('scheduledTournaments')
        .doc(tournamentId)
        .collection('tablesSeat')
        .doc(tableId);
      
      const tableSeatDoc = await transaction.get(tableSeatRef);
      
      if (!tableSeatDoc.exists) {
        throw new Error('テーブルシート情報が存在しません');
      }
      
      const tableSeatData = tableSeatDoc.data()!;
      const seats = tableSeatData.seats || {};
      
      const seatNumberStr = seatNumber.toString().padStart(2, '0');
      const seatUserIdKey = `seat${seatNumberStr}UserId`;
      const seatPokerNameKey = `seat${seatNumberStr}PokerName`;
      
      // 7. シートにユーザーが座っているかチェック
      if (seats[seatUserIdKey] !== userId) {
        throw new Error('指定されたシートにユーザーが座っていません');
      }
      
      // 8. scheduledTournaments/views/mainを取得
      const viewsMainRef = db
        .collection('scheduledTournaments')
        .doc(tournamentId)
        .collection('views')
        .doc('main');
      
      const viewsMainDoc = await transaction.get(viewsMainRef);
      if (!viewsMainDoc.exists) {
        throw new Error('トーナメントのviews/mainドキュメントが存在しません');
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
        
        // todaysBillsのtournamentsフィールドを更新
        const existingTournamentInfo = existingTournaments[tournamentId] || {};
        const updatedTournamentInfo = {
          ...existingTournamentInfo,
          reentryCount: (existingTournamentInfo.reentryCount || 0) + 1,
          reentryFee: reentryFee,
          lastReentryAt: admin.firestore.FieldValue.serverTimestamp(),
        };
        
        const updatedTournaments = {
          ...existingTournaments,
          [tournamentId]: updatedTournamentInfo,
        };
        
        // totalPriceにreentryFeeを加算
        const currentTotalPrice = todayBillsData.totalPrice || 0;
        const newTotalPrice = currentTotalPrice + reentryFee;
        
        transaction.update(todayBillsDoc.ref, {
          tournaments: updatedTournaments,
          totalPrice: newTotalPrice,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        
        return { success: true, userId, pokerName };
      }
      
      // 13. waitingのcountが0より大きい場合、通常の処理
      console.log(`waitingのcountが${waitingCount}のため、通常のリエントリー処理を実行します`);
      
      // テーブルシートからユーザーを削除
      const updatedSeats = { ...seats };
      updatedSeats[seatUserIdKey] = null;
      updatedSeats[seatPokerNameKey] = null;
      
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
      
      // todaysBillsのtournamentsフィールドを更新
      const existingTournamentInfo = existingTournaments[tournamentId] || {};
      const updatedTournamentInfo = {
        ...existingTournamentInfo,
        reentryCount: (existingTournamentInfo.reentryCount || 0) + 1,
        reentryFee: reentryFee,
        lastReentryAt: admin.firestore.FieldValue.serverTimestamp(),
      };
      
      const updatedTournaments = {
        ...existingTournaments,
        [tournamentId]: updatedTournamentInfo,
      };
      
      // totalPriceにreentryFeeを加算
      const currentTotalPrice = todayBillsData.totalPrice || 0;
      const newTotalPrice = currentTotalPrice + reentryFee;
      
      transaction.update(todayBillsDoc.ref, {
        tournaments: updatedTournaments,
        totalPrice: newTotalPrice,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      
      return { success: true, userId, pokerName };
    });
    
    console.log(`=== Bust＆リエントリー完了 ===`);
    console.log(`ユーザー ${userId} のBust＆リエントリーが完了しました`);
    
    return {
      success: true,
      userId: result.userId,
      message: 'Bust＆リエントリーが完了しました',
    };
    
  } catch (error) {
    console.error('=== Bust＆リエントリーエラー ===');
    console.error(error);
    
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
