import { FunctionCustomError } from '../../../src/shared/logging/functionCustomError';
import { isExpectedTournamentClientRejection } from '../../../src/domains/tournament_activeTournament/lib/isExpectedTournamentClientRejection';

describe('isExpectedTournamentClientRejection', () => {
  it('table_disabled は期待される拒否', () => {
    const error = new FunctionCustomError({
      errorKey: 'TOURNAMENT_INVALID_STATE',
      message: 'テーブルが無効です',
      context: { reason: 'table_disabled' },
    });
    expect(isExpectedTournamentClientRejection(error)).toBe(true);
  });

  it('その他の業務拒否は logOps 対象', () => {
    const error = new FunctionCustomError({
      errorKey: 'TOURNAMENT_INVALID_STATE',
      message: '指定されたシートは既に使用中です',
      context: { reason: 'seat_occupied' },
    });
    expect(isExpectedTournamentClientRejection(error)).toBe(false);
  });
});
