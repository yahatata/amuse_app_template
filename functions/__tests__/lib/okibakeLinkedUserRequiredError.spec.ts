import { HttpsError } from 'firebase-functions/v2/https';
import {
  isOkibakeLinkedUserRequiredHttpsError,
  TOURNAMENT_OKIBAKE_LINKED_USER_REQUIRED_ERROR_KEY,
} from '../../src/domains/tournament_activeTournament/lib/okibakeLinkedUserRequiredError';

describe('isOkibakeLinkedUserRequiredHttpsError', () => {
  it('details.errorKey が TOURNAMENT_OKIBAKE_LINKED_USER_REQUIRED の HttpsError を判定する', () => {
    const error = new HttpsError('failed-precondition', 'blocked', {
      errorKey: TOURNAMENT_OKIBAKE_LINKED_USER_REQUIRED_ERROR_KEY,
    });

    expect(isOkibakeLinkedUserRequiredHttpsError(error)).toBe(true);
  });

  it('別 errorKey や HttpsError 以外は false', () => {
    expect(
      isOkibakeLinkedUserRequiredHttpsError(
        new HttpsError('failed-precondition', 'other', { errorKey: 'OTHER' })
      )
    ).toBe(false);
    expect(isOkibakeLinkedUserRequiredHttpsError(new Error('boom'))).toBe(false);
    expect(
      isOkibakeLinkedUserRequiredHttpsError(
        new HttpsError('failed-precondition', 'no details')
      )
    ).toBe(false);
  });
});
