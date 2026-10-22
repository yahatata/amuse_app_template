import { Timestamp } from 'firebase-admin/firestore';

export interface ActionLog {
  action: string;
  deviceId: string;
  deviceName: string;
  targetUid: string | null;
  targetPlayerName: string | null;
  tableId: string | null;
  seatNumber: number | null;
  details: Record<string, any>;
  createdAt: Timestamp;
  isRollBack: boolean;
  rollBackBy: string | null;
  rollBackAt: Timestamp | null;
}

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
