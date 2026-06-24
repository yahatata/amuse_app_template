/**
 * withdrawChip
 *
 * サイドゲームチップの引き出し処理
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
import { assertSideGameOperationPermission } from '../lib/sideGameOperationPermission';
import { getActiveBillByUser } from '../../bills/repos/getActiveBillByUser';
import { appendSideGameChip } from '../../bills/repos/appendSideGameChip';
import { logOpsError, logOpsSuccess } from "../../../shared/logging/logOpsError";

export const withdrawChip = onCall(async (request) => {
  // 認証チェック
  if (!request.auth) {
    throw new HttpsError('unauthenticated', '認証が必要です');
  }

  const callerUid = request.auth.uid;

  const db = getFirestore();
  const { userId, amount, clientNonce } = request.data;
  let billId: string | undefined;

  try {
    await assertSideGameOperationPermission({ callerUid });

    console.log(`=== withdrawChip開始 ===`);
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
    const currentChip = userData?.sideGameChip as number || 0;

    console.log(`現在のchip残高: ${currentChip}`);
    console.log(`引き出し予定額（チップ枚数）: ${amount}`);

    // 残高チェック
    if (amount > currentChip) {
      throw new HttpsError('failed-precondition', 'Insufficient chip balance');
    }

    // 1. getActiveBillByUser で billId を取得
    const active = await getActiveBillByUser(userId);
    billId = active.billId;

    // 2. appendSideGameChip ヘルパを呼び出す（deterministic idempotencyKey）
    const op = 'withdrawChip';
    const idempotencyKey = `${billId}:${op}:${clientNonce}`;
    const appendResult = await appendSideGameChip({
      billId,
      action: 'withdraw',
      chipQty: amount, // amount をそのまま使用（チップ枚数）
      amountIncl: null, // withdraw は課金イベントではない
      menuItemId: null,
      name: null,
      idempotencyKey,
    });

    // 3. idempotent replay チェック（reused のときはユーザ残高とログを更新しない）
    const isReplay = appendResult.diagnostics?.reused === true;

    if (!isReplay) {
      // 3-1. chipを引き出し（初回のみ実行）
      const newChipAmount = currentChip - amount;
      await db.collection('users').doc(userId).update({
        sideGameChip: newChipAmount,
        updatedAt: new Date(),
      });

      // 3-2. ログ記録を追加（初回のみ実行）
      await addLogEntry(userId, 'sideGameChipLogs', {
        appliedAt: new Date(),
        category: 'expense',
        amountDelta: -amount, // 負の値
        reasonType: 'sideGame',
        actor: 'tablet_front', // 実際の端末IDに置き換え可能
      });
    }

    // レスポンス用に現在の残高を取得
    const userDocFinal = await db.collection('users').doc(userId).get();
    const finalBalance = userDocFinal.data()?.sideGameChip as number || 0;

    logOpsSuccess({
      message: 'withdrawChip 成功',
      functionEntry: 'withdrawChip',
      context: {
        userId,
        billId,
        amount,
        reused: isReplay,
        chipId: appendResult.chipId,
        finalBalance,
        previousBalance: currentChip,
      },
    });

    return {
      success: true,
      message: `chipの引き出し処理が完了しました`,
      data: {
        userId,
        withdrawAmount: amount,
        previousBalance: currentChip,
        newBalance: finalBalance,
        chipId: appendResult.chipId, // 内部識別子（デバッグ用、クライアントには返さない想定）
        reused: isReplay || false,
      },
    };

  } catch (error) {
    logOpsError({
      message: 'withdrawChipエラー:',
      functionEntry: 'withdrawChip',
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
    throw new HttpsError('internal', `chipの引き出しに失敗しました: ${error instanceof Error ? error.message : String(error)}`);
  }
});
