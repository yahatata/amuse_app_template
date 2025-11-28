import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { z } from 'zod';
import { getCallerDeviceByUid, hasRequiredOption, isActive } from '../lib/devicePermissions';

// 入力スキーマ
const registerParticipantsSchema = z.object({
  tournamentId: z.string(),
  userIds: z.array(z.string()),
});

interface RegistrationResult {
  success: boolean;
  userId: string;
  error?: string;
}

export const registerParticipants = functions.https.onCall(async (data, context: any) => {
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
    const { tournamentId, userIds } = registerParticipantsSchema.parse(actualData);
    
    console.log(`=== 参加者登録開始 ===`);
    console.log(`tournamentId: ${tournamentId}`);
    console.log(`userIds: ${userIds}`);
    console.log(`登録対象者数: ${userIds.length}`);
    
    const db = admin.firestore();
    const results: RegistrationResult[] = [];
    
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
    
    // 各ユーザーを順次処理
    for (const userId of userIds) {
      try {
        console.log(`ユーザー ${userId} の登録処理開始`);
        
        const result = await db.runTransaction(async (transaction) => {
          // 1. todaysBillsからユーザー情報を取得（userIdでクエリ）
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
          
          // 2. 既に登録済みかチェック（再参加を許可するため、エラーは投げない）
          const existingTournaments = todayBillsData.tournaments || {};
          
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
          
          // 既にwaitingに存在するかチェック（再参加を許可するため、エラーは投げない）
          
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
          const isUserAlreadyRegistered = currentUsers[userId] ? true : false;
          
          // 6. トーナメント情報を取得（リエントリーフィー用）
          const tournamentRef = db.collection('scheduledTournaments').doc(tournamentId);
          const tournamentDoc = await transaction.get(tournamentRef);
          if (!tournamentDoc.exists) {
            throw new Error('トーナメントが存在しません');
          }
          const tournamentData = tournamentDoc.data()!;
          const reentryFee = tournamentData.snapshot?.reentryFee || 0;
          
          // 全ての読み取りが完了したので、ここから書き込み操作を開始
          
          // 7. scheduledTournaments/views/mainを更新（リエントリー判定）
          if (isUserAlreadyRegistered) {
            // リエントリーの場合
            const currentReentries = viewsMainData.reentries || 0;
            transaction.update(viewsMainRef, {
              playersIn: currentPlayersIn + 1,
              reentries: currentReentries + 1,
              waitingCount: currentWaitingCount + 1,
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
            
            // bustedから該当ユーザーを削除
            const bustedRef = db
              .collection('scheduledTournaments')
              .doc(tournamentId)
              .collection('tablesSeat')
              .doc('busted');
            
            const bustedDoc = await transaction.get(bustedRef);
            if (bustedDoc.exists) {
              const bustedData = bustedDoc.data()!;
              const bustedUser = bustedData.bustedUser || {};
              
              if (bustedUser[userId]) {
                delete bustedUser[userId];
                transaction.update(bustedRef, {
                  bustedUser: bustedUser,
                });
              }
            }
          } else {
            // 初回エントリーの場合
            transaction.update(viewsMainRef, {
              playersIn: currentPlayersIn + 1,
              entries: currentEntries + 1,
              waitingCount: currentWaitingCount + 1,
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
          }
          
          // 8. scheduledTournaments/tablesSeat/waitingを更新
          if (!waitingExists) {
            // waitingドキュメントが存在しない場合は作成（ハイブリッド形式）
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
            // 既存のwaitingドキュメントを更新（ハイブリッド形式）
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
          
          // 9. todaysBillsのtournamentsフィールドを更新（リエントリー判定）
          const existingTournamentInfo = existingTournaments[tournamentId] || {};
          let updatedTournamentInfo;
          
          if (isUserAlreadyRegistered) {
            // リエントリーの場合
            const currentReentryCount = existingTournamentInfo.reentryCount || 0;
            updatedTournamentInfo = {
              ...existingTournamentInfo,
              reentryCount: currentReentryCount + 1,
              reentryFee: reentryFee,
              lastReentryAt: admin.firestore.FieldValue.serverTimestamp(),
            };
          } else {
            // 初回エントリーの場合
            updatedTournamentInfo = {
              startAt: startAt,
              templateName: templateName,
              templateId: tournamentId, // templateIdを追加
              entryFee: entryFee,
              registeredAt: admin.firestore.FieldValue.serverTimestamp(),
            };
          }
          
          const updatedTournaments = {
            ...existingTournaments,
            [tournamentId]: updatedTournamentInfo,
          };
          
          // totalPriceに料金を加算
          const currentTotalPrice = todayBillsData.totalPrice || 0;
          let newTotalPrice = currentTotalPrice;
          
          if (isUserAlreadyRegistered) {
            // リエントリーの場合
            newTotalPrice = currentTotalPrice + reentryFee;
          } else {
            // 初回エントリーの場合
            newTotalPrice = currentTotalPrice + entryFee;
          }
          
          transaction.update(todayBillsDoc.ref, {
            tournaments: updatedTournaments,
            totalPrice: newTotalPrice,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });

          // 10. scheduledTournaments/views/usersListにユーザー情報を記録
          if (usersListExists && !isUserAlreadyRegistered) {
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
          
          return { success: true, userId, pokerName };
        });
        
        results.push({ success: true, userId: result.userId });
        console.log(`ユーザー ${userId} の登録完了`);
        
      } catch (error) {
        console.error(`ユーザー ${userId} の登録失敗:`, error);
        results.push({ 
          success: false, 
          userId, 
          error: error instanceof Error ? error.message : '不明なエラー'
        });
      }
    }
    
    // 結果集計
    const successCount = results.filter(r => r.success).length;
    const failureCount = results.filter(r => !r.success).length;
    
    console.log(`=== 参加者登録完了 ===`);
    console.log(`成功: ${successCount}人`);
    console.log(`失敗: ${failureCount}人`);
    
    return {
      success: true,
      results: results,
      summary: {
        total: userIds.length,
        success: successCount,
        failure: failureCount,
      }
    };
    
  } catch (error) {
    console.error('=== 参加者登録エラー ===');
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
