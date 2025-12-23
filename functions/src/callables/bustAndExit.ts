import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { z } from 'zod';
import { getCallerDeviceByUid, hasRequiredOption, isActive } from '../lib/devicePermissions';
import { updatePlace } from '../helpers/billsApi/updatePlace';

// 入力データの検証スキーマ
const bustAndExitSchema = z.object({
  tournamentId: z.string().min(1),
  tableId: z.string().min(1),
  seatNumber: z.number().int().positive(),
  userId: z.string().min(1),
});

export const bustAndExit = functions.https.onCall(async (data, context: any) => {
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
    console.log('=== Bust&退席処理開始 ===');
    console.log('受信データ:', data);

    // 入力検証
    const actualData = data.data || data;
    const { tournamentId, tableId, seatNumber, userId } = bustAndExitSchema.parse(actualData);

    console.log(`tournamentId: ${tournamentId}`);
    console.log(`tableId: ${tableId}`);
    console.log(`seatNumber: ${seatNumber}`);
    console.log(`userId: ${userId}`);

    const db = admin.firestore();

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
      throw new Error(`テーブル ${tableId} が存在しません`);
    }

    if (!viewsMainDoc.exists) {
      throw new Error('トーナメントのviews/mainドキュメントが存在しません');
    }

    // activeStaysの存在チェック（本callable側の責務）
    if (!activeStayDoc.exists) {
      throw new Error(`ユーザー ${userId} のactiveStaysドキュメントが存在しません`);
    }

    const activeStayData = activeStayDoc.data()!;
    const billId = activeStayData.billId as string;

    if (!billId) {
      throw new Error(`ユーザー ${userId} のactiveStaysにbillIdが設定されていません`);
    }

    const tableSeatData = tableSeatDoc.data()!;
    const seats = tableSeatData.seats || {};

    // 指定されたシートの確認
    const seatNumberStr = seatNumber.toString().padStart(2, '0');
    const seatUserIdKey = `seat${seatNumberStr}UserId`;
    const seatPokerNameKey = `seat${seatNumberStr}PokerName`;

    const currentUserId = seats[seatUserIdKey];
    if (currentUserId !== userId) {
      throw new Error(`シート ${seatNumber} には別のユーザーが座っています`);
    }

    const viewsMainData = viewsMainDoc.data()!;
    const currentPlayersBusted = viewsMainData.playersBusted || 0;

    // bustedUser を取得（存在しない場合は空オブジェクトをデフォルトとして使用）
    const bustedData = bustedDoc.exists ? bustedDoc.data()! : { bustedUser: {} };
    const bustedUser = bustedData.bustedUser || {};

    // プレイヤー名を取得
    const pokerName = seats[seatPokerNameKey];

    // トランザクションで処理を実行
    const result = await db.runTransaction(async (transaction) => {
      // 全ての読み取りが完了したので、ここから書き込み操作を開始

      // 1. シートからユーザーを削除
      const updatedSeats = { ...seats };
      updatedSeats[seatUserIdKey] = null;
      updatedSeats[seatPokerNameKey] = null;

      transaction.update(tableSeatRef, {
        seats: updatedSeats,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      // 2. scheduledTournaments/views/mainを更新
      transaction.update(viewsMainRef, {
        playersBusted: currentPlayersBusted + 1,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

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
        console.error('updatePlace failed', error);
        // updatePlaceの失敗は警告ログのみ（scheduledTournamentsの更新は成功している）
      }
    }

    console.log(`=== Bust&退席完了 ===`);
    console.log(`ユーザー ${userId} のBust&退席が完了しました`);

    return {
      success: true,
      userId: result.userId,
      message: 'Bust&退席が完了しました',
    };

  } catch (error) {
    console.error('=== Bust&退席エラー ===');
    console.error(error);

    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: '入力検証エラー',
        details: error.errors,
      };
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
