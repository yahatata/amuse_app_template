import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { getCallerDeviceByUid, hasRequiredOption, isActive } from "../lib/devicePermissions";

export const createMenuItem = onCall(async (request) => {
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
    const { name, price, category, description, imageBase64, isArchive, isSoldOut } = request.data;

    // バリデーション
    if (!name || !price || !category) {
      throw new HttpsError('invalid-argument', '必須項目が不足しています');
    }

    const db = getFirestore();
    const storage = getStorage();
    const now = new Date();

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
        throw new HttpsError('internal', '画像のアップロードに失敗しました');
      }
    }

    // Firestoreにメニューアイテムを保存
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
    console.error('メニュー作成エラー:', error);
    
    if (error instanceof HttpsError) {
      throw error;
    }
    
    throw new HttpsError('internal', 'メニューの作成に失敗しました');
  }
});
