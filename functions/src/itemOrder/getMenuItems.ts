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
    // How: 複数条件でフィルタリング
    const menuItemsRef = db.collection('menuItems');
    const snapshot = await menuItemsRef
      .where('isArchive', '==', false)
      .get();

    // When: アーカイブ済みアイテムの取得時
    // Where: menuItemsコレクション
    // What: 3ヶ月以内にアーカイブされたアイテムを取得
    // How: archivedAtフィールドでフィルタリング
    const archivedSnapshot = await menuItemsRef
      .where('isArchive', '==', true)
      .where('archivedAt', '>=', threeMonthsAgo)
      .get();

    // When: 結果の統合時
    // Where: サーバーサイド
    // What: 両方のクエリ結果を統合
    // How: 配列の結合
    const allItems = [
      ...snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })),
      ...archivedSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
    ];

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
