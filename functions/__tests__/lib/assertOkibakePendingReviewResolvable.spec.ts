import { HttpsError } from 'firebase-functions/v2/https';
import {
  assertOkibakePendingReviewResolvable,
  assertTournamentExistsForPendingReviewResolution,
} from '../../src/domains/tournament_activeTournament/lib/assertOkibakePendingReviewResolvable';

describe('assertOkibakePendingReviewResolvable helpers', () => {
  describe('assertTournamentExistsForPendingReviewResolution', () => {
    it('存在すれば拒否しない（ended でも可）', () => {
      expect(() =>
        assertTournamentExistsForPendingReviewResolution({
          tournamentId: 't1',
          exists: true,
        })
      ).not.toThrow();
    });

    it('未存在は not-found', () => {
      expect(() =>
        assertTournamentExistsForPendingReviewResolution({
          tournamentId: 't1',
          exists: false,
        })
      ).toThrow(HttpsError);
    });
  });

  describe('assertOkibakePendingReviewResolvable', () => {
    it('pending_review + linkedUserId を許可', () => {
      const r = assertOkibakePendingReviewResolvable({
        exists: true,
        entryData: {
          billLinkStatus: 'pending_review',
          entryStatus: 'busted',
          linkedUserId: 'u1',
          linkedUserPokerName: 'Bob',
        },
      });
      expect(r.linkedUserId).toBe('u1');
      expect(r.linkedUserPokerName).toBe('Bob');
    });

    it('linked 済みは拒否', () => {
      expect(() =>
        assertOkibakePendingReviewResolvable({
          exists: true,
          entryData: {
            billLinkStatus: 'linked',
            entryStatus: 'busted',
            linkedUserId: 'u1',
          },
        })
      ).toThrow(HttpsError);
    });

    it('linkedUserId 欠落は拒否', () => {
      expect(() =>
        assertOkibakePendingReviewResolvable({
          exists: true,
          entryData: {
            billLinkStatus: 'pending_review',
            entryStatus: 'registered',
          },
        })
      ).toThrow(HttpsError);
    });
  });
});
