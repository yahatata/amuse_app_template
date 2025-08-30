/**
 * Firestore の runtime/main ドキュメントパス生成ヘルパー
 * scheduledTournament/{tid}/views/runtime/main のパスを管理
 */

/**
 * トーナメントIDからruntime/mainドキュメントのパスを生成
 * @param tournamentId トーナメントID
 * @returns runtime/mainドキュメントのパス
 */
export function getRuntimeMainPath(tournamentId: string): string {
  return `scheduledTournaments/${tournamentId}/views/runtime/main`;
}

/**
 * トーナメントIDからruntime/mainドキュメントのコレクション参照パスを生成
 * @param tournamentId トーナメントID
 * @returns runtime/mainドキュメントのコレクション参照パス
 */
export function getRuntimeMainCollectionPath(tournamentId: string): string {
  return `scheduledTournaments/${tournamentId}/views/runtime`;
}

/**
 * トーナメントIDからviewsコレクションのパスを生成
 * @param tournamentId トーナメントID
 * @returns viewsコレクションのパス
 */
export function getViewsPath(tournamentId: string): string {
  return `scheduledTournaments/${tournamentId}/views`;
}

/**
 * トーナメントIDからscheduledTournamentドキュメントのパスを生成
 * @param tournamentId トーナメントID
 * @returns scheduledTournamentドキュメントのパス
 */
export function getScheduledTournamentPath(tournamentId: string): string {
  return `scheduledTournaments/${tournamentId}`;
}

/**
 * runtime/mainドキュメントのフィールド名定数
 */
export const RUNTIME_FIELDS = {
  STATUS: 'status',
  STARTED_AT: 'startedAt',
  PAUSED_AT: 'pausedAt',
  SHIFT_SEC: 'shiftSec',
  SCHEDULE_REV: 'scheduleRev',
  REG_CLOSED_AT: 'regClosedAt',
  REG_CLOSE_REV: 'regCloseRev',
  PLANNED_START_AT: 'plannedStartAt',
  UPDATED_AT: 'updatedAt'
} as const;

/**
 * トーナメントステータスの定数
 */
export const TOURNAMENT_STATUS = {
  SCHEDULED: 'scheduled',
  RUNNING: 'running',
  PAUSED: 'paused',
  ENDED: 'ended'
} as const;

/**
 * トーナメントステータスの型
 */
export type TournamentStatus = typeof TOURNAMENT_STATUS[keyof typeof TOURNAMENT_STATUS];
