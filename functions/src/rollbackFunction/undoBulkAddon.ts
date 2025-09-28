import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { markActionAsRolledBack } from '../lib/actionLogger';

export interface UndoBulkAddonParams {
  tournamentId: string;
  actionLogId: string;
  playerUids: string[];
  playerNames: string[];
  tableId: string;
  rollBackBy: string;
}

/**
 * 複数アドオン操作を巻き戻す
 */
export async function undoBulkAddon(params: UndoBulkAddonParams): Promise<void> {
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
      const addonCount = params.playerUids.length;
      
      transaction.update(mainViewRef, {
        addons: Math.max(0, currentAddons - addonCount),
        updatedAt: now,
      });
      
      // 2. todaysBills から各プレイヤーの addon 記録を更新
      for (const playerUid of params.playerUids) {
        const billsRef = db
          .collection('scheduledTournaments')
          .doc(params.tournamentId)
          .collection('todaysBills')
          .doc(playerUid);
          
        const billsDoc = await transaction.get(billsRef);
        if (billsDoc.exists) {
          const billsData = billsDoc.data()!;
          const currentAddons = billsData.addons || 0;
          
          transaction.update(billsRef, {
            addons: Math.max(0, currentAddons - 1),
            updatedAt: now,
          });
        }
      }
      
      // 3. actionLog をロールバック済みとしてマーク
      await markActionAsRolledBack(
        params.tournamentId,
        params.actionLogId,
        params.rollBackBy
      );
    });
    
    console.log(`Bulk addon operation undone for ${params.playerUids.length} players in tournament ${params.tournamentId}`);
    
  } catch (error) {
    console.error('Error undoing bulk addon operation:', error);
    throw error;
  }
}
