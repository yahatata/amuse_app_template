import * as admin from 'firebase-admin';

/**
 * ハイブリッド方式への移行スクリプト
 * 
 * 使用方法:
 * 1. このファイルをfunctions/src/utils/に配置
 * 2. 必要に応じてmigrateToHybridStructure関数を呼び出し
 * 3. 変換後はこのファイルを削除
 */

/**
 * 特定のトーナメントのwaitingデータをハイブリッド形式に変換
 */
export async function migrateWaitingToHybrid(tournamentId: string): Promise<boolean> {
  try {
    console.log(`=== waitingデータハイブリッド移行開始: ${tournamentId} ===`);
    
    const db = admin.firestore();
    const waitingRef = db
      .collection('scheduledTournaments')
      .doc(tournamentId)
      .collection('tablesSeat')
      .doc('waiting');
    
    // 現在のデータを取得
    const waitingDoc = await waitingRef.get();
    if (!waitingDoc.exists) {
      console.log('waitingドキュメントが存在しません');
      return false;
    }
    
    const currentData = waitingDoc.data()!;
    const waiting = currentData.waiting;
    
    // 既にハイブリッド形式の場合は変換不要
    if (waiting && typeof waiting === 'object' && !Array.isArray(waiting)) {
      const firstValue = Object.values(waiting)[0];
      if (firstValue && typeof firstValue === 'object' && 'pokerName' in firstValue) {
        console.log('既にハイブリッド形式です。変換不要。');
        return true;
      }
    }
    
    // 旧形式からハイブリッド形式に変換
    const newWaiting: { [userId: string]: any } = {};
    let order = 1;
    
    if (typeof waiting === 'object' && !Array.isArray(waiting)) {
      // Map形式の場合
      for (const [userId, value] of Object.entries(waiting)) {
        if (value === true) {
          // todaysBillsからユーザー情報を取得
          try {
            const todayBillsDoc = await db.collection('todaysBills').doc(userId).get();
            let pokerName = `Player_${userId}`;
            
            if (todayBillsDoc.exists) {
              const todayBillsData = todayBillsDoc.data()!;
              pokerName = todayBillsData.pokerName || pokerName;
            }
            
            newWaiting[userId] = {
              pokerName: pokerName,
              joinedAt: admin.firestore.Timestamp.now(),
              order: order++
            };
          } catch (error) {
            console.error(`ユーザー情報取得エラー (${userId}):`, error);
            newWaiting[userId] = {
              pokerName: `Player_${userId}`,
              joinedAt: admin.firestore.Timestamp.now(),
              order: order++
            };
          }
        }
      }
    } else if (Array.isArray(waiting)) {
      // List形式の場合
      for (const item of waiting) {
        if (item && item.userId) {
          newWaiting[item.userId] = {
            pokerName: item.pokerName || `Player_${item.userId}`,
            joinedAt: item.joinedAt || admin.firestore.Timestamp.now(),
            order: order++
          };
        }
      }
    }
    
    // 新しいデータで更新
    await waitingRef.update({
      waiting: newWaiting,
      count: Object.keys(newWaiting).length,
      updatedAt: admin.firestore.Timestamp.now(),
    });
    
    console.log(`=== waitingデータハイブリッド移行完了: ${tournamentId} ===`);
    console.log(`変換されたユーザー数: ${Object.keys(newWaiting).length}`);
    
    return true;
    
  } catch (error) {
    console.error(`waitingデータハイブリッド移行エラー (${tournamentId}):`, error);
    return false;
  }
}

/**
 * 特定のテーブルのseatsデータを新しい構造に変換
 */
export async function migrateSeatsToNewStructure(tournamentId: string, tableId: string): Promise<boolean> {
  try {
    console.log(`=== seatsデータ新構造移行開始: ${tournamentId}/${tableId} ===`);
    
    const db = admin.firestore();
    const tableSeatRef = db
      .collection('scheduledTournaments')
      .doc(tournamentId)
      .collection('tablesSeat')
      .doc(tableId);
    
    // 現在のデータを取得
    const tableSeatDoc = await tableSeatRef.get();
    if (!tableSeatDoc.exists) {
      console.log('tableSeatドキュメントが存在しません');
      return false;
    }
    
    const currentData = tableSeatDoc.data()!;
    const seats = currentData.seats;
    
    // 既に新しい構造の場合は変換不要
    if (seats && typeof seats === 'object') {
      const hasNewStructure = Object.keys(seats).some(key => key.includes('UserId') || key.includes('PokerName'));
      if (hasNewStructure) {
        console.log('既に新しい構造です。変換不要。');
        return true;
      }
    }
    
    // 旧構造から新構造に変換
    const newSeats: { [key: string]: string | null } = {};
    
    if (seats && typeof seats === 'object') {
      for (const [seatKey, userId] of Object.entries(seats)) {
        if (seatKey.startsWith('seat') && typeof userId === 'string') {
          const seatNumber = seatKey.substring(4); // "seat" + number
          const paddedSeatNumber = seatNumber.padStart(2, '0');
          
          if (userId && userId.trim() !== '') {
            // todaysBillsからユーザー情報を取得
            try {
              const todayBillsDoc = await db.collection('todaysBills').doc(userId).get();
              let pokerName = `Player_${userId}`;
              
              if (todayBillsDoc.exists) {
                const todayBillsData = todayBillsDoc.data()!;
                pokerName = todayBillsData.pokerName || pokerName;
              }
              
              newSeats[`seat${paddedSeatNumber}UserId`] = userId;
              newSeats[`seat${paddedSeatNumber}PokerName`] = pokerName;
            } catch (error) {
              console.error(`ユーザー情報取得エラー (${userId}):`, error);
              newSeats[`seat${paddedSeatNumber}UserId`] = userId;
              newSeats[`seat${paddedSeatNumber}PokerName`] = `Player_${userId}`;
            }
          } else {
            newSeats[`seat${paddedSeatNumber}UserId`] = null;
            newSeats[`seat${paddedSeatNumber}PokerName`] = null;
          }
        }
      }
    }
    
    // 新しいデータで更新
    await tableSeatRef.update({
      seats: newSeats,
      updatedAt: admin.firestore.Timestamp.now(),
    });
    
    console.log(`=== seatsデータ新構造移行完了: ${tournamentId}/${tableId} ===`);
    console.log(`変換された座席数: ${Object.keys(newSeats).length / 2}`);
    
    return true;
    
  } catch (error) {
    console.error(`seatsデータ新構造移行エラー (${tournamentId}/${tableId}):`, error);
    return false;
  }
}

/**
 * 全トーナメントのデータをハイブリッド形式に移行
 */
export async function migrateAllToHybridStructure(): Promise<void> {
  try {
    console.log('=== 全データハイブリッド移行開始 ===');
    
    const db = admin.firestore();
    
    // 全トーナメントを取得
    const tournamentsSnapshot = await db
      .collection('scheduledTournaments')
      .where('isArchived', '==', false)
      .get();
    
    console.log(`対象トーナメント数: ${tournamentsSnapshot.docs.length}`);
    
    let successCount = 0;
    let failureCount = 0;
    
    for (const doc of tournamentsSnapshot.docs) {
      const tournamentId = doc.id;
      
      try {
        console.log(`トーナメント ${tournamentId} の移行開始`);
        
        // waitingデータの移行
        const waitingSuccess = await migrateWaitingToHybrid(tournamentId);
        
        // テーブルデータの移行
        const tablesSeatSnapshot = await db
          .collection('scheduledTournaments')
          .doc(tournamentId)
          .collection('tablesSeat')
          .get();
        
        let tableSuccessCount = 0;
        for (const tableDoc of tablesSeatSnapshot.docs) {
          if (tableDoc.id !== 'waiting') {
            const tableSuccess = await migrateSeatsToNewStructure(tournamentId, tableDoc.id);
            if (tableSuccess) tableSuccessCount++;
          }
        }
        
        if (waitingSuccess && tableSuccessCount === tablesSeatSnapshot.docs.length - 1) {
          console.log(`トーナメント ${tournamentId}: 移行完了`);
          successCount++;
        } else {
          console.log(`トーナメント ${tournamentId}: 移行部分失敗`);
          failureCount++;
        }
        
      } catch (error) {
        console.error(`トーナメント ${tournamentId} 移行エラー:`, error);
        failureCount++;
      }
    }
    
    console.log('=== 全データハイブリッド移行完了 ===');
    console.log(`成功: ${successCount}件`);
    console.log(`失敗: ${failureCount}件`);
    
  } catch (error) {
    console.error('全データハイブリッド移行エラー:', error);
  }
}
