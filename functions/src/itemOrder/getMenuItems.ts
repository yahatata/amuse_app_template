import { onCall } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";

// When: メニューアイテム取得時
// Where: Firebase Functions
// What: FireStoreからメニューアイテムを取得
// How: Cloud Functions経由でFireStoreクエリを実行

export const getMenuItems = onCall(async (request) => {
  try {
    const db = getFirestore();
    
    // When: 現在時刻から3ヶ月前を計算
    // Where: サーバーサイド
    // What: アーカイブ期間の判定基準を設定
    // How: 現在時刻から3ヶ月前のタイムスタンプを作成
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

    // When: FireStoreクエリ実行時
    // Where: menuItemsコレクション
    // What: 条件に合うメニューアイテムを取得
    // How: 全データを取得してサーバー側でフィルタリング
    const menuItemsRef = db.collection('menuItems');
    const snapshot = await menuItemsRef.get();

    // When: 結果のフィルタリング時
    // Where: サーバーサイド
    // What: 条件に合うメニューアイテムを抽出
    // How: アーカイブ状態と日付でフィルタリング
    const allItems = snapshot.docs
      .map(doc => ({ id: doc.id, ...doc.data() }))
      .filter((item: any) => {
        // アーカイブされていないアイテム
        if (!item.isArchive) return true;
        
        // アーカイブ済みで3ヶ月以内のアイテム
        if (item.isArchive && item.archivedAt) {
          const archivedDate = item.archivedAt.toDate ? item.archivedAt.toDate() : new Date(item.archivedAt);
          return archivedDate >= threeMonthsAgo;
        }
        
        return false;
      });

    // When: レスポンス返却時
    // Where: Cloud Functions
    // What: 取得したメニューアイテムを返却
    // How: JSON形式でデータを返却
    return {
      success: true,
      data: allItems
    };

  } catch (error) {
    // When: エラー発生時
    // Where: Cloud Functions
    // What: エラー情報を返却
    // How: エラーメッセージを含むJSONを返却
    console.error('Error fetching menu items:', error);
    return {
      success: false,
      error: 'メニューアイテムの取得に失敗しました'
    };
  }
});
