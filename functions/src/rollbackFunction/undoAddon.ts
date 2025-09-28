import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { markActionAsRolledBack } from '../lib/actionLogger';

export interface UndoAddonParams {
  tournamentId: string;
  actionLogId: string;
  playerUid: string;
  playerName: string;
  tableId: string;
  seatNumber: number;
  addonAmount: number;
  rollBackBy: string;
}

/**
 * アドオン操作を巻き戻す
 */
export async function undoAddon(params: UndoAddonParams): Promise<void> {
  const db = getFirestore();
  const now = Timestamp.now();
  
  try {
    await db.runTransaction(async (transaction) => {
      // 1. main view から addon を減算
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
      const currentAddons = mainViewData.addons || 0;
      
      transaction.update(mainViewRef, {
        addons: Math.max(0, currentAddons - 1), // 負の値にならないように
        updatedAt: now,
      });
      
      // 2. todaysBills から該当プレイヤーの addon 記録を削除または更新
      const billsRef = db
        .collection('scheduledTournaments')
        .doc(params.tournamentId)
        .collection('todaysBills')
        .doc(params.playerUid);
        
      const billsDoc = await transaction.get(billsRef);
      if (billsDoc.exists) {
        const billsData = billsDoc.data()!;
        const currentAddons = billsData.addons || 0;
        
        transaction.update(billsRef, {
          addons: Math.max(0, currentAddons - 1),
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
    
    console.log(`Addon operation undone for player ${params.playerName} in tournament ${params.tournamentId}`);
    
  } catch (error) {
    console.error('Error undoing addon operation:', error);
    throw error;
  }
}
