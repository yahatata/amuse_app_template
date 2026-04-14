import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { z } from 'zod';
import { getCallerDeviceByUid, hasRequiredOption, isActive } from '../../../shared/devices';
import { recordTournamentAction } from '../../bills/repos/recordTournamentAction';
import * as crypto from 'crypto';
import { writeSingleOperationLog, toErrorSummary } from '../../logs/lib/operationLog';
import { logOpsError } from "../../../shared/logging/logOpsError";
import { FunctionCustomError } from '../../../shared/logging/functionCustomError';

// 入力スキーマ
const registerParticipantsSchema = z.object({
  tournamentId: z.string(),
  userIds: z.array(z.string()),
  operationId: z.string().optional(),
});

interface RegistrationResult {
  success: boolean;
  userId: string;
  error?: string;
}

/** 巻き戻し用に保存する1ユーザー分の情報 */
interface SuccessDetail {
  playerUid: string;
  playerName: string;
  billId: string;
  templateId: string;
  isReentry: boolean;
}

export const registerParticipants = onCall(async (request) => {
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
    // データを取得
    const { data } = request;
    
    // 入力検証
    const { tournamentId, userIds, operationId: clientOperationId } = registerParticipantsSchema.parse(data);
    const operationId = clientOperationId ?? crypto.randomUUID();

    console.log(`=== 参加者登録開始 ===`);
    console.log(`tournamentId: ${tournamentId}`);
    console.log(`userIds: ${userIds}`);
    console.log(`登録対象者数: ${userIds.length}`);
    
    const db = admin.firestore();
    const results: RegistrationResult[] = [];
    const successDetails: SuccessDetail[] = [];

    // トーナメント情報を事前取得
    const tournamentRef = db.collection('scheduledTournaments').doc(tournamentId);
    const tournamentDoc = await tournamentRef.get();
    
    if (!tournamentDoc.exists) {
      throw new FunctionCustomError({
        errorKey: 'TOURNAMENT_INVALID_STATE',
        message: 'トーナメントが存在しません',
        context: { tournamentId, reason: 'tournament_not_found' },
      });
    }

    const tournamentData = tournamentDoc.data()!;
    const templateId = tournamentData.templateId;
    const startAt = tournamentData.startAt;
    const snapshot = tournamentData.snapshot;

    if (!snapshot) {
      throw new FunctionCustomError({
        errorKey: 'TOURNAMENT_INVALID_STATE',
        message: 'トーナメントのスナップショット情報が存在しません',
        context: { tournamentId, reason: 'snapshot_missing' },
      });
    }

    if (!templateId) {
      throw new FunctionCustomError({
        errorKey: 'TOURNAMENT_INVALID_STATE',
        message: 'トーナメントのtemplateIdが存在しません',
        context: { tournamentId, reason: 'templateId_missing' },
      });
    }
    
    const templateName = snapshot.name;
    const entryFee = snapshot.entryFee;
    const reentryFee = snapshot.reentryFee || 0;
    const addonFee = snapshot.addonFee || 0;
    
    // 各ユーザーを順次処理
    for (const userId of userIds) {
      try {
        console.log(`ユーザー ${userId} の登録処理開始`);
        
        const result = await db.runTransaction(async (transaction) => {
          // 1. activeStaysからbillIdを取得（存在チェックは本callable側の責務）
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
          
          // pokerNameはactiveStaysから取得（billsには依存しない）
          const pokerName = activeStayData.pokerName || `Player_${userId}`;
          
          // 2. scheduledTournaments/views/mainを取得
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
          const currentPlayersIn = viewsMainData.playersIn || 0;
          const currentEntries = viewsMainData.entries || 0;
          const currentWaitingCount = viewsMainData.waitingCount || 0;
          
          // 3. scheduledTournaments/tablesSeat/waitingを取得
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
          
          // 4. scheduledTournaments/views/usersListを取得
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
          
          // 5. リエントリー時にbustedを更新するため、先に読み取り（トランザクションは「全読取→全書込」の順が必須）
          const bustedRef = db
            .collection('scheduledTournaments')
            .doc(tournamentId)
            .collection('tablesSeat')
            .doc('busted');
          const bustedDoc = await transaction.get(bustedRef);
          const bustedData = bustedDoc.exists ? bustedDoc.data()! : null;
          const currentBustedUser = bustedData?.bustedUser || {};
          
          // 全ての読み取りが完了したので、ここから書き込み操作を開始
          
          // 6. scheduledTournaments/views/mainを更新（リエントリー判定）
          if (isUserAlreadyRegistered) {
            // リエントリーの場合
            const currentReentries = viewsMainData.reentries || 0;
            transaction.update(viewsMainRef, {
              playersIn: currentPlayersIn + 1,
              reentries: currentReentries + 1,
              waitingCount: currentWaitingCount + 1,
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
            
            // bustedから該当ユーザーを削除（読み取りは上で済み）
            if (currentBustedUser[userId]) {
              const updatedBustedUser = { ...currentBustedUser };
              delete updatedBustedUser[userId];
              transaction.update(bustedRef, {
                bustedUser: updatedBustedUser,
              });
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
          
          // 7. scheduledTournaments/tablesSeat/waitingを更新
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
          
          // 8. scheduledTournaments/views/usersListにユーザー情報を記録
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
          
          return { 
            success: true, 
            userId, 
            pokerName, 
            billId, 
            templateId, 
            isUserAlreadyRegistered,
            entryFee,
            reentryFee,
            addonFee,
            templateName,
            startAt: startAt ? (startAt as admin.firestore.Timestamp) : null,
          };
        });
        
        // トランザクション完了後、recordTournamentActionを呼び出す（トランザクション外で実行）
        const clientNonce = crypto.randomUUID();
        const idempotencyKey = `${result.billId}:recordTournamentAction:${result.isUserAlreadyRegistered ? 'reentry' : 'entry'}:${clientNonce}`;
        
        try {
          await recordTournamentAction({
            billId: result.billId,
            templateId: result.templateId,
            action: result.isUserAlreadyRegistered ? 'reentry' : 'entry',
            templateName: result.templateName,
            // 初回エントリーの場合：entryFeeInclを設定、reentryFeeInclとaddonFeeInclも将来のために設定
            // リエントリーの場合：reentryFeeInclを設定、entryFeeInclとaddonFeeInclも将来のために設定
            entryFeeIncl: result.isUserAlreadyRegistered ? null : result.entryFee,
            reentryFeeIncl: result.isUserAlreadyRegistered ? result.reentryFee : (result.reentryFee > 0 ? result.reentryFee : null),
            addonFeeIncl: result.addonFee > 0 ? result.addonFee : null,
            startAt: result.startAt,
            idempotencyKey,
          });
        } catch (error) {
          logOpsError({
      message: `Failed to record tournament action for user ${result.userId}:`,
      functionEntry: 'registerParticipants',
      operation: 'recordActionPerUserBestEffort',
      cause: error,
    });
          // エラーを再スローせず、メインのcallableは成功とみなす（ベストエフォート）
          // scheduledTournamentsの更新は成功しているため
        }
        
        results.push({ success: true, userId: result.userId });
        successDetails.push({
          playerUid: result.userId,
          playerName: result.pokerName,
          billId: result.billId,
          templateId: result.templateId,
          isReentry: result.isUserAlreadyRegistered,
        });
        console.log(`ユーザー ${userId} の登録完了`);
      } catch (error) {
        logOpsError({
      message: `ユーザー ${userId} の登録失敗:`,
      functionEntry: 'registerParticipants',
      operation: 'registerUserFailed',
      cause: error,
    });
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
    
    // 1人以上成功していれば操作記録を残す（巻き戻しは成功分のみ対象）
    if (successDetails.length > 0) {
      await writeSingleOperationLog({
        operationId,
        operationName: '参加者一括登録',
        deviceId: device.id,
        deviceName: device.name ?? undefined,
        status: 'succeeded',
        startedAt: null,
        payload: {
          playerUids: successDetails.map((d) => d.playerUid),
          playerNames: successDetails.map((d) => d.playerName),
          details: successDetails,
        },
        tournamentId,
      });
    }

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
    logOpsError({
      message: '=== 参加者登録エラー ===',
      functionEntry: 'registerParticipants',
      operation: 'registerParticipantsMainCatch',
      cause: error,
    });

    const rawData = request.data as Record<string, unknown> | undefined;
    const opId = (typeof rawData?.operationId === 'string' ? rawData.operationId : null) ?? crypto.randomUUID();
    try {
      await writeSingleOperationLog({
        operationId: opId,
        operationName: '参加者一括登録',
        deviceId: device?.id ?? 'unknown',
        deviceName: device?.name ?? undefined,
        status: 'failed',
        errorSummary: toErrorSummary(error),
        payload: {},
        tournamentId: typeof rawData?.tournamentId === 'string' ? rawData.tournamentId : undefined,
      });
    } catch (logErr) {
      logOpsError({
      message: 'operationLog 書き込み失敗',
      functionEntry: 'registerParticipants',
      operation: 'registerParticipantsOperationLogWrite',
      cause: logErr,
    });
    }

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
