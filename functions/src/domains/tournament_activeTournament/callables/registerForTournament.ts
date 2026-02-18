import { onCall } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { z } from "zod";
import { recordTournamentAction } from "../../bills/repos/recordTournamentAction";
import * as crypto from "crypto";

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
    const templateId = tournamentData.templateId;
    const startAt = tournamentData.startAt;
    const snapshot = tournamentData.snapshot;
    
    if (!snapshot) {
      throw new Error('トーナメントのスナップショット情報が存在しません');
    }
    
    if (!templateId) {
      throw new Error('トーナメントのtemplateIdが存在しません');
    }
    
    const templateName = snapshot.name;
    const entryFee = snapshot.entryFee || 0;
    
    // activeStaysからbillIdを取得（存在チェックは本callable側の責務）
    const activeStayRef = db.collection('activeStays').doc(userId);
    const activeStayDoc = await activeStayRef.get();
    
    if (!activeStayDoc.exists) {
      throw new Error(`ユーザー ${userId} のactiveStaysドキュメントが存在しません`);
    }
    
    const activeStayData = activeStayDoc.data()!;
    const billId = activeStayData.billId as string;
    
    if (!billId) {
      throw new Error(`ユーザー ${userId} のactiveStaysにbillIdが設定されていません`);
    }
    
    // pokerNameはactiveStaysから取得（todaysBillsには依存しない）
    const pokerName = activeStayData.pokerName || `Player_${userId}`;
    
    // 既に登録済みかチェック（/bills/{billId}/tournaments/{templateId} を確認）
    const billTournamentRef = db.collection('bills').doc(billId).collection('tournaments').doc(templateId);
    const existingTournamentDoc = await billTournamentRef.get();
    if (existingTournamentDoc.exists) {
      throw new Error('既にこのトーナメントに登録済みです');
    }
    
    // トランザクションで登録処理を実行
    const result = await db.runTransaction(async (transaction) => {
      
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
      
      // 8. todaysBillsのtournamentsフィールドへの直接更新は削除（recordTournamentAction内のDualWriteに集約）

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
    
    // トランザクション完了後、recordTournamentActionを呼び出す（トランザクション外で実行）
    const clientNonce = crypto.randomUUID();
    const idempotencyKey = `${billId}:recordTournamentAction:entry:${clientNonce}`;
    
    try {
      await recordTournamentAction({
        billId,
        templateId,
        action: 'entry',
        templateName,
        entryFeeIncl: entryFee,
        reentryFeeIncl: null,
        addonFeeIncl: null,
        startAt: startAt ? (startAt as admin.firestore.Timestamp) : null,
        idempotencyKey,
      });
    } catch (error) {
      console.error('Failed to record tournament action via recordTournamentAction helper:', error);
      // エラーを再スローせず、メインのcallableは成功とみなす（ベストエフォート）
      // scheduledTournamentsの更新は成功しているため
    }
    
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
