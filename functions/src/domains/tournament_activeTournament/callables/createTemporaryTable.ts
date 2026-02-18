import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { z } from 'zod';
import { getCallerDeviceByUid, hasRequiredOption, isActive } from '../../../shared/devices';

// 入力スキーマ
const createTemporaryTableSchema = z.object({
  tableName: z.string().min(1, 'テーブル名称は必須です'),
  maxSeats: z.number().int().positive().max(20, '最大座席数は20までです'),
});

export const createTemporaryTable = onCall(async (request) => {
  // 認証チェック
  if (!request.auth) {
    throw new HttpsError('unauthenticated', '認証が必要です');
  }

  const callerUid = request.auth.uid;

  // デバイス権限の確認（role: admin または options.tournament: true）
  const device = await getCallerDeviceByUid(callerUid);
  if (!device || !isActive(device.status)) {
    throw new HttpsError('permission-denied', 'デバイスが見つからないか、アクティブではありません');
  }

  const hasPermission = device.role === 'admin' || hasRequiredOption(device.options, 'tournament');
  if (!hasPermission) {
    throw new HttpsError('permission-denied', 'トーナメント運営の権限がありません');
  }

  try {
    // データを取得
    const { data } = request;
    
    // 入力検証
    const { tableName, maxSeats } = createTemporaryTableSchema.parse(data);
    
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
      
      // 4. sideGameコレクションにドキュメント作成（ドキュメントID = テーブル名）
      const sideGameTableRef = db
        .collection('sideGame')
        .doc(tableName);
      
      transaction.set(sideGameTableRef, {
        tableId: tableName, // テーブル名をtableIdとして使用
        name: tableName,
        maxSeats: maxSeats,
        seats: seats,
        active: false, // 初期値はfalse
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
      throw new HttpsError('internal', error.message);
    } else {
      throw new HttpsError('internal', '一時テーブル作成に失敗しました');
    }
  }
});
