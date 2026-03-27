import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { z } from 'zod';
import { getCallerDeviceByUid, hasRequiredOption, isActive } from '../../../shared/devices';
import { logOpsError } from "../../../shared/logging/logOpsError";

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
    
    // トランザクション開始（Firestore: 全読み取り → 全書き込みの順で実行すること）
    await db.runTransaction(async (transaction) => {
      const tournamentTableRef = db
        .collection('scheduledTournaments')
        .doc(tournamentId)
        .collection('tablesSeat')
        .doc(tableId);
      const tableRef = db.collection('tables').doc(tableId);

      // 1. すべての読み取りを先に実行
      const [tournamentTableDoc, tableDoc] = await Promise.all([
        transaction.get(tournamentTableRef),
        transaction.get(tableRef),
      ]);

      if (!tournamentTableDoc.exists) {
        throw new Error('トーナメントに該当する卓が見つかりません');
      }
      const tableData = tournamentTableDoc.data()!;
      const seats = (tableData.seats as { [key: string]: string | null } | undefined) ?? {};

      const hasOccupiedSeats = Object.entries(seats).some(
        ([key, value]) => {
          if (!key.endsWith('UserId')) return false;
          return value != null && typeof value === 'string' && value.trim().length > 0;
        }
      );
      if (hasOccupiedSeats) {
        throw new Error('着席しているユーザーがいるため、卓を削除できません');
      }

      if (!tableDoc.exists) {
        throw new Error('テーブルが存在しません');
      }

      // 2. 読み取りの後に書き込み
      transaction.delete(tournamentTableRef);
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
    logOpsError({
      message: '=== 卓削除エラー ===',
      failureType: 'business',
      functionEntry: 'removeTableFromTournament',
      cause: error,
    });
    
    // エラーメッセージを適切に返す
    if (error instanceof Error) {
      throw new HttpsError('internal', error.message);
    } else {
      throw new HttpsError('internal', '卓削除に失敗しました');
    }
  }
});

