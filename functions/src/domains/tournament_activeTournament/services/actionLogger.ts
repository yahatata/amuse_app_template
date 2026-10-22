import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { ActionLog, ActionType } from "../../../shared/types/actionLog";

export interface LogActionParams {
  tournamentId: string;
  action: ActionType;
  deviceId: string;
  deviceName: string;
  targetUid?: string | null;
  targetPlayerName?: string | null;
  tableId?: string | null;
  seatNumber?: number | null;
  details?: Record<string, any>;
}

/**
 * 操作ログを記録する
 */
export async function logAction(params: LogActionParams): Promise<string> {
  const db = getFirestore();
  const now = Timestamp.now();
  
  const actionLogData: ActionLog = {
    action: params.action,
    deviceId: params.deviceId,
    deviceName: params.deviceName,
    targetUid: params.targetUid || null,
    targetPlayerName: params.targetPlayerName || null,
    tableId: params.tableId || null,
    seatNumber: params.seatNumber || null,
    details: params.details || {},
    createdAt: now,
    isRollBack: false,
    rollBackBy: null,
    rollBackAt: null,
  };

  const actionLogRef = db
    .collection('scheduledTournaments')
    .doc(params.tournamentId)
    .collection('actionLog')
    .doc();

  await actionLogRef.set(actionLogData);
  
  console.log(`Action logged: ${params.action} for tournament ${params.tournamentId} by device ${params.deviceId}`);
  
  return actionLogRef.id;
}

/**
 * 操作ログをロールバック済みとしてマークする
 */
export async function markActionAsRolledBack(
  tournamentId: string,
  actionLogId: string,
  rollBackBy: string
): Promise<void> {
  const db = getFirestore();
  const now = Timestamp.now();
  
  await db
    .collection('scheduledTournaments')
    .doc(tournamentId)
    .collection('actionLog')
    .doc(actionLogId)
    .update({
      isRollBack: true,
      rollBackBy,
      rollBackAt: now,
    });
    
  console.log(`Action ${actionLogId} marked as rolled back by ${rollBackBy}`);
}
