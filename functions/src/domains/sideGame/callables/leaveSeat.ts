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
import { getCallerDeviceByUid, hasRequiredOption, isActive } from '../../../shared/devices';
import { updatePlace } from '../../bills/repos/updatePlace';
import { logOpsError, logOpsSuccess } from "../../../shared/logging/logOpsError";

export const leaveSeat = onCall(async (request) => {
  // 認証チェック
  if (!request.auth) {
    throw new HttpsError('unauthenticated', '認証が必要です');
  }

  const callerUid = request.auth.uid;

  const db = getFirestore();
  const { tableId, seatNumber, userId } = request.data;
  let billId: string | undefined;

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
    billId = activeStayData.billId as string;

    if (!billId) {
      throw new HttpsError('failed-precondition', `ユーザー ${userId} のactiveStaysにbillIdが設定されていません`);
    }

    // 2. sideGameコレクションの座席情報をクリア（seatsマップ内から削除）
    const seatNumberStr = seatNumber.toString().padStart(2, '0');
    const sideGameUpdateData = {
      [`seats.seat${seatNumberStr}UserId`]: null,
      [`seats.seat${seatNumberStr}PokerName`]: null,
      updatedAt: new Date(),
    };

    await db.collection('sideGame').doc(tableId).update(sideGameUpdateData);

    // 3. updatePlace ヘルパAPIを使用して bills.place を更新（table: null, seat: null）
    await updatePlace({
      billId,
      table: null,
      seat: null,
    });

    logOpsSuccess({
      message: 'leaveSeat 成功',
      functionEntry: 'leaveSeat',
      context: {
        billId,
        tableId,
        seatNumber,
        userId,
      },
    });

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
    logOpsError({
      message: 'leaveSeatエラー:',
      functionEntry: 'leaveSeat',
      cause: error,
      context: {
        callerUid,
        billId,
        tableId,
        seatNumber,
        userId,
      },
    });

    if (error instanceof HttpsError) {
      throw error;
    }
    throw new HttpsError('internal', `退席処理に失敗しました: ${error instanceof Error ? error.message : String(error)}`);
  }
});
