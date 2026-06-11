import { FunctionCustomError } from '../../../shared/logging/functionCustomError';

/** 終了済みとして閲覧のみ扱う scheduledTournament.status */
export function isTournamentEndedStatus(status: string | undefined): boolean {
  return status === 'ended' || status === 'force_ended';
}

/**
 * トーナメント状態・参加者・座席等の変更操作前に呼ぶ。
 * ended / force_ended の場合は TOURNAMENT_ENDED で拒否する。
 */
export function assertTournamentAllowsMutation(params: {
  tournamentId: string;
  status: string | undefined;
}): void {
  const { tournamentId, status } = params;
  if (!isTournamentEndedStatus(status)) {
    return;
  }

  throw new FunctionCustomError({
    errorKey: 'TOURNAMENT_ENDED',
    message:
      status === 'force_ended'
        ? 'トーナメントは強制終了済みのため、この操作は実行できません'
        : 'トーナメントは終了済みのため、この操作は実行できません',
    context: {
      tournamentId,
      status: status ?? '',
      reason: 'tournament_ended_read_only',
    },
  });
}
