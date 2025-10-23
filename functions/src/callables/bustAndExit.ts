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

    const todayBillsQuery = db.collection('todaysBills')
      .where('userId', '==', userId)
      .where('status', '==', 'open')
      .limit(1);

    // 事前読み取り
    const [tableSeatDoc, viewsMainDoc, bustedDoc, todayBillsSnapshot] = await Promise.all([
      tableSeatRef.get(),
      viewsMainRef.get(),
      bustedRef.get(),
      todayBillsQuery.get()
    ]);

    // バリデーション
    if (!tableSeatDoc.exists) {
      throw new Error(`テーブル ${tableId} が存在しません`);
    }

    if (!viewsMainDoc.exists) {
      throw new Error('トーナメントのviews/mainドキュメントが存在しません');
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

      // 3. bustedドキュメントに退席情報を追加
      const updatedBustedUser = { ...bustedUser };
      updatedBustedUser[userId] = {
        pokerName: pokerName,
        bustAt: admin.firestore.FieldValue.serverTimestamp(),
      };

      transaction.update(bustedRef, {
        bustedUser: updatedBustedUser,
      });

      // 4. todaysBillsのcurrentTable/currentSeatをnullに設定
      if (!todayBillsSnapshot.empty) {
        const todayBillsDoc = todayBillsSnapshot.docs[0];
        transaction.update(todayBillsDoc.ref, {
          currentTable: null,
          currentSeat: null,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }

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
