import { onCall } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { addLogEntry } from '../utils/logUtils';

export const withdrawTip = onCall(async (request) => {
  const db = getFirestore();
  const { userId, amount } = request.data;

  try {
    console.log(`=== withdrawTip開始 ===`);
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
    console.log(`引き出し予定額: ${amount}`);

    // 残高チェック
    if (amount > currentTip) {
      throw new Error('残高が不足しています');
    }

    // Tipを引き出し
    const newTipAmount = currentTip - amount;
    await db.collection('users').doc(userId).update({
      sideGameTip: newTipAmount,
      updatedAt: new Date(),
    });

    // todaysBillsのsideGameChip配列にwithdrawエントリーを追加
    const todaysBillsQuery = await db.collection('todaysBills')
      .where('userId', '==', userId)
      .where('status', '==', 'open')
      .limit(1)
      .get();

    if (!todaysBillsQuery.empty) {
      const todaysBillsDoc = todaysBillsQuery.docs[0];
      const todaysBillsData = todaysBillsDoc.data();
      const existingSideGameChips = Array.isArray(todaysBillsData?.sideGameChip) ? todaysBillsData.sideGameChip : [];
      
      const withdrawEntry = {
        action: 'withdraw',
        category: 'Chip',
        menuItemId: null,
        name: null,
        orderedAt: new Date(),
        price: null,
        quantity: null,
        totalPrice: null,
        amount: amount,
      };
      
      const updatedSideGameChips = [...existingSideGameChips, withdrawEntry];
      
      await todaysBillsDoc.ref.update({
        sideGameChip: updatedSideGameChips,
        updatedAt: new Date(),
      });
      
      console.log(`todaysBillsのsideGameChipにwithdrawエントリーを追加: amount=${amount}`);
    }

    // ログ記録を追加
    await addLogEntry(userId, 'sideGameChipLogs', {
      appliedAt: new Date(),
      category: 'expense',
      amountDelta: -amount, // 負の値
      reasonType: 'sideGame',
      actor: 'tablet_front', // 実際の端末IDに置き換え可能
    });

    console.log(`引き出し完了: ${amount}`);
    console.log(`新しい残高: ${newTipAmount}`);

    return {
      success: true,
      message: `Tipの引き出し処理が完了しました`,
      data: {
        userId,
        withdrawAmount: amount,
        previousBalance: currentTip,
        newBalance: newTipAmount,
      },
    };

  } catch (error) {
    console.error('withdrawTipエラー:', error);
    console.error('エラー詳細:', {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      name: error instanceof Error ? error.name : undefined,
    });
    throw new Error(`Tipの引き出しに失敗しました: ${error instanceof Error ? error.message : String(error)}`);
  }
});
