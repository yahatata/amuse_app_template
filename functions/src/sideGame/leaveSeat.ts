import { onCall } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';

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
