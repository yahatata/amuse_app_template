import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { z } from "zod";

// 入力スキーマの定義
const getActionLogsSchema = z.object({
  tournamentId: z.string().min(1, "トーナメントIDは必須です"),
  deviceId: z.string().optional(), // 特定のデバイスの操作のみを取得する場合
  limit: z.number().min(1).max(100).optional().default(50), // 取得件数制限
  startAfter: z.string().optional(), // ページネーション用
});

export const getActionLogs = onCall(async (request) => {
  try {
    // 入力検証
    const validatedData = getActionLogsSchema.parse(request.data);
    const { tournamentId, deviceId, limit, startAfter } = validatedData;

    const db = getFirestore();
    
    // クエリを構築
    let query = db
      .collection('scheduledTournaments')
      .doc(tournamentId)
      .collection('actionLog')
      .orderBy('createdAt', 'desc')
      .limit(limit);

    // 特定のデバイスの操作のみを取得する場合
    if (deviceId) {
      query = query.where('deviceId', '==', deviceId);
    }

    // ページネーション
    if (startAfter) {
      const startAfterDoc = await db
        .collection('scheduledTournaments')
        .doc(tournamentId)
        .collection('actionLog')
        .doc(startAfter)
        .get();
      
      if (startAfterDoc.exists) {
        query = query.startAfter(startAfterDoc);
      }
    }

    // クエリ実行
    const querySnapshot = await query.get();
    
    console.log('=== Query Result Debug ===');
    console.log('Query result docs count:', querySnapshot.docs.length);
    if (querySnapshot.docs.length > 0) {
      const firstDoc = querySnapshot.docs[0];
      console.log('First doc ID:', firstDoc.id);
      console.log('First doc data keys:', Object.keys(firstDoc.data()));
      console.log('First doc createdAt:', firstDoc.data().createdAt);
      console.log('First doc createdAt type:', typeof firstDoc.data().createdAt);
      console.log('First doc createdAt constructor:', firstDoc.data().createdAt?.constructor?.name);
    }
    console.log('=== End Query Result Debug ===');
    
    // 結果を整形
    const actionLogs = querySnapshot.docs.map(doc => {
      const data = doc.data();
      
      // デバッグ用：createdAtの詳細をログ出力
      console.log(`=== ActionLog createdAt Debug for ${doc.id} ===`);
      console.log('createdAt raw:', data.createdAt);
      console.log('createdAt type:', typeof data.createdAt);
      console.log('createdAt has toDate:', typeof data.createdAt?.toDate === 'function');
      console.log('createdAt keys:', Object.keys(data.createdAt || {}));
      console.log('createdAt constructor:', data.createdAt?.constructor?.name);
      console.log('createdAt prototype:', Object.getPrototypeOf(data.createdAt));
      
      // より詳細なデバッグ情報
      if (data.createdAt && typeof data.createdAt === 'object') {
        console.log('createdAt is object, checking properties:');
        for (const key in data.createdAt) {
          console.log(`  ${key}: ${data.createdAt[key]} (${typeof data.createdAt[key]})`);
        }
      }
      
      console.log('Full data object:', JSON.stringify(data, null, 2));
      
      let createdAt = null;
      
      // Firestore Timestampの場合
      if (data.createdAt && typeof data.createdAt === 'object' && data.createdAt.constructor.name === 'Timestamp') {
        try {
          createdAt = data.createdAt.toDate();
          console.log('Firestore Timestamp detected, toDate():', createdAt);
        } catch (error) {
          console.error('toDate() error:', error);
          createdAt = data.createdAt;
        }
      }
      // Firestore Admin SDK Timestampの場合
      else if (data.createdAt instanceof Timestamp) {
        try {
          createdAt = data.createdAt.toDate();
          console.log('Firestore Admin SDK Timestamp detected, toDate():', createdAt);
        } catch (error) {
          console.error('Admin SDK toDate() error:', error);
          createdAt = data.createdAt;
        }
      }
      // Firestore Timestampの別の形式（toDateメソッドを持つオブジェクト）
      else if (data.createdAt && typeof data.createdAt === 'object' && typeof data.createdAt.toDate === 'function') {
        try {
          createdAt = data.createdAt.toDate();
          console.log('Firestore Timestamp-like object with toDate() detected, converted:', createdAt);
        } catch (error) {
          console.error('toDate() method error:', error);
          createdAt = data.createdAt;
        }
      }
      // Firestore Timestampの別の形式（_seconds, _nanosecondsを持つオブジェクト）
      else if (data.createdAt && typeof data.createdAt === 'object' && data.createdAt._seconds !== undefined) {
        try {
          const seconds = data.createdAt._seconds;
          const nanoseconds = data.createdAt._nanoseconds || 0;
          createdAt = new Date(seconds * 1000 + nanoseconds / 1000000);
          console.log('Firestore Timestamp-like object detected, converted:', createdAt);
        } catch (error) {
          console.error('Timestamp-like conversion error:', error);
          createdAt = data.createdAt;
        }
      }
      // Firestore Timestampの別の形式（seconds, nanosecondsを持つオブジェクト）
      else if (data.createdAt && typeof data.createdAt === 'object' && data.createdAt.seconds !== undefined) {
        try {
          const seconds = data.createdAt.seconds;
          const nanoseconds = data.createdAt.nanoseconds || 0;
          createdAt = new Date(seconds * 1000 + nanoseconds / 1000000);
          console.log('Firestore Timestamp-like object (seconds/nanoseconds) detected, converted:', createdAt);
        } catch (error) {
          console.error('Timestamp-like conversion error (seconds/nanoseconds):', error);
          createdAt = data.createdAt;
        }
      }
      // 通常のDateオブジェクトの場合
      else if (data.createdAt instanceof Date) {
        createdAt = data.createdAt;
        console.log('Date object detected:', createdAt);
      }
      // その他の場合
      else if (data.createdAt) {
        createdAt = data.createdAt;
        console.log('Other type detected:', createdAt);
      }
      
      // createdAtがnullまたは無効な場合は元のデータをそのまま使用
      if (createdAt === null || createdAt === undefined) {
        createdAt = data.createdAt;
        console.log('createdAt fallback to original:', createdAt);
      }
      
      // 最終的なcreatedAtが無効な場合の追加チェック
      if (createdAt && typeof createdAt === 'object' && Object.keys(createdAt).length === 0) {
        console.log('WARNING: createdAt is an empty object, attempting to recover from original data');
        // 元のデータから再度タイムスタンプを抽出
        if (data.createdAt && typeof data.createdAt === 'object') {
          const keys = Object.keys(data.createdAt);
          console.log('Original createdAt keys:', keys);
          if (keys.includes('_seconds') || keys.includes('seconds')) {
            const seconds = data.createdAt._seconds || data.createdAt.seconds;
            const nanoseconds = data.createdAt._nanoseconds || data.createdAt.nanoseconds || 0;
            if (seconds) {
              createdAt = new Date(seconds * 1000 + nanoseconds / 1000000);
              console.log('Recovered createdAt from original data:', createdAt);
            }
          }
        }
      }
      
      // 最後の手段：Firestoreのタイムスタンプ型を直接ISO文字列に変換
      if (createdAt && typeof createdAt === 'object' && Object.keys(createdAt).length === 0) {
        console.log('FINAL ATTEMPT: Converting Firestore Timestamp to ISO string');
        try {
          // Firestoreのタイムスタンプ型を直接ISO文字列に変換
          if (data.createdAt && typeof data.createdAt === 'object') {
            // タイムスタンプ型の場合は、直接ISO文字列に変換
            if (data.createdAt.constructor && data.createdAt.constructor.name === 'Timestamp') {
              createdAt = data.createdAt.toDate().toISOString();
              console.log('Converted to ISO string:', createdAt);
            } else if (typeof data.createdAt.toDate === 'function') {
              createdAt = data.createdAt.toDate().toISOString();
              console.log('Converted to ISO string via toDate():', createdAt);
            }
          }
        } catch (error) {
          console.error('Final conversion attempt failed:', error);
        }
      }
      
      // 最終的なcreatedAtの値をログ出力
      console.log('Final createdAt value:', createdAt);
      console.log('Final createdAt type:', typeof createdAt);
      console.log('Final createdAt constructor:', createdAt?.constructor?.name);
      
      let rollBackAt = null;
      if (data.rollBackAt?.toDate && typeof data.rollBackAt.toDate === 'function') {
        rollBackAt = data.rollBackAt.toDate();
      } else if (data.rollBackAt) {
        rollBackAt = data.rollBackAt;
      }
      
      const result = {
        id: doc.id,
        action: data.action,
        deviceId: data.deviceId,
        deviceName: data.deviceName,
        targetUid: data.targetUid,
        targetPlayerName: data.targetPlayerName,
        tableId: data.tableId,
        seatNumber: data.seatNumber,
        details: data.details,
        createdAt: createdAt,
        isRollBack: data.isRollBack,
        rollBackBy: data.rollBackBy,
        rollBackAt: rollBackAt,
      };
      
      console.log('Final result object:', JSON.stringify(result, null, 2));
      return result;
    });

    // 次のページがあるかチェック
    const hasNextPage = querySnapshot.docs.length === limit;
    const lastDoc = querySnapshot.docs[querySnapshot.docs.length - 1];

    return {
      success: true,
      actionLogs,
      hasNextPage,
      nextCursor: hasNextPage ? lastDoc.id : null,
      totalCount: actionLogs.length,
    };

  } catch (error) {
    console.error('アクションログ取得エラー:', error);
    
    if (error instanceof z.ZodError) {
      throw new HttpsError('invalid-argument', `入力検証エラー: ${error.errors.map(e => e.message).join(', ')}`);
    }
    
    if (error instanceof HttpsError) {
      throw error;
    }
    
    throw new HttpsError('internal', 'アクションログの取得に失敗しました');
  }
});
