import {
  assertTournamentAllowsMutation,
  isTournamentEndedStatus,
} from '../../src/domains/tournament_activeTournament/lib/assertTournamentAllowsMutation';
import { FunctionCustomError } from '../../src/shared/logging/functionCustomError';

describe('assertTournamentAllowsMutation', () => {
  it('isTournamentEndedStatus', () => {
    expect(isTournamentEndedStatus('ended')).toBe(true);
    expect(isTournamentEndedStatus('force_ended')).toBe(true);
    expect(isTournamentEndedStatus('running')).toBe(false);
    expect(isTournamentEndedStatus('cancelled')).toBe(false);
  });

  it('ended / force_ended は TOURNAMENT_ENDED で拒否する', () => {
    expect(() =>
      assertTournamentAllowsMutation({
        tournamentId: 't1',
        status: 'ended',
      }),
    ).toThrow(FunctionCustomError);

    try {
      assertTournamentAllowsMutation({
        tournamentId: 't1',
        status: 'force_ended',
      });
    } catch (e) {
      expect(e).toBeInstanceOf(FunctionCustomError);
      expect((e as FunctionCustomError).errorKey).toBe('TOURNAMENT_ENDED');
    }
  });

  it('running は拒否しない', () => {
    expect(() =>
      assertTournamentAllowsMutation({
        tournamentId: 't1',
        status: 'running',
      }),
    ).not.toThrow();
  });
});
