import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { logOpsError, logOpsSuccess } from "../../../shared/logging/logOpsError";

export interface UndoReseatAllPlayersParams {
  tournamentId: string;
  previousSeatingData: Record<string, any>; // 前の座席配置データ（waiting + 各 table.seats）
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
      const mainViewRef = db
        .collection('scheduledTournaments')
        .doc(params.tournamentId)
        .collection('views')
        .doc('main');

      // すべての読み取りを先に実行
      const mainViewDoc = await transaction.get(mainViewRef);

      let waitingCount = 0;
      for (const [tableId, tableData] of Object.entries(params.previousSeatingData)) {
        if (tableId === 'waiting') {
          waitingCount = Object.keys((tableData as { waiting?: Record<string, unknown> }).waiting || {}).length;
        }
      }

      // ここから書き込みのみ
      for (const [tableId, tableData] of Object.entries(params.previousSeatingData)) {
        if (tableId === 'waiting') {
          const data = tableData as { waiting?: Record<string, unknown> };
          const waiting = data.waiting || {};
          const waitingRef = db
            .collection('scheduledTournaments')
            .doc(params.tournamentId)
            .collection('tablesSeat')
            .doc('waiting');
          transaction.set(waitingRef, {
            waiting,
            count: Object.keys(waiting).length,
            updatedAt: now,
          });
        } else {
          const data = tableData as { seats?: Record<string, unknown> };
          const seatRef = db
            .collection('scheduledTournaments')
            .doc(params.tournamentId)
            .collection('tablesSeat')
            .doc(tableId);
          // merge: true で seats と updatedAt のみ更新し、isEnabled 等の既存フィールドを保持する
          transaction.set(seatRef, {
            seats: data.seats || {},
            updatedAt: now,
          }, { merge: true });
        }
      }

      if (mainViewDoc.exists) {
        // seatedCount は forward で維持していないため、undo で書き換えない（waitingCount のみ復元）
        transaction.update(mainViewRef, {
          waitingCount,
          updatedAt: now,
        });
      }
    });

    logOpsSuccess({
      message: 'undoReseatAllPlayers 成功',
      functionEntry: 'undoReseatAllPlayers',
      context: { tournamentId: params.tournamentId },
    });
  } catch (error) {
    logOpsError({
      message: 'Error undoing reseat all players operation:',
      functionEntry: 'undoReseatAllPlayers',
      cause: error,
      context: { tournamentId: params.tournamentId },
    });
    throw error;
  }
}
