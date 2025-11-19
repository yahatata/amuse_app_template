/**
 * leaveSeat
 * 
 * サイドゲームからの退席処理
 * 
 * 新スキーマ対応（最小限）:
 * - getActiveBillByUser で billId を取得
 * - bills.place を更新（updatePlace ヘルパAPI利用はP1-04で実装予定）
 */

import { onCall } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { getActiveBillByUser } from '../helpers/billsApi/getActiveBillByUser';
import * as admin from 'firebase-admin';

export const leaveSeat = onCall(async (request) => {
  const db = getFirestore();
  const { tableId, seatNumber, userId } = request.data;

  try {
    console.log(`=== leaveSeat開始 ===`);
    console.log(`tableId: ${tableId}`);
    console.log(`seatNumber: ${seatNumber}`);
    console.log(`userId: ${userId}`);

    // 1. sideGameコレクションの座席情報をクリア（seatsマップ内から削除）
    const seatNumberStr = seatNumber.toString().padStart(2, '0');
    const sideGameUpdateData = {
      [`seats.seat${seatNumberStr}UserId`]: null,
      [`seats.seat${seatNumberStr}PokerName`]: null,
      updatedAt: new Date(),
    };

    await db.collection('sideGame').doc(tableId).update(sideGameUpdateData);
    console.log(`sideGame座席クリア完了: seat${seatNumberStr}`);

    // 2. todaysBillsの参加者情報をクリア（userIdフィールドで検索）
    const todaysBillsQuery = await db.collection('todaysBills')
      .where('userId', '==', userId)
      .limit(1)
      .get();
    
    if (!todaysBillsQuery.empty) {
      const todaysBillsDoc = todaysBillsQuery.docs[0];
      const todaysBillsUpdateData = {
        currentSeat: null,
        currentTable: null,
        updatedAt: new Date(),
      };

      await todaysBillsDoc.ref.update(todaysBillsUpdateData);
      console.log(`todaysBillsクリア完了: ${userId}`);
    }

    // 3. bills.place を更新（最小限の実装、updatePlace ヘルパAPI利用はP1-04で実装予定）
    try {
      const { billId } = await getActiveBillByUser(userId);
      const billRef = db.collection('bills').doc(billId);
      await billRef.update({
        'place.table': null,
        'place.seat': null,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      console.log(`bills.placeクリア完了: ${billId}`);
    } catch (billError) {
      console.warn('bills.place更新失敗（最小限実装のため警告のみ）:', billError);
      // エラーをthrowしない（最小限の実装のため）
    }

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
    throw new Error(`退席処理に失敗しました: ${error}`);
  }
});
