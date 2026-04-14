import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";
import { getCallerDeviceByUid, hasRequiredOption, isActive } from "../../../shared/devices";
import { logOpsError } from "../../../shared/logging/logOpsError";

export const toggleSoldOutForMenuItem = onCall(async (request) => {
  // 認証チェック
  if (!request.auth) {
    throw new HttpsError('unauthenticated', '認証が必要です');
  }

  const callerUid = request.auth.uid;

  // デバイス権限の確認（role: admin または options.kitchen: true）
  const device = await getCallerDeviceByUid(callerUid);
  if (!device || !isActive(device.status)) {
    throw new HttpsError('permission-denied', 'デバイスが見つからないか、アクティブではありません');
  }

  const hasPermission = device.role === 'admin' || hasRequiredOption(device.options, 'kitchen');
  if (!hasPermission) {
    throw new HttpsError('permission-denied', 'キッチン画面操作の権限がありません');
  }

  try {
    const { menuItemId, isSoldOut } = request.data;

    // バリデーション
    if (!menuItemId) {
      throw new HttpsError('invalid-argument', 'メニューIDが指定されていません');
    }

    const db = getFirestore();
    const now = new Date();

    // FirestoreでメニューアイテムのisSoldOutを更新
    await db.collection('menuItems').doc(menuItemId).update({
      isSoldOut: isSoldOut,
      updatedAt: now,
    });

    // administrativeMenuも更新
    const adminMenuRef = db.collection('administrativeMenu').doc('current');
    const adminMenuDoc = await adminMenuRef.get();
    
    if (adminMenuDoc.exists) {
      const adminMenuData = adminMenuDoc.data();
      const itemsMap = adminMenuData?.items || {};
      
      if (itemsMap[menuItemId]) {
        itemsMap[menuItemId] = {
          ...itemsMap[menuItemId],
          isSoldOut: isSoldOut,
        };
        
        await adminMenuRef.update({
          items: itemsMap,
          updatedAt: now,
          updatedBy: callerUid,
        });
      }
    }

    return {
      success: true,
      data: {
        id: menuItemId,
        isSoldOut: isSoldOut,
        updatedAt: now,
      }
    };

  } catch (error) {
    logOpsError({
      message: '売り切れ状態切り替えエラー:',
      functionEntry: 'toggleSoldOutForMenuItem',
      cause: error,
    });
    
    if (error instanceof HttpsError) {
      throw error;
    }
    
    throw new HttpsError('internal', '売り切れ状態の切り替えに失敗しました');
  }
});
