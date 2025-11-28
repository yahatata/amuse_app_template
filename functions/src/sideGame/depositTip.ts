import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { addLogEntry } from '../utils/logUtils';
import { getCallerDeviceByUid, hasRequiredOption, isActive } from '../lib/devicePermissions';

export const depositTip = onCall(async (request) => {
  // 認証チェック
  if (!request.auth) {
    throw new HttpsError('unauthenticated', '認証が必要です');
  }

  const callerUid = request.auth.uid;

  const db = getFirestore();
  const { userId, amount } = request.data;

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
    const currentTip = userData?.sideGameChip as number || 0;

    console.log(`現在のTip残高: ${currentTip}`);
    console.log(`預入予定額: ${amount}`);

    // Tipを預入
    const newTipAmount = currentTip + amount;
    await db.collection('users').doc(userId).update({
      sideGameChip: newTipAmount,
      updatedAt: new Date(),
    });

    // todaysBillsのsideGameChip配列にdepositエントリーを追加
    const todaysBillsQuery = await db.collection('todaysBills')
      .where('userId', '==', userId)
      .where('status', '==', 'open')
      .limit(1)
      .get();

    if (!todaysBillsQuery.empty) {
      const todaysBillsDoc = todaysBillsQuery.docs[0];
      const todaysBillsData = todaysBillsDoc.data();
      const existingSideGameChips = Array.isArray(todaysBillsData?.sideGameChip) ? todaysBillsData.sideGameChip : [];
      
      const depositEntry = {
        action: 'deposit',
        category: 'Chip',
        menuItemId: null,
        name: null,
        orderedAt: new Date(),
        price: null,
        quantity: null,
        totalPrice: null,
        amount: amount,
      };
      
      const updatedSideGameChips = [...existingSideGameChips, depositEntry];
      
      await todaysBillsDoc.ref.update({
        sideGameChip: updatedSideGameChips,
        updatedAt: new Date(),
      });
      
      console.log(`todaysBillsのsideGameChipにdepositエントリーを追加: amount=${amount}`);
    }

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
