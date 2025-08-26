import * as functions from 'firebase-functions';
import { migrateAllToHybridStructure } from '../utils/migrateToHybridStructure';

/**
 * 全データをハイブリッド形式に移行するCloud Function
 * 
 * 使用方法:
 * 1. この関数をデプロイ
 * 2. 必要に応じて呼び出し
 * 3. 変換後はこの関数を削除
 */

export const migrateToHybridStructureCallable = functions.https.onCall(async (data, context) => {
  try {
    console.log('=== ハイブリッド形式移行開始 ===');
    
    // 管理者権限チェック（必要に応じて）
    // if (!context.auth?.token.admin) {
    //   throw new functions.https.HttpsError('permission-denied', '管理者権限が必要です');
    // }
    
    await migrateAllToHybridStructure();
    
    console.log('=== ハイブリッド形式移行完了 ===');
    
    return {
      success: true,
      message: 'ハイブリッド形式への移行が完了しました'
    };
    
  } catch (error) {
    console.error('=== ハイブリッド形式移行エラー ===');
    console.error(error);
    
    if (error instanceof Error) {
      throw new functions.https.HttpsError('internal', error.message);
    } else {
      throw new functions.https.HttpsError('internal', 'ハイブリッド形式移行に失敗しました');
    }
  }
});
