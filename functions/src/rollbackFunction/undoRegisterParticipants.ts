import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { markActionAsRolledBack } from '../lib/actionLogger';

export interface UndoRegisterParticipantsParams {
  tournamentId: string;
  actionLogId: string;
  playerUids: string[];
  playerNames: string[];
  rollBackBy: string;
}

/**
 * プレイヤー登録操作を巻き戻す
 */
export async function undoRegisterParticipants(params: UndoRegisterParticipantsParams): Promise<void> {
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
      const currentEntries = mainViewData.entries || 0;
      const currentPlayersIn = mainViewData.playersIn || 0;
      const playerCount = params.playerUids.length;
      
      transaction.update(mainViewRef, {
        entries: Math.max(0, currentEntries - playerCount),
        playersIn: Math.max(0, currentPlayersIn - playerCount),
        updatedAt: now,
      });
      
      // 2. todaysBills から該当プレイヤーを削除
      for (const playerUid of params.playerUids) {
        const billsRef = db
          .collection('scheduledTournaments')
          .doc(params.tournamentId)
          .collection('todaysBills')
          .doc(playerUid);
          
        transaction.delete(billsRef);
      }
      
      // 3. usersList から該当プレイヤーを削除
      const usersListRef = db
        .collection('scheduledTournaments')
        .doc(params.tournamentId)
        .collection('views')
        .doc('usersList');
        
      const usersListDoc = await transaction.get(usersListRef);
      if (usersListDoc.exists) {
        const usersListData = usersListDoc.data()!;
        const users = usersListData.users || {};
        
        // 該当プレイヤーを削除
        for (const playerUid of params.playerUids) {
          delete users[playerUid];
        }
        
        transaction.update(usersListRef, {
          users,
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
    
    console.log(`Register participants operation undone for ${params.playerUids.length} players in tournament ${params.tournamentId}`);
    
  } catch (error) {
    console.error('Error undoing register participants operation:', error);
    throw error;
  }
}
