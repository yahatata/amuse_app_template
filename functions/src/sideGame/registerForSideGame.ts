import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { getCallerDeviceByUid, hasRequiredOption, isActive } from '../lib/devicePermissions';

export const registerForSideGame = onCall(async (request) => {
  // 認証チェック
  if (!request.auth) {
    throw new HttpsError('unauthenticated', '認証が必要です');
  }

  const callerUid = request.auth.uid;

  const db = getFirestore();
  const { tableId, seatNumber, userId } = request.data;

  try {
    // デバイス権限の確認（role: admin または options.side_game: true）
    const device = await getCallerDeviceByUid(callerUid);
    if (!device || !isActive(device.status)) {
      throw new HttpsError('permission-denied', 'デバイスが見つからないか、アクティブではありません');
    }

    const hasPermission = device.role === 'admin' || hasRequiredOption(device.options, 'side_game');
    if (!hasPermission) {
      throw new HttpsError('permission-denied', 'サイドゲーム操作の権限がありません');
    }
    console.log(`=== registerParticipant開始 ===`);
    console.log(`tableId: ${tableId}`);
    console.log(`seatNumber: ${seatNumber}`);
    console.log(`userId: ${userId}`);

    // パラメータの検証
    if (!tableId || !seatNumber || !userId) {
      throw new Error('必須パラメータが不足しています: tableId, seatNumber, userId');
    }

    if (typeof seatNumber !== 'number') {
      throw new Error('seatNumberは数値である必要があります');
    }

    // 1. todaysBillsから参加者情報を取得（userIdフィールドで検索）
    const todaysBillsQuery = await db.collection('todaysBills')
      .where('userId', '==', userId)
      .limit(1)
      .get();
    
    if (todaysBillsQuery.empty) {
      throw new Error(`参加者 ${userId} がtodaysBillsに見つかりません`);
    }

    const todaysBillsDoc = todaysBillsQuery.docs[0];
    const todaysBillsData = todaysBillsDoc.data();
    const pokerName = todaysBillsData?.pokerName as string;
    
    if (!pokerName) {
      throw new Error(`参加者 ${userId} のpokerNameが見つかりません`);
    }

    console.log(`参加者情報取得完了: ${pokerName}`);

    // 2. sideGameドキュメントの存在確認
    const sideGameDoc = await db.collection('sideGame').doc(tableId).get();
    if (!sideGameDoc.exists) {
      throw new Error(`テーブル ${tableId} がsideGameコレクションに見つかりません`);
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

    // 4. todaysBillsの参加者情報を更新
    const todaysBillsUpdateData = {
      currentSeat: seatNumber,
      currentTable: tableId,
      updatedAt: new Date(),
    };

    await todaysBillsDoc.ref.update(todaysBillsUpdateData);
    console.log(`todaysBills更新完了: ${userId}`);

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
    throw new Error(`参加登録に失敗しました: ${error instanceof Error ? error.message : String(error)}`);
  }
});
