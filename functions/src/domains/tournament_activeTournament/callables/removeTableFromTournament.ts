import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { z } from 'zod';
import { getCallerDeviceByUid, hasRequiredOption, isActive } from '../../../shared/devices';

// 入力スキーマ
const removeTableFromTournamentSchema = z.object({
  tournamentId: z.string(),
  tableId: z.string(),
});

export const removeTableFromTournament = onCall(async (request) => {
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
    console.log('=== 卓削除: 受信データ ===');
    const { data } = request;
    
    // 入力検証
    const { tournamentId, tableId } = removeTableFromTournamentSchema.parse(data);
    
    console.log(`=== 卓削除開始 ===`);
    console.log(`tournamentId: ${tournamentId}`);
    console.log(`tableId: ${tableId}`);
    
    const db = admin.firestore();
    
    // トランザクション開始
    await db.runTransaction(async (transaction) => {
      // 1. tablesSeatサブコレクションのドキュメントを取得して確認
      const tournamentTableRef = db
        .collection('scheduledTournaments')
        .doc(tournamentId)
        .collection('tablesSeat')
        .doc(tableId);
      
      const tournamentTableDoc = await transaction.get(tournamentTableRef);
      
      if (!tournamentTableDoc.exists) {
        throw new Error('トーナメントに該当する卓が見つかりません');
      }
      
      const tableData = tournamentTableDoc.data()!;
      const seats = tableData.seats as { [key: string]: string | null } | undefined ?? {};
      
      // 着席しているユーザーがいるかチェック
      const hasOccupiedSeats = Object.entries(seats).some(
        ([key, value]) => {
          if (!key.endsWith('UserId')) return false;
          // null、空文字列、空の値をチェック
          return value != null && 
                 typeof value === 'string' && 
                 value.trim().length > 0;
        }
      );
      
      if (hasOccupiedSeats) {
        throw new Error('着席しているユーザーがいるため、卓を削除できません');
      }
      
      // 2. tablesSeatサブコレクションのドキュメントを削除
      transaction.delete(tournamentTableRef);
      
      // 3. tablesコレクションのstatusをopenに変更
      const tableRef = db.collection('tables').doc(tableId);
      const tableDoc = await transaction.get(tableRef);
      
      if (!tableDoc.exists) {
        throw new Error('テーブルが存在しません');
      }
      
      transaction.update(tableRef, {
        status: 'open',
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    });
    
    console.log(`=== 卓削除完了 ===`);
    
    return {
      success: true,
      message: '卓を削除しました',
    };
    
  } catch (error) {
    console.error('=== 卓削除エラー ===');
    console.error(error);
    
    // エラーメッセージを適切に返す
    if (error instanceof Error) {
      throw new HttpsError('internal', error.message);
    } else {
      throw new HttpsError('internal', '卓削除に失敗しました');
    }
  }
});

