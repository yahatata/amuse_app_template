import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { getCallerDeviceByUid, hasRequiredOption, isActive } from "../../../shared/devices";
import { logOpsError, logOpsSuccess } from "../../../shared/logging/logOpsError";

export const updateMenuItem = onCall(async (request) => {
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
      throw new HttpsError('invalid-argument', '必須項目が不足しています');
    }

    const db = getFirestore();
    const storage = getStorage();
    const now = new Date();

    // 既存のメニューを取得（画像URLを保持するため）
    const existingMenuItemDoc = await db.collection('menuItems').doc(originalId).get();
    if (!existingMenuItemDoc.exists) {
      throw new HttpsError('not-found', 'メニューが見つかりません');
    }

    const existingData = existingMenuItemDoc.data();
    let imageUrl = existingData?.imageUrl || '';
    
    // 新しい画像がアップロードされた場合のみStorageにアップロード
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
        logOpsError({
      message: '画像アップロードエラー:',
      functionEntry: 'updateMenuItem',
      operation: 'imageUpload',
      cause: error,
    });
        throw new HttpsError('internal', '画像のアップロードに失敗しました');
      }
    }

    // 既存のメニューを直接更新
    const updateData: any = {
      name,
      price: parseInt(price),
      category,
      description: description || '',
      imageUrl,
      isArchive: isArchive || false,
      isSoldOut: isSoldOut || false,
      updatedAt: now,
    };

    // アーカイブされた場合のみarchivedAtを設定
    if (isArchive) {
      updateData.archivedAt = now;
    } else {
      // アーカイブ解除の場合はarchivedAtをnullに
      updateData.archivedAt = null;
    }

    await db.collection('menuItems').doc(originalId).update(updateData);

    // administrativeMenuも既存エントリを直接更新
    const adminMenuRef = db.collection('administrativeMenu').doc('current');
    const adminMenuDoc = await adminMenuRef.get();
    
    if (adminMenuDoc.exists) {
      const adminMenuData = adminMenuDoc.data();
      const itemsMap = adminMenuData?.items || {};
      
      // 既存のメニューエントリを更新（8項目）
      if (itemsMap[originalId]) {
        itemsMap[originalId] = {
          name: updateData.name,
          category: updateData.category,
          imageUrl: updateData.imageUrl,
          price: updateData.price,
          isArchive: updateData.isArchive,
          isSoldOut: updateData.isSoldOut,
          description: updateData.description,
          menuItemDocId: originalId,
        };
        
        await adminMenuRef.update({
          items: itemsMap,
          updatedAt: now,
          updatedBy: callerUid,
        });
      }
    }

    logOpsSuccess({
      message: "updateMenuItem 成功",
      functionEntry: "updateMenuItem",
      operation: "updateMenuItemCallable",
      context: { menuItemId: originalId, callerUid, name: updateData.name },
    });

    return {
      success: true,
      data: {
        id: originalId,
        ...updateData
      }
    };

  } catch (error) {
    logOpsError({
      message: 'メニュー更新エラー:',
      functionEntry: 'updateMenuItem',
      operation: 'menuUpdateCatch',
      cause: error,
    });
    
    if (error instanceof HttpsError) {
      throw error;
    }
    
    throw new HttpsError('internal', 'メニューの更新に失敗しました');
  }
});
