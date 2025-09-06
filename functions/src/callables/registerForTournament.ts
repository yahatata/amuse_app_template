import { onCall } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { z } from "zod";

// 入力スキーマ
const registerForTournamentSchema = z.object({
  tournamentId: z.string(),
});

export const registerForTournament = onCall(async (request) => {
  try {
    // 入力検証
    const { tournamentId } = registerForTournamentSchema.parse(request.data);
    
    // 認証確認
    if (!request.auth) {
      throw new Error('認証が必要です');
    }
    
    const userId = request.auth.uid;
    
    console.log(`=== LIFF用トーナメント参加登録開始 ===`);
    console.log(`userId: ${userId}`);
    console.log(`tournamentId: ${tournamentId}`);
    
    const db = admin.firestore();
    
    // トーナメント情報を事前取得
    const tournamentRef = db.collection('scheduledTournaments').doc(tournamentId);
    const tournamentDoc = await tournamentRef.get();
    
    if (!tournamentDoc.exists) {
      throw new Error('トーナメントが存在しません');
    }
    
    const tournamentData = tournamentDoc.data()!;
    const startAt = tournamentData.startAt;
    const snapshot = tournamentData.snapshot;
    
    if (!snapshot) {
      throw new Error('トーナメントのスナップショット情報が存在しません');
    }
    
    const templateName = snapshot.name;
    const entryFee = snapshot.entryFee;
    
    // トランザクションで登録処理を実行
    const result = await db.runTransaction(async (transaction) => {
      // 1. todaysBillsからユーザー情報を取得
      const todayBillsQuery = db.collection('todaysBills')
        .where('userId', '==', userId)
        .where('status', '==', 'open')
        .limit(1);
      
      const todayBillsSnapshot = await transaction.get(todayBillsQuery);
      
      if (todayBillsSnapshot.empty) {
        throw new Error('ユーザーのオープンなtodaysBillsドキュメントが存在しません');
      }
      
      const todayBillsDoc = todayBillsSnapshot.docs[0];
      const todayBillsData = todayBillsDoc.data();
      const pokerName = todayBillsData.pokerName || `Player_${userId}`;
      
      // 2. 既に登録済みかチェック
      const existingTournaments = todayBillsData.tournaments || {};
      if (existingTournaments[tournamentId]) {
        throw new Error('既にこのトーナメントに登録済みです');
      }
      
      // 3. scheduledTournaments/views/mainを取得
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
      const currentPlayersIn = viewsMainData.playersIn || 0;
      const currentEntries = viewsMainData.entries || 0;
      const currentWaitingCount = viewsMainData.waitingCount || 0;
      
      // 4. scheduledTournaments/tablesSeat/waitingを取得
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
      
      // 5. scheduledTournaments/views/usersListを取得
      const usersListRef = db
        .collection('scheduledTournaments')
        .doc(tournamentId)
        .collection('views')
        .doc('usersList');
      
      const usersListDoc = await transaction.get(usersListRef);
      const usersListExists = usersListDoc.exists;
      const usersListData = usersListExists ? usersListDoc.data()! : null;
      const currentUsers = usersListData?.users || {};
      
      // 全ての読み取りが完了したので、ここから書き込み操作を開始
      
      // 6. scheduledTournaments/views/mainを更新（初回エントリー）
      transaction.update(viewsMainRef, {
        playersIn: currentPlayersIn + 1,
        entries: currentEntries + 1,
        waitingCount: currentWaitingCount + 1,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      
      // 7. scheduledTournaments/tablesSeat/waitingを更新
      if (!waitingExists) {
        // waitingドキュメントが存在しない場合は作成
        transaction.set(waitingRef, {
          count: 1,
          waiting: {
            [userId]: {
              pokerName: pokerName,
              joinedAt: admin.firestore.FieldValue.serverTimestamp(),
              order: 1
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
              order: maxOrder + 1
            }
          },
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }
      
      // 8. todaysBillsのtournamentsフィールドを更新（初回エントリー）
      const updatedTournamentInfo = {
        startAt: startAt,
        templateName: templateName,
        entryFee: entryFee,
        registeredAt: admin.firestore.FieldValue.serverTimestamp(),
      };
      
      const updatedTournaments = {
        ...existingTournaments,
        [tournamentId]: updatedTournamentInfo,
      };
      
      transaction.update(todayBillsDoc.ref, {
        tournaments: updatedTournaments,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      // 9. scheduledTournaments/views/usersListにユーザー情報を記録
      if (usersListExists) {
        const updatedUsers = {
          ...currentUsers,
          [userId]: {
            pokerName: pokerName,
            registeredAt: admin.firestore.FieldValue.serverTimestamp(),
            lastUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
          }
        };
        
        transaction.update(usersListRef, {
          users: updatedUsers,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }
      
      return { success: true, userId, pokerName, tournamentName: templateName };
    });
    
    console.log(`=== LIFF用トーナメント参加登録完了 ===`);
    console.log(`ユーザー ${result.userId} がトーナメント ${result.tournamentName} に参加登録しました`);
    
    return {
      success: true,
      message: 'トーナメントに参加登録しました',
      data: {
        tournamentId,
        tournamentName: result.tournamentName,
        pokerName: result.pokerName,
        registeredAt: new Date().toISOString(),
      }
    };
    
  } catch (error) {
    console.error('=== LIFF用トーナメント参加登録エラー ===');
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
