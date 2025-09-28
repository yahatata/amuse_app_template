import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { markActionAsRolledBack } from '../lib/actionLogger';

export interface UndoBustAndReentryParams {
  tournamentId: string;
  actionLogId: string;
  playerUid: string;
  playerName: string;
  tableId: string;
  seatNumber: number;
  rollBackBy: string;
}

/**
 * バスト＆リ・エントリー操作を巻き戻す
 */
export async function undoBustAndReentry(params: UndoBustAndReentryParams): Promise<void> {
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
      const currentReentries = mainViewData.reentries || 0;
      const currentPlayersIn = mainViewData.playersIn || 0;
      
      transaction.update(mainViewRef, {
        reentries: Math.max(0, currentReentries - 1),
        playersIn: Math.max(0, currentPlayersIn - 1),
        updatedAt: now,
      });
      
      // 2. todaysBills の該当プレイヤーをリ・エントリー前の状態に戻す
      const billsRef = db
        .collection('scheduledTournaments')
        .doc(params.tournamentId)
        .collection('todaysBills')
        .doc(params.playerUid);
        
      const billsDoc = await transaction.get(billsRef);
      if (billsDoc.exists) {
        const billsData = billsDoc.data()!;
        const currentReentries = billsData.reentries || 0;
        
        transaction.update(billsRef, {
          reentries: Math.max(0, currentReentries - 1),
          isBusted: true, // リ・エントリー前はバスト状態
          updatedAt: now,
        });
      }
      
      // 3. tablesSeat の該当シートをリ・エントリー前の状態に戻す
      const seatRef = db
        .collection('scheduledTournaments')
        .doc(params.tournamentId)
        .collection('tablesSeat')
        .doc(params.tableId);
        
      const seatDoc = await transaction.get(seatRef);
      if (seatDoc.exists) {
        const seatData = seatDoc.data()!;
        const seats = seatData.seats || {};
        
        // 該当シートをリ・エントリー前の状態に戻す
        if (seats[params.seatNumber]) {
          seats[params.seatNumber] = {
            ...seats[params.seatNumber],
            isBusted: true,
            reentryCount: (seats[params.seatNumber].reentryCount || 1) - 1,
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
    
    console.log(`Bust and reentry operation undone for player ${params.playerName} in tournament ${params.tournamentId}`);
    
  } catch (error) {
    console.error('Error undoing bust and reentry operation:', error);
    throw error;
  }
}
