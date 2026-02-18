import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { markActionAsRolledBack } from "./actionLogger";

export interface UndoAssignSeatToPlayerParams {
  tournamentId: string;
  actionLogId: string;
  playerUid: string;
  playerName: string;
  tableId: string;
  seatNumber: number;
  rollBackBy: string;
}

/**
 * プレイヤーへのシート割当操作を巻き戻す
 */
export async function undoAssignSeatToPlayer(params: UndoAssignSeatToPlayerParams): Promise<void> {
  const db = getFirestore();
  const now = Timestamp.now();
  
  try {
    await db.runTransaction(async (transaction) => {
      // 1. main view の統計を更新
      const mainViewRef = db
        .collection('scheduledTournaments')
        .doc(params.tournamentId)
        .collection('views')
        .doc('main');
        
      const mainViewDoc = await transaction.get(mainViewRef);
      if (!mainViewDoc.exists) {
        throw new Error('Main view not found');
      }
      
      const mainViewData = mainViewDoc.data()!;
      const currentSeatedCount = mainViewData.seatedCount || 0;
      const currentWaitingCount = mainViewData.waitingCount || 0;
      
      transaction.update(mainViewRef, {
        seatedCount: Math.max(0, currentSeatedCount - 1),
        waitingCount: currentWaitingCount + 1,
        updatedAt: now,
      });
      
      // 2. tablesSeat の該当シートを空にする
      const seatRef = db
        .collection('scheduledTournaments')
        .doc(params.tournamentId)
        .collection('tablesSeat')
        .doc(params.tableId);
        
      const seatDoc = await transaction.get(seatRef);
      if (seatDoc.exists) {
        const seatData = seatDoc.data()!;
        const seats = seatData.seats || {};
        
        // 該当シートを空にする
        if (seats[params.seatNumber]) {
          delete seats[params.seatNumber];
          
          transaction.update(seatRef, {
            seats,
            updatedAt: now,
          });
        }
      }
      
      // 3. waiting リストにプレイヤーを戻す
      const waitingRef = db
        .collection('scheduledTournaments')
        .doc(params.tournamentId)
        .collection('tablesSeat')
        .doc('waiting');
        
      const waitingDoc = await transaction.get(waitingRef);
      if (waitingDoc.exists) {
        const waitingData = waitingDoc.data()!;
        const waiting = waitingData.waiting || {};
        
        // プレイヤーを待機リストに戻す
        waiting[params.playerUid] = {
          uid: params.playerUid,
          name: params.playerName,
          addedAt: now,
          updatedAt: now,
        };
        
        transaction.update(waitingRef, {
          waiting,
          count: Object.keys(waiting).length,
          updatedAt: now,
        });
      }
      
      // 4. actionLog をロールバック済みとしてマーク
      await markActionAsRolledBack(
        params.tournamentId,
        params.actionLogId,
        params.rollBackBy
      );
    });
    
    console.log(`Assign seat to player operation undone for player ${params.playerName} in tournament ${params.tournamentId}`);
    
  } catch (error) {
    console.error('Error undoing assign seat to player operation:', error);
    throw error;
  }
}
