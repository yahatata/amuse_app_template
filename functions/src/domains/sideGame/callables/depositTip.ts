/**
 * depositTip
 * 
 * サイドゲームチップの預入処理
 * 
 * 新スキーマ対応:
 * - getActiveBillByUser で billId を取得
 * - appendSideGameChip で /bills/{billId}/sideGameChips/{chipId} に追加
 * - DualWrite: todaysBills.sideGameChip 配列への複写（トランザクション外でベストエフォート）
 */

import { onCall } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { addLogEntry } from '../../user/services/logUtils';
import { getCallerDeviceByUid, hasRequiredOption, isActive } from '../../../shared/devices';
import { getActiveBillByUser } from '../../bills/repos/getActiveBillByUser';
import { appendSideGameChip } from '../../bills/repos/appendSideGameChip';
import { logOpsError, logOpsSuccess } from "../../../shared/logging/logOpsError";

export const depositTip = onCall(async (request) => {
  // 認証チェック
  if (!request.auth) {
    throw new HttpsError('unauthenticated', '認証が必要です');
  }

  const callerUid = request.auth.uid;

  const db = getFirestore();
  const { userId, amount, clientNonce } = request.data;
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

    console.log(`=== depositTip開始 ===`);
    console.log(`userId: ${userId}`);
    console.log(`amount: ${amount}`);
    console.log(`clientNonce: ${clientNonce}`);

    // パラメータの検証
    if (!userId || amount === undefined || amount === null || !clientNonce) {
      throw new HttpsError('invalid-argument', 'userId, amount, clientNonce are required');
    }

    if (typeof amount !== 'number' || amount <= 0 || !Number.isInteger(amount)) {
      throw new HttpsError('invalid-argument', 'amount must be a positive integer (chip quantity)');
    }

    // usersコレクションから対象ユーザーのドキュメントを取得
    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists) {
      throw new HttpsError('not-found', `User not found: ${userId}`);
    }

    const userData = userDoc.data();
    const currentTip = userData?.sideGameChip as number || 0;

    console.log(`現在のTip残高: ${currentTip}`);
    console.log(`預入予定額（チップ枚数）: ${amount}`);

    // 1. getActiveBillByUser で billId を取得
    const active = await getActiveBillByUser(userId);
    billId = active.billId;

    // 2. appendSideGameChip ヘルパを呼び出す（deterministic idempotencyKey）
    const op = 'depositTip';
    const idempotencyKey = `${billId}:${op}:${clientNonce}`;
    const appendResult = await appendSideGameChip({
      billId,
      action: 'deposit',
      chipQty: amount, // amount をそのまま使用（チップ枚数）
      amountIncl: null, // deposit は課金イベントではない
      menuItemId: null,
      name: null,
      idempotencyKey,
    });

    // 3. idempotent replay チェック（reused のときはユーザ残高とログを更新しない）
    const isReplay = appendResult.diagnostics?.reused === true;

    if (!isReplay) {
      // 3-1. Tipを預入（初回のみ実行）
      const newTipAmount = currentTip + amount;
      await db.collection('users').doc(userId).update({
        sideGameChip: newTipAmount,
        updatedAt: new Date(),
      });

      // 3-2. ログ記録を追加（初回のみ実行）
      await addLogEntry(userId, 'sideGameChipLogs', {
        appliedAt: new Date(),
        category: 'income',
        amountDelta: amount,
        reasonType: 'sideGame',
        actor: 'tablet_front', // 実際の端末IDに置き換え可能
      });
    }

    // レスポンス用に現在の残高を取得
    const userDocFinal = await db.collection('users').doc(userId).get();
    const finalBalance = userDocFinal.data()?.sideGameChip as number || 0;

    logOpsSuccess({
      message: 'depositTip 成功',
      functionEntry: 'depositTip',
      context: {
        userId,
        billId,
        amount,
        reused: isReplay,
        chipId: appendResult.chipId,
        finalBalance,
        previousBalance: currentTip,
      },
    });

    return {
      success: true,
      message: `Tipの預入処理が完了しました`,
      data: {
        userId,
        depositAmount: amount,
        previousBalance: currentTip,
        newBalance: finalBalance,
        chipId: appendResult.chipId, // 内部識別子（デバッグ用、クライアントには返さない想定）
        reused: isReplay || false,
      },
    };

  } catch (error) {
    logOpsError({
      message: 'depositTipエラー:',
      functionEntry: 'depositTip',
      cause: error,
      context: {
        callerUid,
        userId,
        amount,
        clientNonce,
        billId,
      },
    });

    if (error instanceof HttpsError) {
      throw error;
    }
    throw new HttpsError('internal', `Tipの預入に失敗しました: ${error instanceof Error ? error.message : String(error)}`);
  }
});
