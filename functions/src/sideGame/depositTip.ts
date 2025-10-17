import { onCall } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { addLogEntry } from '../utils/logUtils';

export const depositTip = onCall(async (request) => {
  const db = getFirestore();
  const { userId, amount } = request.data;

  try {
    console.log(`=== depositTip開始 ===`);
    console.log(`userId: ${userId}`);
    console.log(`amount: ${amount}`);

    // パラメータの検証
    if (!userId || !amount) {
      throw new Error('必須パラメータが不足しています: userId, amount');
    }

    if (typeof amount !== 'number' || amount <= 0) {
      throw new Error('amountは正の数値である必要があります');
    }

    // usersコレクションから対象ユーザーのドキュメントを取得
    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists) {
      throw new Error(`ユーザー ${userId} が見つかりません`);
    }

    const userData = userDoc.data();
    const currentTip = userData?.sideGameTip as number || 0;

    console.log(`現在のTip残高: ${currentTip}`);
    console.log(`預入予定額: ${amount}`);

    // Tipを預入
    const newTipAmount = currentTip + amount;
    await db.collection('users').doc(userId).update({
      sideGameTip: newTipAmount,
      updatedAt: new Date(),
    });

    // ログ記録を追加
    await addLogEntry(userId, 'sideGameChipLogs', {
      appliedAt: new Date(),
      category: 'income',
      amountDelta: amount,
      reasonType: 'sideGame',
      actor: 'tablet_front', // 実際の端末IDに置き換え可能
    });

    console.log(`預入完了: ${amount}`);
    console.log(`新しい残高: ${newTipAmount}`);

    return {
      success: true,
      message: `Tipの預入処理が完了しました`,
      data: {
        userId,
        depositAmount: amount,
        previousBalance: currentTip,
        newBalance: newTipAmount,
      },
    };

  } catch (error) {
    console.error('depositTipエラー:', error);
    console.error('エラー詳細:', {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      name: error instanceof Error ? error.name : undefined,
    });
    throw new Error(`Tipの預入に失敗しました: ${error instanceof Error ? error.message : String(error)}`);
  }
});
