import { onCall } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { z } from 'zod';
import { logOpsError } from "../../../shared/logging/logOpsError";

const db = getFirestore();

// 入力スキーマ（現在はパラメータ不要）
const getAvailableTablesSchema = z.object({});

export const getAvailableTables = onCall({
  region: 'us-central1',
  maxInstances: 10,
}, async (request) => {
  try {
    // 入力検証
    const validatedData = getAvailableTablesSchema.parse(request.data);
    
    console.log('=== getAvailableTables 開始 ===');
    console.log('入力データ:', validatedData);
    
    // status: 'open'のテーブルを取得
    const tablesSnapshot = await db
      .collection('tables')
      .where('status', '==', 'open')
      .get();
    
    console.log('取得件数:', tablesSnapshot.size);
    
    const tables = tablesSnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        tableId: doc.id,
        name: doc.id, // ドキュメントIDをテーブル名として使用
        maxSeats: data.maxSeats || 6,
        status: data.status || 'open',
      };
    });
    
    console.log('返却データ:', tables);
    
    return {
      success: true,
      tables: tables,
      count: tables.length,
    };
    
  } catch (error) {
    logOpsError({
      message: 'getAvailableTables エラー:',
      failureType: 'business',
      functionEntry: 'getAvailableTables',
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
