import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { z } from "zod";
import { recordTournamentAction } from "../../bills/repos/recordTournamentAction";
import * as crypto from "crypto";
import { writeSingleOperationLog, toErrorSummary } from "../../logs/lib/operationLog";
import { logOpsError, logOpsSuccess } from "../../../shared/logging/logOpsError";
import { FunctionCustomError } from "../../../shared/logging/functionCustomError";
import { findOkibakeLinkedUserConflictInTx } from "../lib/okibakeLinkedUserConflict";
import { getStoreConfig } from "../../../shared/config/configLoader";
import {
  getJstTodayRangeUtc,
  isRegEndAtPast,
  isStartAtWithinRange,
} from "../../../shared/tournament/liffTournamentDateUtils";
import { isTournamentStatusCancelled } from "../../../shared/tournament/mapScheduledTournamentForLiff";

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
      throw new HttpsError('unauthenticated', '認証が必要です');
    }
    
    const userId = request.auth.uid;
    
    const db = admin.firestore();

    const storeConfig = await getStoreConfig(db);
    if (storeConfig.tournament?.liffRegistrationEnabled !== true) {
      throw new FunctionCustomError({
        errorKey: 'TOURNAMENT_LIFF_REGISTRATION_DISABLED',
        message: '参加登録は現在受け付けていません',
        context: { tournamentId },
      });
    }
    
    // トーナメント情報を事前取得
    const tournamentRef = db.collection('scheduledTournaments').doc(tournamentId);
    const tournamentDoc = await tournamentRef.get();
    
    if (!tournamentDoc.exists) {
      throw new FunctionCustomError({
        errorKey: 'TOURNAMENT_INVALID_STATE',
        message: 'トーナメントが存在しません',
        context: { tournamentId },
      });
    }
    
    const tournamentData = tournamentDoc.data()!;
    const tournamentStatus = tournamentData.status as string | undefined;

    if (isTournamentStatusCancelled(tournamentStatus)) {
      throw new FunctionCustomError({
        errorKey: 'TOURNAMENT_CANCELLED',
        message: 'このトーナメントは開催中止になりました',
        context: { tournamentId, status: tournamentStatus },
      });
    }

    if (tournamentStatus === 'ended' || tournamentStatus === 'force_ended') {
      throw new FunctionCustomError({
        errorKey: 'TOURNAMENT_ENDED',
        message: 'トーナメントは終了しました',
        context: { tournamentId, status: tournamentStatus },
      });
    }

    if (tournamentStatus === 'paused') {
      throw new FunctionCustomError({
        errorKey: 'TOURNAMENT_PAUSED',
        message: 'トーナメントは一時停止中です',
        context: { tournamentId, status: tournamentStatus },
      });
    }

    if (tournamentStatus === 'registered' || isRegEndAtPast(tournamentData.regEndAt)) {
      throw new FunctionCustomError({
        errorKey: 'TOURNAMENT_REGISTRATION_CLOSED',
        message: '参加締め切りしました',
        context: { tournamentId, status: tournamentStatus },
      });
    }

    const jstRange = getJstTodayRangeUtc();
    if (!isStartAtWithinRange(tournamentData.startAt, jstRange)) {
      throw new FunctionCustomError({
        errorKey: 'TOURNAMENT_NOT_TODAY',
        message: '本日のトーナメントのみ参加登録できます',
        context: { tournamentId },
      });
    }

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
    const entryFee = snapshot.entryFee || 0;
    
    // activeStaysからbillIdを取得（存在チェックは本callable側の責務）
    const activeStayRef = db.collection('activeStays').doc(userId);
    const activeStayDoc = await activeStayRef.get();
    
    if (!activeStayDoc.exists) {
      throw new FunctionCustomError({
        errorKey: 'TOURNAMENT_INVALID_STATE',
        message: '未入店のため参加登録できません',
        context: { tournamentId, userId, reason: 'active_stay_missing' },
      });
    }

    const activeStayData = activeStayDoc.data()!;
    if (activeStayData.isActive !== true) {
      throw new FunctionCustomError({
        errorKey: 'TOURNAMENT_INVALID_STATE',
        message: '未入店のため参加登録できません',
        context: { tournamentId, userId, reason: 'active_stay_inactive' },
      });
    }

    const billId = activeStayData.billId as string;

    if (!billId) {
      throw new FunctionCustomError({
        errorKey: 'TOURNAMENT_INVALID_STATE',
        message: '未入店のため参加登録できません',
        context: { tournamentId, userId, reason: 'billId_missing_on_active_stay' },
      });
    }
    
    // pokerNameはactiveStaysから取得（todaysBillsには依存しない）
    const pokerName = activeStayData.pokerName || `Player_${userId}`;
    
    // 既に登録済みかチェック（/bills/{billId}/tournaments/{templateId} を確認）
    const billTournamentRef = db.collection('bills').doc(billId).collection('tournaments').doc(templateId);
    const existingTournamentDoc = await billTournamentRef.get();
    if (existingTournamentDoc.exists) {
      throw new FunctionCustomError({
        errorKey: 'TOURNAMENT_ALREADY_REGISTERED',
        message: '既にこのトーナメントに登録済みです',
        context: { tournamentId, userId },
      });
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

      if (Object.prototype.hasOwnProperty.call(currentUsers as Record<string, unknown>, userId)) {
        throw new FunctionCustomError({
          errorKey: 'TOURNAMENT_ALREADY_REGISTERED',
          message: '既にこのトーナメントに登録済みです',
          context: { tournamentId, userId, reason: 'users_list_duplicate' },
        });
      }

      const okibakeConflict = await findOkibakeLinkedUserConflictInTx({
        tx: transaction,
        tournamentRef,
        userId,
      });
      if (okibakeConflict.conflict) {
        throw new FunctionCustomError({
          errorKey: 'TOURNAMENT_PARTICIPANT_CONFLICT_WITH_OKIBAKE',
          message: 'このユーザーは置きバケ対象ユーザーとして登録済みのため、通常参加できません',
          context: {
            tournamentId,
            userId,
            okibakeEntryId: okibakeConflict.okibakeEntryId,
            okibakeBillLinkStatus: okibakeConflict.billLinkStatus,
            okibakeEntryStatus: okibakeConflict.entryStatus,
          },
        });
      }
      
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
      logOpsError({
      message: 'Failed to record tournament action via recordTournamentAction helper:',
      functionEntry: 'registerForTournament',
      operation: 'recordTournamentAction',
      cause: error,
    });
      // エラーを再スローせず、メインのcallableは成功とみなす（ベストエフォート）
      // scheduledTournamentsの更新は成功しているため
    }

    // 操作記録（成功）。巻き戻し可能。LIFF のため deviceId は 'liff'
    const operationId = crypto.randomUUID();
    await writeSingleOperationLog({
      operationId,
      operationName: 'トーナメント登録',
      deviceId: 'liff',
      deviceName: 'LIFF（本人）',
      status: 'succeeded',
      startedAt: null,
      payload: {
        playerUid: result.userId,
        playerName: result.pokerName,
        tournamentId,
        templateId,
        billId,
      },
      tournamentId,
    });

    logOpsSuccess({
      message: 'LIFF用トーナメント参加登録が完了しました',
      functionEntry: 'registerForTournament',
      context: {
        tournamentId,
        userId: result.userId,
        billId,
        templateId,
      },
    });

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
    logOpsError({
      message: '=== LIFF用トーナメント参加登録エラー ===',
      functionEntry: 'registerForTournament',
      operation: 'registerTournamentFlow',
      cause: error,
    });

    const rawData = request.data as Record<string, unknown> | undefined;
    const opId = typeof rawData?.operationId === 'string' ? rawData.operationId : crypto.randomUUID();
    try {
      await writeSingleOperationLog({
        operationId: opId,
        operationName: 'トーナメント登録',
        deviceId: 'liff',
        deviceName: 'LIFF（本人）',
        status: 'failed',
        errorSummary: toErrorSummary(error),
        payload: {},
        tournamentId: typeof rawData?.tournamentId === 'string' ? rawData.tournamentId : undefined,
      });
    } catch (logErr) {
      logOpsError({
      message: 'operationLog 書き込み失敗',
      functionEntry: 'registerForTournament',
      operation: 'recordFailureOperationLog',
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

    if (error instanceof HttpsError) {
      throw error;
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : '不明なエラー',
    };
  }
});
