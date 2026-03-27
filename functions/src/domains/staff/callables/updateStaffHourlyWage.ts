import { onCall } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { z } from "zod";
import { logOpsError } from "../../../shared/logging/logOpsError";

// 入力スキーマ
const updateStaffHourlyWageSchema = z.object({
  staffId: z.string(),
  hourlyWage: z.number().min(0).max(10000), // 時給は0円〜10,000円の範囲
});

export const updateStaffHourlyWage = onCall(async (request) => {
  try {
    // 入力検証
    const { staffId, hourlyWage } = updateStaffHourlyWageSchema.parse(request.data);
    
    // 認証確認
    if (!request.auth) {
      throw new Error('認証が必要です');
    }
    
    const adminId = request.auth.uid;
    
    console.log(`=== スタッフ時給更新開始 ===`);
    console.log(`adminId: ${adminId}`);
    console.log(`staffId: ${staffId}`);
    console.log(`hourlyWage: ${hourlyWage}`);
    
    const db = admin.firestore();
    
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
      console.log(`ユーザー ${adminId} の全デバイス:`, allDevicesQuery.docs.map(doc => doc.data()));
      throw new Error('管理者権限がありません');
    }
    
    // スタッフ情報の存在確認
    const staffRef = db.collection('staffs').doc(staffId);
    const staffDoc = await staffRef.get();
    
    if (!staffDoc.exists) {
      throw new Error('指定されたスタッフが見つかりません');
    }
    
    const staffData = staffDoc.data()!;
    const previousHourlyWage = staffData.hourlyWage || 0;
    
    // 時給を更新
    await staffRef.update({
      hourlyWage: hourlyWage,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    
    // 更新ログを記録
    await db.collection('staffUpdateLogs').add({
      staffId: staffId,
      staffName: staffData.fullName || '不明',
      adminId: adminId,
      updateType: 'hourlyWage',
      previousValue: previousHourlyWage,
      newValue: hourlyWage,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    
    console.log(`=== スタッフ時給更新完了 ===`);
    console.log(`スタッフ ${staffData.fullName} の時給を ${previousHourlyWage}円 → ${hourlyWage}円 に更新しました`);
    
    return {
      success: true,
      message: '時給を更新しました',
      data: {
        staffId,
        staffName: staffData.fullName,
        previousHourlyWage,
        newHourlyWage: hourlyWage,
        updatedAt: new Date().toISOString(),
      }
    };
    
  } catch (error) {
    logOpsError({
      message: '=== スタッフ時給更新エラー ===',
      failureType: 'business',
      functionEntry: 'updateStaffHourlyWage',
      cause: error,
    });
    
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: '入力検証エラー',
        details: error.errors,
      };
    }
    
    return {
      success: false,
      error: error instanceof Error ? error.message : '不明なエラー',
    };
  }
});
