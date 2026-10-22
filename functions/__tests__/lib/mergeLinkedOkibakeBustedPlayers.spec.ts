import {
  mergeLinkedOkibakeBustedPlayers,
  resolveOkibakeBustedPokerName,
  sortBustedPlayersByBustAtDesc,
} from '../../src/domains/tournament_activeTournament/lib/mergeLinkedOkibakeBustedPlayers';

describe('mergeLinkedOkibakeBustedPlayers', () => {
  const ts = (seconds: number) => ({ _seconds: seconds, _nanoseconds: 0 });

  it('linked + busted の entry を bustedPlayers に補完する', () => {
    const result = mergeLinkedOkibakeBustedPlayers([], [
      {
        entryStatus: 'busted',
        billLinkStatus: 'linked',
        linkedUserId: 'guest-1',
        linkedUserPokerName: 'リンク太郎',
        bustedAt: ts(100),
      },
    ]);

    expect(result).toEqual([
      { uid: 'guest-1', pokerName: 'リンク太郎', bustAt: ts(100) },
    ]);
  });

  it('unlinked / pending_review / seated / registered は補完しない', () => {
    const result = mergeLinkedOkibakeBustedPlayers([], [
      { entryStatus: 'busted', billLinkStatus: 'unlinked', linkedUserId: 'u1' },
      { entryStatus: 'busted', billLinkStatus: 'pending_review', linkedUserId: 'u2' },
      { entryStatus: 'seated', billLinkStatus: 'linked', linkedUserId: 'u3' },
      { entryStatus: 'registered', billLinkStatus: 'linked', linkedUserId: 'u4' },
    ]);

    expect(result).toEqual([]);
  });

  it('linked + busted でも linkedUserId がなければ補完しない', () => {
    const result = mergeLinkedOkibakeBustedPlayers([], [
      { entryStatus: 'busted', billLinkStatus: 'linked', linkedUserId: null },
      { entryStatus: 'busted', billLinkStatus: 'linked', linkedUserId: '  ' },
    ]);

    expect(result).toEqual([]);
  });

  it('既存 bustedUser と同一 uid の okibake 由来は重複追加しない', () => {
    const existing = [{ uid: 'user-a', pokerName: '通常太郎', bustAt: ts(200) }];
    const result = mergeLinkedOkibakeBustedPlayers(existing, [
      {
        entryStatus: 'busted',
        billLinkStatus: 'linked',
        linkedUserId: 'user-a',
        linkedUserPokerName: '置きバケ太郎',
        bustedAt: ts(50),
      },
    ]);

    expect(result).toEqual(existing);
  });

  it('linkedUserPokerName がなければ temporaryDisplayName に fallback する', () => {
    expect(
      resolveOkibakeBustedPokerName({
        linkedUserPokerName: null,
        temporaryDisplayName: 'オキバケA',
      })
    ).toBe('オキバケA');
  });

  it('bustedAt 降順で並ぶ', () => {
    const sorted = sortBustedPlayersByBustAtDesc([
      { uid: 'old', pokerName: 'A', bustAt: ts(10) },
      { uid: 'new', pokerName: 'B', bustAt: ts(99) },
    ]);

    expect(sorted.map((p) => p.uid)).toEqual(['new', 'old']);
  });

  it('合成後も bustedAt 降順で並ぶ', () => {
    const result = mergeLinkedOkibakeBustedPlayers(
      [{ uid: 'regular', pokerName: 'R', bustAt: ts(50) }],
      [
        {
          entryStatus: 'busted',
          billLinkStatus: 'linked',
          linkedUserId: 'okibake-guest',
          linkedUserPokerName: 'O',
          bustedAt: ts(100),
        },
      ]
    );

    expect(result.map((p) => p.uid)).toEqual(['okibake-guest', 'regular']);
  });
});
