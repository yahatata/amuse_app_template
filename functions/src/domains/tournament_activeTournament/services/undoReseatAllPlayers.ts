import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { markActionAsRolledBack } from "./actionLogger";

export interface UndoReseatAllPlayersParams {
  tournamentId: string;
  actionLogId: string;
  previousSeatingData: Record<string, any>; // 前の座席配置データ
  rollBackBy: string;
}

/**
 * 全員再配置操作を巻き戻す
 */
export async function undoReseatAllPlayers(params: UndoReseatAllPlayersParams): Promise<void> {
  const db = getFirestore();
  const now = Timestamp.now();
  
  try {
    await db.runTransaction(async (transaction) => {
      // 1. 前の座席配置データを復元
      for (const [tableId, tableData] of Object.entries(params.previousSeatingData)) {
        if (tableId === 'waiting') {
          // waiting リストを復元
          const waitingRef = db
            .collection('scheduledTournaments')
            .doc(params.tournamentId)
            .collection('tablesSeat')
            .doc('waiting');
            
          transaction.set(waitingRef, {
            waiting: tableData.waiting || {},
            count: Object.keys(tableData.waiting || {}).length,
            updatedAt: now,
          });
        } else {
          // 各テーブルの座席配置を復元
          const seatRef = db
            .collection('scheduledTournaments')
            .doc(params.tournamentId)
            .collection('tablesSeat')
            .doc(tableId);
            
          transaction.set(seatRef, {
            seats: tableData.seats || {},
            updatedAt: now,
          });
        }
      }
      
      // 2. main view の統計を復元
      const mainViewRef = db
        .collection('scheduledTournaments')
        .doc(params.tournamentId)
        .collection('views')
        .doc('main');
        
      const mainViewDoc = await transaction.get(mainViewRef);
      if (mainViewDoc.exists) {
        // 前の座席配置から統計を計算
        let seatedCount = 0;
        let waitingCount = 0;
        
        for (const [tableId, tableData] of Object.entries(params.previousSeatingData)) {
          if (tableId === 'waiting') {
            waitingCount = Object.keys(tableData.waiting || {}).length;
          } else {
            seatedCount += Object.keys(tableData.seats || {}).length;
          }
        }
        
        transaction.update(mainViewRef, {
          seatedCount,
          waitingCount,
          updatedAt: now,
        });
      }
      
      // 3. actionLog をロールバック済みとしてマーク
      await markActionAsRolledBack(
        params.tournamentId,
        params.actionLogId,
        params.rollBackBy
      );
    });
    
    console.log(`Reseat all players operation undone in tournament ${params.tournamentId}`);
    
  } catch (error) {
    console.error('Error undoing reseat all players operation:', error);
    throw error;
  }
}
