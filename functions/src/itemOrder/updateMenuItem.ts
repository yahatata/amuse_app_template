import { onCall } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

export const updateMenuItem = onCall(async (request) => {
  try {
    const { 
      originalId, 
      name, 
      price, 
      category, 
      description, 
      imageBase64, 
      isArchive, 
      isSoldOut 
    } = request.data;

    // バリデーション
    if (!originalId || !name || !price || !category) {
      return {
        success: false,
        error: '必須項目が不足しています'
      };
    }

    const db = getFirestore();
    const storage = getStorage();
    const now = new Date();

    // 1. 元のメニューをアーカイブ
    await db.collection('menuItems').doc(originalId).update({
      isArchive: true,
      archivedAt: now,
      updatedAt: now,
    });

    let imageUrl = '';
    
    // 画像がある場合はStorageにアップロード
    if (imageBase64) {
      try {
        const fileName = `menuImages/${Date.now()}.jpg`;
        const bucket = storage.bucket();
        const file = bucket.file(fileName);
        
        // Base64をデコードしてバッファに変換
        const imageBuffer = Buffer.from(imageBase64, 'base64');
        
        // Storageにアップロード
        await file.save(imageBuffer, {
          metadata: {
            contentType: 'image/jpeg',
          },
        });

        // ダウンロードURLを取得（公開アクセス用）
        imageUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}`;
        
        // ファイルを公開アクセス可能に設定
        await file.makePublic();
      } catch (error) {
        console.error('画像アップロードエラー:', error);
        return {
          success: false,
          error: '画像のアップロードに失敗しました'
        };
      }
    }

    // 2. 新しいメニューアイテムを作成
    const menuItemData = {
      name,
      price: parseInt(price),
      category,
      description: description || '',
      imageUrl,
      isArchive: isArchive || false,
      isSoldOut: isSoldOut || false,
      createdAt: now,
      updatedAt: now,
      archivedAt: null,
    };

    const docRef = await db.collection('menuItems').add(menuItemData);

    return {
      success: true,
      data: {
        id: docRef.id,
        ...menuItemData
      }
    };

  } catch (error) {
    console.error('メニュー更新エラー:', error);
    return {
      success: false,
      error: 'メニューの更新に失敗しました'
    };
  }
});
