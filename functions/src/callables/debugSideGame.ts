import { onCall } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';

export const debugSideGame = onCall(async (request) => {
  const db = getFirestore();
  const { tableId } = request.data;

  try {
    console.log(`=== debugSideGame開始: ${tableId} ===`);
    
    // 1. tablesコレクションの確認
    const tableDoc = await db.collection('tables').doc(tableId).get();
    console.log('tablesドキュメント存在:', tableDoc.exists);
    if (tableDoc.exists) {
      console.log('tablesデータ:', tableDoc.data());
    }
    
    // 2. sideGameコレクションの確認
    const sideGameDoc = await db.collection('sideGame').doc(tableId).get();
    console.log('sideGameドキュメント存在:', sideGameDoc.exists);
    if (sideGameDoc.exists) {
      console.log('sideGameデータ:', sideGameDoc.data());
    }
    
    // 3. sideGameコレクションが存在しない場合は作成
    if (!sideGameDoc.exists) {
      console.log('sideGameドキュメントを作成中...');
      
      const tableData = tableDoc.data();
      const maxSeats = tableData?.maxSeats || 6;
      
      // 座席情報を生成
      const seats: { [key: string]: any } = {};
      for (let i = 1; i <= maxSeats; i++) {
        const seatNumber = i.toString().padStart(2, '0');
        seats[`seat${seatNumber}UserId`] = null;
        seats[`seat${seatNumber}PokerName`] = null;
      }
      
      await db.collection('sideGame').doc(tableId).set({
        tableId: tableId,
        name: tableId,
        maxSeats: maxSeats,
        seats: seats,
        active: false,
        isEnabled: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      
      console.log('sideGameドキュメント作成完了');
    }
    
    return {
      success: true,
      message: 'デバッグ完了',
      tableExists: tableDoc.exists,
      sideGameExists: sideGameDoc.exists,
    };
    
  } catch (error) {
    console.error('debugSideGameエラー:', error);
    throw new Error(`デバッグエラー: ${error}`);
  }
});
