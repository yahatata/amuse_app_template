import { onCall } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";
import * as bcrypt from "bcryptjs";

/**
 * 手動チェックイン（店舗端末でのログインID + PIN 認証）
 *
 * When: 店舗端末から手動で入店処理を行うとき
 * Where: Cloud Functions (Callable)
 * What: loginId と PIN を認証し、ユーザーを入店状態にし、必要であれば入店料を todaysBills に追加
 * How: Firestore 検索 → PIN 検証 → users 更新 → todaysBills 作成
 */
export const manualCheckIn = onCall(async (request) => {
  try {
    const { loginId, pin, entranceFee, entranceFeeDescription } = request.data;

    // バリデーション
    if (!loginId || !pin) {
      return {
        success: false,
        error: 'ログインIDとPINを入力してください'
      };
    }

    if ((pin as string).length !== 4) {
      return {
        success: false,
        error: 'PINは4桁で入力してください'
      };
    }

    const db = getFirestore();
    const now = new Date();

    // デバッグ用：全ユーザーデータを確認
    const allUsersSnapshot = await db.collection('users').get();
    console.log('Total users in collection:', allUsersSnapshot.size);
    allUsersSnapshot.docs.forEach((doc, index) => {
      const data = doc.data();
      console.log(`User ${index + 1}:`, {
        loginId: data.loginId,
        uid: data.uid,
        pokerName: data.pokerName
      });
    });

    // 1. loginIDでユーザーを検索
    console.log('Searching for loginId:', loginId);
    const usersSnapshot = await db.collection('users')
      .where('loginId', '==', loginId)
      .limit(1)
      .get();

    console.log('Search result - empty:', usersSnapshot.empty);
    console.log('Search result - size:', usersSnapshot.size);

    if (usersSnapshot.empty) {
      return {
        success: false,
        error: 'ログインIDが見つかりません'
      };
    }

    const userDoc = usersSnapshot.docs[0];
    const userData = userDoc.data();
    const storedHashedPin = userData.hashedPin;
    const uid = userData.uid;
    const pokerName = userData.pokerName;
    const isStaying = userData.isStaying;

    // 2. 入店済みチェック
    if (isStaying === true) {
      return {
        success: false,
        error: '入店処理済みです'
      };
    }

    // 3. PIN認証
    const isPinCorrect = bcrypt.compareSync(pin, storedHashedPin);
    if (!isPinCorrect) {
      return {
        success: false,
        error: 'PINが正しくありません'
      };
    }

    // 4. ユーザー情報を更新
    await db.collection('users').doc(uid).update({
      isStaying: true,
      lastLogin: now,
    });

    // 5. todaysBillsドキュメントを作成（入店料を含む）
    const extraCost = entranceFee > 0 ? [{
      name: entranceFeeDescription || "入店料",
      price: entranceFee,
      createdAt: now
    }] : [];

    const todaysBillsData = {
      createdAt: now,
      pokerName: pokerName,
      status: 'open',
      userId: uid,
      items: [],
      sideGameTip: [],
      tournaments: [],
      extraCost: extraCost,
      totalPrice: entranceFee > 0 ? entranceFee : 0, // 入店料を初期値として設定（0円の場合は0）
      settledAt: null,
      currentTable: null,
      currentSeat: null,
    } as Record<string, unknown>;

    const todaysBillsRef = await db.collection('todaysBills').add(todaysBillsData);

    return {
      success: true,
      data: {
        uid: uid,
        pokerName: pokerName,
        todaysBillsId: todaysBillsRef.id,
        message: `${pokerName}様のログイン処理が完了しました`
      }
    };

  } catch (error) {
    console.error('手動チェックインエラー:', error);
    return {
      success: false,
      error: 'ログイン処理に失敗しました'
    };
  }
});

 