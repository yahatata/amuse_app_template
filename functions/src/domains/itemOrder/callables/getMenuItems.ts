import { onCall } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";

// When: メニューアイテム取得時
// Where: Firebase Functions
// What: FireStoreからメニューアイテムを取得
// How: Cloud Functions経由でadministrativeMenuから取得

export const getMenuItems = onCall(async (request) => {
  try {
    const db = getFirestore();
    
    // includeArchivedパラメータを取得（デフォルトはfalse）
    const includeArchived = request.data?.includeArchived === true || request.data?.includeArchived === 'true';
    
    // When: administrativeMenuドキュメント取得時
    // Where: administrativeMenu/current
    // What: メニューアイテムのマップを取得
    // How: administrativeMenu/currentドキュメントから取得
    const adminMenuDoc = await db.collection('administrativeMenu').doc('current').get();
    
    if (!adminMenuDoc.exists) {
      return {
        success: false,
        error: 'メニューデータが見つかりません'
      };
    }

    const adminMenuData = adminMenuDoc.data();
    const itemsMap = adminMenuData?.items || {};

    // When: マップを配列に変換時
    // Where: サーバーサイド
    // What: マップ形式のメニューアイテムを配列に変換
    // How: Object.entriesでマップを配列に変換し、idフィールドを追加
    const allItems = Object.entries(itemsMap).map(([key, value]: [string, any]) => {
      // isArchiveを厳密に真偽値に変換
      const isArchive = value.isArchive === true || value.isArchive === 'true';
      
      return {
        id: key, // マップのキーをidとして使用
        name: value.name || '',
        category: value.category || '',
        imageUrl: value.imageUrl || '',
        price: value.price || 0,
        isArchive: isArchive,
        isSoldOut: value.isSoldOut === true || value.isSoldOut === 'true',
        description: value.description || '', // descriptionフィールドを含める
        menuItemDocId: value.menuItemDocId || key, // 元のmenuItemsドキュメントID
        ...(value.createdAt && { createdAt: value.createdAt }),
        ...(value.updatedAt && { updatedAt: value.updatedAt }),
        ...(value.archivedAt && { archivedAt: value.archivedAt }),
      };
    });

    // When: 結果のフィルタリング時
    // Where: サーバーサイド
    // What: includeArchivedがfalseの場合はアーカイブされていないアイテムのみを抽出
    // How: isArchiveフラグを厳密にチェックしてフィルタリング
    let filteredItems = allItems;
    if (!includeArchived) {
      filteredItems = allItems.filter((item: any) => {
        // isArchiveがtrue（真偽値または文字列'true'）の場合は除外
        return item.isArchive !== true && item.isArchive !== 'true';
      });
    }

    // When: レスポンス返却時
    // Where: Cloud Functions
    // What: 取得したメニューアイテムを返却
    // How: JSON形式でデータを返却
    return {
      success: true,
      data: filteredItems
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
