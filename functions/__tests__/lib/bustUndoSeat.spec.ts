import {
  isSeatSlotEmpty,
  parseSeatSuffix,
  readSeatSlot,
  seatSlotMatches,
} from '../../src/domains/logs/lib/bustUndoSeat';

describe('bustUndoSeat', () => {
  it('parseSeatSuffix が seat01 / seat1 を正規化する', () => {
    expect(parseSeatSuffix('seat01')).toBe('01');
    expect(parseSeatSuffix('seat1')).toBe('01');
    expect(parseSeatSuffix('invalid')).toBeNull();
  });

  it('isSeatSlotEmpty が userId / okibakeEntryId の有無を判定する', () => {
    expect(
      isSeatSlotEmpty({
        userId: null,
        pokerName: null,
        okibakeEntryId: null,
      })
    ).toBe(true);
    expect(
      isSeatSlotEmpty({
        userId: 'u1',
        pokerName: 'A',
        okibakeEntryId: null,
      })
    ).toBe(false);
    expect(
      isSeatSlotEmpty({
        userId: null,
        pokerName: 'A',
        okibakeEntryId: 'okibake-1',
      })
    ).toBe(false);
  });

  it('seatSlotMatches が seat スナップショットを比較する', () => {
    const seats = {
      seat02UserId: null,
      seat02PokerName: null,
      seat02OkibakeEntryId: null,
    };
    expect(
      seatSlotMatches(seats, '02', {
        userId: null,
        pokerName: null,
        okibakeEntryId: null,
      })
    ).toBe(true);
    expect(readSeatSlot(seats, '02').userId).toBeNull();
  });
});
