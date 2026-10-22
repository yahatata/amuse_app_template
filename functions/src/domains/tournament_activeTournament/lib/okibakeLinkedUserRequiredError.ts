import { HttpsError } from 'firebase-functions/v2/https';

export const TOURNAMENT_OKIBAKE_LINKED_USER_REQUIRED_ERROR_KEY =
  'TOURNAMENT_OKIBAKE_LINKED_USER_REQUIRED';

export function isOkibakeLinkedUserRequiredHttpsError(error: unknown): boolean {
  if (!(error instanceof HttpsError)) {
    return false;
  }

  const details = error.details;
  if (!details || typeof details !== 'object') {
    return false;
  }

  return (
    (details as Record<string, unknown>).errorKey ===
    TOURNAMENT_OKIBAKE_LINKED_USER_REQUIRED_ERROR_KEY
  );
}
