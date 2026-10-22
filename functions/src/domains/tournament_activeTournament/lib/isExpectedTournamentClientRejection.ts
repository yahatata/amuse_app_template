import { FunctionCustomError } from '../../../shared/logging/functionCustomError';

const EXPECTED_REJECTION_REASONS = new Set([
  'table_disabled',
  'tournament_table_disabled',
]);

/**
 * UI で防止可能な業務拒否。logOpsError の対象外とする。
 */
export function isExpectedTournamentClientRejection(
  error: FunctionCustomError
): boolean {
  const reason = error.context?.reason;
  if (typeof reason === 'string' && EXPECTED_REJECTION_REASONS.has(reason)) {
    return true;
  }
  return error.message === 'テーブルが無効です';
}
