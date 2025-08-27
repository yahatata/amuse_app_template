import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { z } from 'zod';

// 入力スキーマ
const createTemporaryTableSchema = z.object({
  tableName: z.string().min(1, 'テーブル名称は必須です'),
  maxSeats: z.number().int().positive().max(20, '最大座席数は20までです'),
});

export const createTemporaryTable = functions.https.onCall(async (data, context) => {
  try {
    // 正しいデータの場所を取得
    const actualData = data.data || data;
    
    // 入力検証
    const { tableName, maxSeats } = createTemporaryTableSchema.parse(actualData);
    
    console.log(`=== 一時テーブル作成開始 ===`);
    console.log(`tableName: ${tableName}`);
    console.log(`maxSeats: ${maxSeats}`);
    
    const db = admin.firestore();
    
    // トランザクション開始
    const result = await db.runTransaction(async (transaction) => {
      // 1. テーブル名のユニーク性チェック
      const existingTableRef = db.collection('tables').doc(tableName);
      const existingTableDoc = await transaction.get(existingTableRef);
      
      if (existingTableDoc.exists) {
        throw new Error(`テーブル名 "${tableName}" は既に使用されています`);
      }
      
      // 2. シート情報を動的に生成（新しい構造）
      const seats: { [key: string]: string | null } = {};
      for (let i = 1; i <= maxSeats; i++) {
        const seatNumber = i.toString().padStart(2, '0'); // 01, 02, 03...
        seats[`seat${seatNumber}UserId`] = null;
        seats[`seat${seatNumber}PokerName`] = null;
      }
      
      // 3. tablesコレクションにテーブルを作成（ドキュメントID = テーブル名）
      const tableRef = db.collection('tables').doc(tableName);
      
      transaction.set(tableRef, {
        name: tableName,
        maxSeats: maxSeats,
        status: 'open',
        isEnabled: true,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      
      // 4. temporaryTablesコレクションにドキュメント作成（ドキュメントID = テーブル名）
      const temporaryTableSeatRef = db
        .collection('temporaryTables')
        .doc(tableName);
      
      transaction.set(temporaryTableSeatRef, {
        tableId: tableName, // テーブル名をtableIdとして使用
        name: tableName,
        maxSeats: maxSeats,
        seats: seats,
        isEnabled: true,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      
      return { 
        success: true, 
        tableId: tableName, // テーブル名をtableIdとして返す
        tableName, 
        maxSeats,
        seats: seats,
        message: '一時テーブルが正常に作成されました'
      };
    });
    
    console.log(`=== 一時テーブル作成完了 ===`);
    console.log(`結果:`, result);
    
    return result;
    
  } catch (error) {
    console.error('=== 一時テーブル作成エラー ===');
    console.error(error);
    
    // エラーメッセージを適切に返す
    if (error instanceof Error) {
      throw new functions.https.HttpsError('internal', error.message);
    } else {
      throw new functions.https.HttpsError('internal', '一時テーブル作成に失敗しました');
    }
  }
});
