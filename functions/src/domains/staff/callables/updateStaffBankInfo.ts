import * as admin from 'firebase-admin';
import {HttpsError, onCall} from 'firebase-functions/v2/https';
import {z} from 'zod';
import { logOpsError } from "../../../shared/logging/logOpsError";

// バリデーションスキーマ
const bankInfoSchema = z.object({
  staffId: z.string().min(1, 'スタッフIDが必要です'),
  bankInfo: z.object({
    bankName: z.string().min(1, '銀行名が必要です'),
    branchName: z.string().min(1, '支店名が必要です'),
    accountType: z.enum(['普通', '当座']),
    accountNumber: z.string().regex(/^\d{7}$/, '口座番号は7桁の数字である必要があります'),
    accountHolder: z.string().min(1, '口座名義が必要です'),
  }),
});

/**
 * 本番環境では銀行口座情報を暗号化して保存することを推奨!!
 * スタッフの銀行口座情報を更新するCloud Function
 * 
 * @param data - スタッフIDと銀行口座情報
 * @returns 成功メッセージ
 */
export const updateStaffBankInfo = onCall(async (request) => {
  const db = admin.firestore();

  // 認証チェック
  if (!request.auth) {
    throw new HttpsError('unauthenticated', '認証が必要です');
  }

  const adminId = request.auth.uid;

  try {
    // リクエストデータのバリデーション
    const validatedData = bankInfoSchema.parse(request.data);
    const {staffId, bankInfo} = validatedData;

    console.log(`銀行口座情報更新開始: staffId=${staffId}, adminId=${adminId}`);

    // デバイス権限の確認（role: adminのみ）
    const deviceQuery = await db.collection('devices')
      .where('uid', '==', adminId)
      .where('role', '==', 'admin')
      .limit(1)
      .get();

    console.log(`デバイスクエリ結果: ${deviceQuery.size}件`);
    if (deviceQuery.size > 0) {
      const deviceData = deviceQuery.docs[0].data();
      console.log(`デバイス情報:`, deviceData);
    }

    if (deviceQuery.empty) {
      // デバッグ用：全デバイスを確認
      const allDevicesQuery = await db.collection('devices')
        .where('uid', '==', adminId)
        .get();
      console.log(`ユーザー ${adminId} の全デバイス:`, allDevicesQuery.docs.map((doc) => doc.data()));
      throw new HttpsError('permission-denied', '管理者権限がありません');
    }

    // スタッフドキュメントの存在確認
    const staffDoc = await db.collection('staffs').doc(staffId).get();
    if (!staffDoc.exists) {
      throw new HttpsError('not-found', 'スタッフが見つかりません');
    }

    // 銀行口座情報を更新
    // 注意: 本番環境では銀行口座情報を暗号化して保存することを推奨
    await db.collection('staffs').doc(staffId).update({
      bankInfo: {
        ...bankInfo,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedBy: adminId,
      },
    });

    console.log(`銀行口座情報更新成功: staffId=${staffId}`);

    return {
      success: true,
      message: '銀行口座情報を更新しました',
    };
  } catch (error) {
    logOpsError({
      message: '銀行口座情報更新エラー:',
      failureType: 'business',
      functionEntry: 'updateStaffBankInfo',
      cause: error,
    });

    if (error instanceof z.ZodError) {
      throw new HttpsError(
        'invalid-argument',
        `入力データが無効です: ${error.errors.map((e) => e.message).join(', ')}`
      );
    }

    if (error instanceof HttpsError) {
      throw error;
    }

    throw new HttpsError('internal', `予期しないエラーが発生しました: ${error}`);
  }
});

