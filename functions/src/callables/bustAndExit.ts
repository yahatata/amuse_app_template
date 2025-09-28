import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { z } from 'zod';

// 入力データの検証スキーマ
const bustAndExitSchema = z.object({
  tournamentId: z.string().min(1),
  tableId: z.string().min(1),
  seatNumber: z.number().int().positive(),
  userId: z.string().min(1),
});

export const bustAndExit = functions.https.onCall(async (data, context) => {
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

    // トランザクションで処理を実行
    const result = await db.runTransaction(async (transaction) => {
      // 1. scheduledTournaments/{tournamentId}/tablesSeat/{tableId}を取得
      const tableSeatRef = db
        .collection('scheduledTournaments')
        .doc(tournamentId)
        .collection('tablesSeat')
        .doc(tableId);

      const tableSeatDoc = await transaction.get(tableSeatRef);
      if (!tableSeatDoc.exists) {
        throw new Error(`テーブル ${tableId} が存在しません`);
      }

      const tableSeatData = tableSeatDoc.data()!;
      const seats = tableSeatData.seats || {};

      // 2. 指定されたシートの確認
      const seatNumberStr = seatNumber.toString().padStart(2, '0');
      const seatUserIdKey = `seat${seatNumberStr}UserId`;
      const seatPokerNameKey = `seat${seatNumberStr}PokerName`;

      const currentUserId = seats[seatUserIdKey];
      if (currentUserId !== userId) {
        throw new Error(`シート ${seatNumber} には別のユーザーが座っています`);
      }

      // 3. scheduledTournaments/{tournamentId}/views/mainを取得
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

      // 6. bustedドキュメントを取得（読み取り操作を先に実行）
      const bustedRef = db
        .collection('scheduledTournaments')
        .doc(tournamentId)
        .collection('tablesSeat')
        .doc('busted');

      const bustedDoc = await transaction.get(bustedRef);
      const bustedData = bustedDoc.exists ? bustedDoc.data()! : { bustedUser: {} };
      const bustedUser = bustedData.bustedUser || {};

      // 全ての読み取りが完了したので、ここから書き込み操作を開始

      // 4. シートからユーザーを削除
      const updatedSeats = { ...seats };
      updatedSeats[seatUserIdKey] = null;
      updatedSeats[seatPokerNameKey] = null;

      transaction.update(tableSeatRef, {
        seats: updatedSeats,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      // 5. scheduledTournaments/views/mainを更新
      transaction.update(viewsMainRef, {
        playersBusted: currentPlayersBusted + 1,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      // 6. bustedドキュメントに退席情報を追加
      // プレイヤー名を取得
      const pokerName = seats[seatPokerNameKey];
      
      // bustedUserに追加
      bustedUser[userId] = {
        pokerName: pokerName,
        bustAt: admin.firestore.FieldValue.serverTimestamp(),
      };

      transaction.update(bustedRef, {
        bustedUser: bustedUser,
      });

      return { success: true, userId, tableId, seatNumber };
    });

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
