import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { getCallerDeviceByUid, hasRequiredOption, isActive } from '../lib/devicePermissions';

export const endTournament = onCall(async (request) => {
  // 認証チェック
  if (!request.auth) {
    throw new HttpsError('unauthenticated', '認証が必要です');
  }

  const callerUid = request.auth.uid;

  try {
    // デバイス権限の確認（role: admin または options.tournament: true）
    const device = await getCallerDeviceByUid(callerUid);
    if (!device || !isActive(device.status)) {
      throw new HttpsError('permission-denied', 'デバイスが見つからないか、アクティブではありません');
    }

    const hasPermission = device.role === 'admin' || hasRequiredOption(device.options, 'tournament');
    if (!hasPermission) {
      throw new HttpsError('permission-denied', 'トーナメント運営の権限がありません');
    }

    const { tournamentId } = request.data;
    
    if (!tournamentId) {
      throw new HttpsError('invalid-argument', 'tournamentId is required');
    }
    
    const db = getFirestore();
    
    await db.runTransaction(async (transaction) => {
      // 全ての読み取り操作を先に実行
      
      // 1. tablesSeatサブコレクションからテーブル一覧を取得
      const tablesSeatSnapshot = await transaction.get(
        db.collection('scheduledTournaments')
          .doc(tournamentId)
          .collection('tablesSeat')
      );
      
      const tableNames: string[] = [];
      tablesSeatSnapshot.forEach((doc) => {
        if (doc.id !== 'waiting' && doc.id !== 'busted') {
          tableNames.push(doc.id);
        }
      });
      
      // 2. 各テーブルの存在確認（読み取り操作）
      const tableDocs = new Map<string, any>();
      for (const tableName of tableNames) {
        const tableRef = db.collection('tables').doc(tableName);
        const tableDoc = await transaction.get(tableRef);
        if (tableDoc.exists) {
          tableDocs.set(tableName, tableDoc.data());
        }
      }
      
      // 全ての読み取りが完了したので、ここから書き込み操作を開始
      
      // 3. scheduledTournamentのステータスを更新
      const tournamentRef = db.collection('scheduledTournaments').doc(tournamentId);
      transaction.update(tournamentRef, {
        status: 'ended',
        endedAt: new Date(),
      });
      
      // 4. 各テーブルのステータスをopenに変更
      for (const tableName of tableNames) {
        if (tableDocs.has(tableName)) {
          const tableRef = db.collection('tables').doc(tableName);
          transaction.update(tableRef, {
            status: 'open',
          });
        }
      }
    });
    
    return {
      success: true,
      message: 'Tournament ended successfully',
    };
    
  } catch (error) {
    console.error('endTournament error:', error);
    
    if (error instanceof HttpsError) {
      throw error;
    }
    
    throw new HttpsError('internal', 'Internal server error');
  }
});
