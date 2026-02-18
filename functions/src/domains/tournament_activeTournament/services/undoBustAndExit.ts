import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { markActionAsRolledBack } from "./actionLogger";

export interface UndoBustAndExitParams {
  tournamentId: string;
  actionLogId: string;
  playerUid: string;
  playerName: string;
  tableId: string;
  seatNumber: number;
  rollBackBy: string;
}

/**
 * バスト＆退場操作を巻き戻す
 */
export async function undoBustAndExit(params: UndoBustAndExitParams): Promise<void> {
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
      const currentPlayersBusted = mainViewData.playersBusted || 0;
      const currentPlayersIn = mainViewData.playersIn || 0;
      
      transaction.update(mainViewRef, {
        playersBusted: Math.max(0, currentPlayersBusted - 1),
        playersIn: currentPlayersIn + 1,
        updatedAt: now,
      });
      
      // 2. todaysBills の該当プレイヤーを復活
      const billsRef = db
        .collection('scheduledTournaments')
        .doc(params.tournamentId)
        .collection('todaysBills')
        .doc(params.playerUid);
        
      const billsDoc = await transaction.get(billsRef);
      if (billsDoc.exists) {
        transaction.update(billsRef, {
          isBusted: false,
          bustedAt: null,
          updatedAt: now,
        });
      }
      
      // 3. tablesSeat の該当シートを復活
      const seatRef = db
        .collection('scheduledTournaments')
        .doc(params.tournamentId)
        .collection('tablesSeat')
        .doc(params.tableId);
        
      const seatDoc = await transaction.get(seatRef);
      if (seatDoc.exists) {
        const seatData = seatDoc.data()!;
        const seats = seatData.seats || {};
        
        // 該当シートを復活
        if (seats[params.seatNumber]) {
          seats[params.seatNumber] = {
            ...seats[params.seatNumber],
            isBusted: false,
            bustedAt: null,
            updatedAt: now,
          };
          
          transaction.update(seatRef, {
            seats,
            updatedAt: now,
          });
        }
      }
      
      // 4. actionLog をロールバック済みとしてマーク
      await markActionAsRolledBack(
        params.tournamentId,
        params.actionLogId,
        params.rollBackBy
      );
    });
    
    console.log(`Bust and exit operation undone for player ${params.playerName} in tournament ${params.tournamentId}`);
    
  } catch (error) {
    console.error('Error undoing bust and exit operation:', error);
    throw error;
  }
}
