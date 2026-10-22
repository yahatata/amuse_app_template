import {
  isLinkedOkibakeActiveForNormalBustSync,
} from '../../src/domains/tournament_activeTournament/lib/syncLinkedOkibakeOnNormalBust';

describe('syncLinkedOkibakeOnNormalBust', () => {
  it('isLinkedOkibakeActiveForNormalBustSync は linked + seated/registered のみ true', () => {
    expect(
      isLinkedOkibakeActiveForNormalBustSync({
        billLinkStatus: 'linked',
        entryStatus: 'seated',
      }),
    ).toBe(true);
    expect(
      isLinkedOkibakeActiveForNormalBustSync({
        billLinkStatus: 'linked',
        entryStatus: 'registered',
      }),
    ).toBe(true);
    expect(
      isLinkedOkibakeActiveForNormalBustSync({
        billLinkStatus: 'unlinked',
        entryStatus: 'seated',
      }),
    ).toBe(false);
    expect(
      isLinkedOkibakeActiveForNormalBustSync({
        billLinkStatus: 'linked',
        entryStatus: 'busted',
      }),
    ).toBe(false);
  });
});
