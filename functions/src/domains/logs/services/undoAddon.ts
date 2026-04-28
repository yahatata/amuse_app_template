import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { logOpsError, logOpsSuccess } from "../../../shared/logging/logOpsError";

export interface UndoAddonParams {
  tournamentId: string;
  playerUid: string;
  playerName: string;
  tableId: string;
  seatNumber: number;
  addonAmount: number;
  rollBackBy: string;
  /** 伝票の billId。bills の addonCount を戻すために必要 */
  billId?: string;
  /** テンプレートID。bills/{billId}/tournaments/{templateId} の更新に必要 */
  templateId?: string;
}

/**
 * アドオン操作を巻き戻す
 */
export async function undoAddon(params: UndoAddonParams): Promise<void> {
  const db = getFirestore();
  const now = Timestamp.now();
  
  try {
    const mainViewRef = db
      .collection('scheduledTournaments')
      .doc(params.tournamentId)
      .collection('views')
      .doc('main');

    const billRef = params.billId ? db.collection('bills').doc(params.billId) : null;
    const billTournamentRef =
      params.billId && params.templateId
        ? billRef!.collection('tournaments').doc(params.templateId)
        : null;

    await db.runTransaction(async (transaction) => {
      // すべての読み取りを先に実行
      const mainViewDoc = await transaction.get(mainViewRef);
      const billTournamentDoc = billTournamentRef ? await transaction.get(billTournamentRef) : null;

      if (!mainViewDoc.exists) {
        throw new Error('Main view not found');
      }
      const mainViewData = mainViewDoc.data()!;
      const mainAddons = mainViewData.addons || 0;

      let billAddonCount: number | null = null;
      let clearLastAddonAt = false;
      if (billTournamentDoc?.exists) {
        const data = billTournamentDoc.data()!;
        const current = data.addonCount ?? 0;
        billAddonCount = Math.max(0, current - 1);
        if (billAddonCount === 0) {
          clearLastAddonAt = true; // アドオン0件なら lastAddonAt をクリア（recordTournamentAction で設定した分を取り消す）
        }
      }

      transaction.update(mainViewRef, {
        addons: Math.max(0, mainAddons - 1),
        updatedAt: now,
      });
      if (billTournamentRef != null && billAddonCount !== null) {
        transaction.update(billTournamentRef, {
          addonCount: billAddonCount,
          updatedAt: now,
          ...(clearLastAddonAt ? { lastAddonAt: null } : {}),
        });
        if (billRef != null) {
          transaction.update(billRef, { updatedAt: now });
        }
      }
    });

    logOpsSuccess({
      message: 'undoAddon 成功',
      functionEntry: 'undoAddon',
      context: {
        tournamentId: params.tournamentId,
        playerUid: params.playerUid,
        billId: params.billId,
        templateId: params.templateId,
      },
    });
  } catch (error) {
    logOpsError({
      message: 'Error undoing addon operation:',
      functionEntry: 'undoAddon',
      cause: error,
      context: {
        tournamentId: params.tournamentId,
        playerUid: params.playerUid,
        billId: params.billId,
        templateId: params.templateId,
        tableId: params.tableId,
        seatNumber: params.seatNumber,
      },
    });
    throw error;
  }
}
