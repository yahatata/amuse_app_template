import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { z } from 'zod';
import { getCallerDeviceByUid, hasRequiredOption, isActive } from '../../../shared/devices';
import { updatePlace } from '../../bills/repos/updatePlace';
import { writeSingleOperationLog, toErrorSummary } from '../../logs/lib/operationLog';
import type { DeviceDoc } from '../../../shared/devices';
import { logOpsError, logOpsSuccess } from "../../../shared/logging/logOpsError";
import { FunctionCustomError } from '../../../shared/logging/functionCustomError';
import {
  loadLinkedOkibakeEntryIdsForUser,
  syncLinkedOkibakeOnNormalBustInTx,
} from '../lib/syncLinkedOkibakeOnNormalBust';
import { assertTournamentAllowsMutation } from '../lib/assertTournamentAllowsMutation';
import { assertTableDeviceCanAccessTable } from '../../../table_device/lib/shared';
import { appendAvgStackToMainViewUpdate } from '../../../shared/tournament/calculateAvgStack';

// 入力データの検証スキーマ
const bustAndExitSchema = z.object({
  operationId: z.string().min(1, 'operationId は必須です'),
  tournamentId: z.string().min(1),
  tableId: z.string().min(1),
  seatNumber: z.number().int().positive(),
  userId: z.string().min(1),
  deviceName: z.string().optional(),
});

export const bustAndExit = onCall(async (request) => {
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
    const hasPermission =
      device.role === 'admin' ||
      device.role === 'table' ||
      hasRequiredOption(device.options, 'tournament');
    if (!hasPermission) {
      throw new HttpsError('permission-denied', 'トーナメント運営の権限がありません');
    }

    const startedAt = FieldValue.serverTimestamp();
    console.log('=== Bust&退席処理開始 ===');
    const { data } = request;
    console.log('受信データ:', data);

    // 入力検証
    const { operationId, tournamentId, tableId, seatNumber, userId, deviceName } = bustAndExitSchema.parse(data);
    assertTableDeviceCanAccessTable({ device, requestedTableId: tableId });

    console.log(`tournamentId: ${tournamentId}`);
    console.log(`tableId: ${tableId}`);
    console.log(`seatNumber: ${seatNumber}`);
    console.log(`userId: ${userId}`);

    const db = admin.firestore();

    const tournamentDoc = await db.collection('scheduledTournaments').doc(tournamentId).get();
    if (!tournamentDoc.exists) {
      throw new FunctionCustomError({
        errorKey: 'TOURNAMENT_INVALID_STATE',
        message: 'トーナメントが存在しません',
        context: { tournamentId, reason: 'tournament_not_found' },
      });
    }
    assertTournamentAllowsMutation({
      tournamentId,
      status: tournamentDoc.data()?.status as string | undefined,
    });

    // 必要なドキュメントを事前に読み取り
    const tableSeatRef = db
      .collection('scheduledTournaments')
      .doc(tournamentId)
      .collection('tablesSeat')
      .doc(tableId);

    const viewsMainRef = db
      .collection('scheduledTournaments')
      .doc(tournamentId)
      .collection('views')
      .doc('main');

    const bustedRef = db
      .collection('scheduledTournaments')
      .doc(tournamentId)
      .collection('tablesSeat')
      .doc('busted');

    const activeStayRef = db.collection('activeStays').doc(userId);

    // 事前読み取り（bustedDoc は読み取るが、存在しない場合は空オブジェクトをデフォルトとして使用）
    const [tableSeatDoc, viewsMainDoc, bustedDoc, activeStayDoc] = await Promise.all([
      tableSeatRef.get(),
      viewsMainRef.get(),
      bustedRef.get(),
      activeStayRef.get()
    ]);

    // バリデーション
    if (!tableSeatDoc.exists) {
      throw new FunctionCustomError({
        errorKey: 'TOURNAMENT_INVALID_STATE',
        message: `テーブル ${tableId} が存在しません`,
        context: { tournamentId, tableId, reason: 'table_seat_missing' },
      });
    }

    if (!viewsMainDoc.exists) {
      throw new FunctionCustomError({
        errorKey: 'TOURNAMENT_INVALID_STATE',
        message: 'トーナメントのviews/mainドキュメントが存在しません',
        context: { tournamentId, reason: 'views_main_missing' },
      });
    }

    // activeStaysの存在チェック（本callable側の責務）
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

    const tableSeatData = tableSeatDoc.data()!;
    const seats = tableSeatData.seats || {};

    // 指定されたシートの確認
    const seatNumberStr = seatNumber.toString().padStart(2, '0');
    const seatUserIdKey = `seat${seatNumberStr}UserId`;
    const seatPokerNameKey = `seat${seatNumberStr}PokerName`;
    const seatOkibakeEntryIdKey = `seat${seatNumberStr}OkibakeEntryId`;

    const currentUserId = seats[seatUserIdKey];
    if (currentUserId !== userId) {
      throw new FunctionCustomError({
        errorKey: 'TOURNAMENT_INVALID_STATE',
        message: `シート ${seatNumber} には別のユーザーが座っています`,
        context: { tournamentId, tableId, seatNumber, userId, reason: 'seat_user_mismatch' },
      });
    }

    const viewsMainData = viewsMainDoc.data()!;
    const currentPlayersBusted = viewsMainData.playersBusted || 0;
    const snapshot = tournamentDoc.data()?.snapshot ?? {};

    // bustedUser を取得（存在しない場合は空オブジェクトをデフォルトとして使用）
    const bustedData = bustedDoc.exists ? bustedDoc.data()! : { bustedUser: {} };
    const bustedUser = bustedData.bustedUser || {};

    // プレイヤー名を取得
    const pokerName = seats[seatPokerNameKey];
    const seatOkibakeEntryId =
      typeof seats[seatOkibakeEntryIdKey] === 'string' ? seats[seatOkibakeEntryIdKey] : null;

    const tournamentRef = db.collection('scheduledTournaments').doc(tournamentId);
    const linkedOkibakeEntryIds = await loadLinkedOkibakeEntryIdsForUser(
      db,
      tournamentId,
      userId,
    );

    // トランザクションで処理を実行
    const result = await db.runTransaction(async (transaction) => {
      await syncLinkedOkibakeOnNormalBustInTx({
        transaction,
        tournamentRef,
        userId,
        mode: 'exit',
        tableId,
        seatNumber,
        seatOkibakeEntryId,
        preloadedEntryIds: linkedOkibakeEntryIds,
        now: admin.firestore.FieldValue.serverTimestamp(),
      });

      // 1. シートからユーザーを削除
      const updatedSeats = { ...seats };
      updatedSeats[seatUserIdKey] = null;
      updatedSeats[seatPokerNameKey] = null;
      updatedSeats[seatOkibakeEntryIdKey] = null;

      transaction.update(tableSeatRef, {
        seats: updatedSeats,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      // 2. scheduledTournaments/views/mainを更新
      transaction.update(
        viewsMainRef,
        appendAvgStackToMainViewUpdate(
          {
            playersBusted: currentPlayersBusted + 1,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          viewsMainData,
          snapshot,
        ),
      );

      // 3. bustedドキュメントに退席情報を追加（merge: true で存在しない場合は自動作成）
      const updatedBustedUser = {
        ...bustedUser,
        [userId]: {
          pokerName: pokerName,
          bustAt: admin.firestore.FieldValue.serverTimestamp(),
        },
      };

      transaction.set(bustedRef, {
        bustedUser: updatedBustedUser,
      }, { merge: true });

      // billIdを返して、トランザクション外でupdatePlaceを呼び出す
      return { success: true, userId, tableId, seatNumber, billId };
    });
    
    // トランザクション完了後、トランザクション外でupdatePlaceを呼び出す
    if (result.billId) {
      try {
        await updatePlace({
          billId: result.billId,
          table: null,
          seat: null,
        });
      } catch (error) {
        logOpsError({
      message: 'updatePlace failed',
      functionEntry: 'bustAndExit',
      operation: 'updatePlaceBestEffort',
      cause: error,
    });
        // updatePlaceの失敗は警告ログのみ（scheduledTournamentsの更新は成功している）
      }
    }

    // 操作記録（成功）。op-103。卓単位のため tableId/tournamentId をトップレベルに付与
    await writeSingleOperationLog({
      operationId,
      operationName: 'バスト＆退店',
      deviceId: device.id,
      deviceName: deviceName ?? device.name ?? undefined,
      status: 'succeeded',
      startedAt,
      tournamentId,
      tableId,
      payload: {
        playerUid: userId,
        playerName: pokerName,
        tableId,
        seatNumber,
        billId: result.billId,
      },
    });

    logOpsSuccess({
      message: 'Bust&退席が完了しました',
      functionEntry: 'bustAndExit',
      context: {
        tournamentId,
        userId,
        tableId,
        seatNumber,
        billId: result.billId,
        callerUid,
        deviceId: device.id,
      },
    });

    return {
      success: true,
      userId: result.userId,
      message: 'Bust&退席が完了しました',
    };

  } catch (error) {
    logOpsError({
      message: '=== Bust&退席エラー ===',
      functionEntry: 'bustAndExit',
      operation: 'bustAndExitMainCatch',
      cause: error,
    });

    const rawData = request.data as Record<string, unknown> | undefined;
    const opId = typeof rawData?.operationId === 'string' ? rawData.operationId : undefined;
    if (opId && device != null) {
      try {
        await writeSingleOperationLog({
          operationId: opId,
          operationName: 'バスト＆退店',
          deviceId: device.id,
          deviceName: typeof rawData?.deviceName === 'string' ? rawData.deviceName : device.name ?? undefined,
          status: 'failed',
          errorSummary: toErrorSummary(error),
          payload: {},
        });
      } catch (logErr) {
        logOpsError({
      message: 'operationLog 書き込み失敗',
      functionEntry: 'bustAndExit',
      operation: 'bustAndExitOperationLogWrite',
      cause: logErr,
    });
      }
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

    if (error instanceof Error) {
      return {
        success: false,
        error: error.message,
      };
    }

    return {
      success: false,
      error: '不明なエラーが発生しました',
    };
  }
});
