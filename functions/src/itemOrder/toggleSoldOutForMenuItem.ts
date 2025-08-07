import { onCall } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";

export const toggleSoldOutForMenuItem = onCall(async (request) => {
  try {
    const { menuItemId, isSoldOut } = request.data;

    // バリデーション
    if (!menuItemId) {
      return {
        success: false,
        error: 'メニューIDが指定されていません'
      };
    }

    const db = getFirestore();
    const now = new Date();

    // FirestoreでメニューアイテムのisSoldOutを更新
    await db.collection('menuItems').doc(menuItemId).update({
      isSoldOut: isSoldOut,
      updatedAt: now,
    });

    return {
      success: true,
      data: {
        id: menuItemId,
        isSoldOut: isSoldOut,
        updatedAt: now,
      }
    };

  } catch (error) {
    console.error('売り切れ状態切り替えエラー:', error);
    return {
      success: false,
      error: '売り切れ状態の切り替えに失敗しました'
    };
  }
});
