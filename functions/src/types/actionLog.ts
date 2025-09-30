import { Timestamp } from 'firebase-admin/firestore';

export interface ActionLog {
  action: string; // 操作の種類
  deviceId: string; // 操作を行ったデバイスのID
  deviceName: string; // 操作を行ったデバイスの名前
  targetUid: string | null; // 対象プレイヤーのUID
  targetPlayerName: string | null; // 対象プレイヤーの名前
  tableId: string | null; // テーブルID
  seatNumber: number | null; // シート番号
  details: Record<string, any>; // 操作の詳細情報
  createdAt: Timestamp; // 操作実行時刻
  isRollBack: boolean; // ロールバック済みかどうか
  rollBackBy: string | null; // ロールバック実行者のデバイスID
  rollBackAt: Timestamp | null; // ロールバック実行時刻
}

// 操作の種類を定義
export const ACTION_TYPES = {
  CREATE_TOURNAMENT: 'create_tournament',
  ADDON: 'addon',
  BULK_ADDON: 'bulk_addon',
  BUST_AND_EXIT: 'bust_and_exit',
  BUST_AND_REENTRY: 'bust_and_reentry',
  REGISTER_PARTICIPANTS: 'register_participants',
  ASSIGN_SEAT_TO_PLAYER: 'assign_seat_to_player',
  RESEAT_ALL_PLAYERS: 'reseat_all_players',
} as const;

export type ActionType = typeof ACTION_TYPES[keyof typeof ACTION_TYPES];
