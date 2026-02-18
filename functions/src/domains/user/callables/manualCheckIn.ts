import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";
import * as bcrypt from "bcryptjs";
import * as crypto from "crypto";
import { getCallerDeviceByUid, hasRequiredOption, isActive } from "../../../shared/devices";
import { createBillWithActiveStay } from "../../bills/repos/createBillWithActiveStay";

/**
 * 手動チェックイン（店舗端末でのログインID + PIN 認証）
 *
 * When: 店舗端末から手動で入店処理を行うとき
 * Where: Cloud Functions (Callable)
 * What: loginId と PIN を認証し、ユーザーを入店状態にし、必要であれば入店料を bills に追加
 * How: Firestore 検索 → PIN 検証 → users 更新 → createBillWithActiveStay ヘルパ呼び出し
 */
export const manualCheckIn = onCall(async (request) => {
  // 認証チェック
  if (!request.auth) {
    throw new HttpsError('unauthenticated', '認証が必要です');
  }

  const callerUid = request.auth.uid;

  try {
    // デバイス権限の確認（role: admin または options.user_entry_exit: true）
    const device = await getCallerDeviceByUid(callerUid);
    if (!device || !isActive(device.status)) {
      throw new HttpsError('permission-denied', 'デバイスが見つからないか、アクティブではありません');
    }

    const hasPermission = device.role === 'admin' || hasRequiredOption(device.options, 'user_entry_exit');
    if (!hasPermission) {
      throw new HttpsError('permission-denied', 'お客様入退店操作の権限がありません');
    }

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

    // 2. activeStays の存在確認
    const activeStayRef = db.collection('activeStays').doc(uid);
    const activeStaySnap = await activeStayRef.get();
    
    if (activeStaySnap.exists) {
      const activeStayData = activeStaySnap.data();
      const isActive = activeStayData?.isActive === true;
      
      if (isActive) {
        return {
          success: false,
          error: 'すでに入店済みです'
        };
      }
      // isActive === false の場合は再入店として処理を続ける
    }

    // 3. PIN認証
    const isPinCorrect = bcrypt.compareSync(pin, storedHashedPin);
    if (!isPinCorrect) {
      return {
        success: false,
        error: 'PINが正しくありません'
      };
    }

    // 4. 再入店判定と入店料設定
    const isReentry = activeStaySnap.exists && activeStaySnap.data()?.isActive === false;
    const chargeEntranceFeeOnReentry = request.data.chargeEntranceFeeOnReentry ?? false;
    
    let finalEntranceFee = entranceFee || 0;
    let finalEntranceFeeDescription = entranceFeeDescription || '入店料';
    
    if (isReentry && !chargeEntranceFeeOnReentry) {
      // 再入店で入店料を取らない場合
      finalEntranceFee = 0;
      finalEntranceFeeDescription = '再入店のため、入店料0円';
    }

    // 5. bills と activeStays を作成（ヘルパAPI利用）
    const billId = crypto.randomUUID();
    const idempotencyKey = crypto.randomUUID();
    
    const billResult = await createBillWithActiveStay({
      billId,
      userId: uid,
      pokerName: pokerName || null,
      idempotencyKey,
      entranceFee: finalEntranceFee,
      entranceFeeDescription: finalEntranceFeeDescription,
    });

    if (!billResult.success) {
      return {
        success: false,
        error: '入店処理に失敗しました'
      };
    }

    return {
      success: true,
      data: {
        uid: uid,
        pokerName: pokerName,
        billId: billResult.billId,
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

 