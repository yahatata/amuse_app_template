/**
 * leaveSeat
 * 
 * サイドゲームからの退席処理
 * 
 * 新スキーマ対応:
 * - activeStays/{userId} から billId を取得
 * - updatePlace ヘルパAPIを使用して bills.place を更新
 */

import { onCall } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { updatePlace } from '../helpers/billsApi/updatePlace';

export const leaveSeat = onCall(async (request) => {
  const db = getFirestore();
  const { tableId, seatNumber, userId } = request.data;

  try {
    console.log(`=== leaveSeat開始 ===`);
    console.log(`tableId: ${tableId}`);
    console.log(`seatNumber: ${seatNumber}`);
    console.log(`userId: ${userId}`);

    // パラメータの検証
    if (!tableId || !seatNumber || !userId) {
      throw new HttpsError('invalid-argument', '必須パラメータが不足しています: tableId, seatNumber, userId');
    }

    // 1. activeStaysからbillIdを取得（存在チェックは本callable側の責務）
    const activeStayRef = db.collection('activeStays').doc(userId);
    const activeStayDoc = await activeStayRef.get();

    if (!activeStayDoc.exists) {
      throw new HttpsError('not-found', `ユーザー ${userId} のactiveStaysドキュメントが存在しません`);
    }

    const activeStayData = activeStayDoc.data()!;
    const billId = activeStayData.billId as string;

    if (!billId) {
      throw new HttpsError('failed-precondition', `ユーザー ${userId} のactiveStaysにbillIdが設定されていません`);
    }

    console.log(`billId取得完了: ${billId}`);

    // 2. sideGameコレクションの座席情報をクリア（seatsマップ内から削除）
    const seatNumberStr = seatNumber.toString().padStart(2, '0');
    const sideGameUpdateData = {
      [`seats.seat${seatNumberStr}UserId`]: null,
      [`seats.seat${seatNumberStr}PokerName`]: null,
      updatedAt: new Date(),
    };

    await db.collection('sideGame').doc(tableId).update(sideGameUpdateData);
    console.log(`sideGame座席クリア完了: seat${seatNumberStr}`);

    // 3. updatePlace ヘルパAPIを使用して bills.place を更新（table: null, seat: null）
    await updatePlace({
      billId,
      table: null,
      seat: null,
    });
    console.log(`bills.placeクリア完了: ${billId}`);

    return {
      success: true,
      message: '退席処理が完了しました',
      data: {
        tableId,
        seatNumber,
        userId,
      },
    };

  } catch (error) {
    console.error('leaveSeatエラー:', error);
    console.error('エラー詳細:', {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      name: error instanceof Error ? error.name : undefined,
    });
    
    if (error instanceof HttpsError) {
      throw error;
    }
    throw new HttpsError('internal', `退席処理に失敗しました: ${error instanceof Error ? error.message : String(error)}`);
  }
});
