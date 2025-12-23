/**
 * registerForSideGame
 * 
 * サイドゲームへの参加登録
 * 
 * 新スキーマ対応:
 * - activeStays/{userId} から billId と pokerName を取得
 * - updatePlace ヘルパAPIを使用して bills.place を更新
 */

import { onCall } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { updatePlace } from '../helpers/billsApi/updatePlace';

export const registerForSideGame = onCall(async (request) => {
  const db = getFirestore();
  const { tableId, seatNumber, userId } = request.data;

  try {
    console.log(`=== registerParticipant開始 ===`);
    console.log(`tableId: ${tableId}`);
    console.log(`seatNumber: ${seatNumber}`);
    console.log(`userId: ${userId}`);

    // パラメータの検証
    if (!tableId || !seatNumber || !userId) {
      throw new HttpsError('invalid-argument', '必須パラメータが不足しています: tableId, seatNumber, userId');
    }

    if (typeof seatNumber !== 'number') {
      throw new HttpsError('invalid-argument', 'seatNumberは数値である必要があります');
    }

    // 1. activeStaysから参加者情報を取得（存在チェックは本callable側の責務）
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

    // pokerNameはactiveStaysから取得（todaysBillsには依存しない）
    const pokerName = activeStayData.pokerName || `Player_${userId}`;

    console.log(`参加者情報取得完了: ${pokerName}, billId: ${billId}`);

    // 2. sideGameドキュメントの存在確認
    const sideGameDoc = await db.collection('sideGame').doc(tableId).get();
    if (!sideGameDoc.exists) {
      throw new HttpsError('not-found', `テーブル ${tableId} がsideGameコレクションに見つかりません`);
    }

    // 3. sideGameコレクションの座席情報を更新（seatsマップ内に格納）
    const seatNumberStr = seatNumber.toString().padStart(2, '0');
    const sideGameUpdateData = {
      [`seats.seat${seatNumberStr}UserId`]: userId,
      [`seats.seat${seatNumberStr}PokerName`]: pokerName,
      updatedAt: new Date(),
    };

    await db.collection('sideGame').doc(tableId).update(sideGameUpdateData);
    console.log(`sideGame座席更新完了: seat${seatNumberStr}`);

    // 4. updatePlace ヘルパAPIを使用して bills.place を更新
    await updatePlace({
      billId,
      table: tableId,
      seat: seatNumber,
    });
    console.log(`bills.place更新完了: ${billId}`);

    return {
      success: true,
      message: '参加登録が完了しました',
      data: {
        tableId,
        seatNumber,
        userId,
        pokerName,
      },
    };

  } catch (error) {
    console.error('registerParticipantエラー:', error);
    console.error('エラー詳細:', {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      name: error instanceof Error ? error.name : undefined,
    });
    
    if (error instanceof HttpsError) {
      throw error;
    }
    throw new HttpsError('internal', `参加登録に失敗しました: ${error instanceof Error ? error.message : String(error)}`);
  }
});
