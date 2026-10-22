import {
  parseSeatKeyToTwoDigitSuffix,
  canonicalSeatKeyFromSuffix,
} from '../../src/domains/tournament_activeTournament/lib/parseOkibakeSeatKey';

describe('parseOkibakeSeatKey', () => {
  it('seat01 / 1 / 01 を 2 桁 suffix に正規化する', () => {
    expect(parseSeatKeyToTwoDigitSuffix('seat01')).toBe('01');
    expect(parseSeatKeyToTwoDigitSuffix('SEAT9')).toBe('09');
    expect(parseSeatKeyToTwoDigitSuffix('1')).toBe('01');
    expect(parseSeatKeyToTwoDigitSuffix('  01  ')).toBe('01');
  });

  it('不正な seatKey は null', () => {
    expect(parseSeatKeyToTwoDigitSuffix('')).toBeNull();
    expect(parseSeatKeyToTwoDigitSuffix('seat')).toBeNull();
    expect(parseSeatKeyToTwoDigitSuffix('seat000')).toBeNull();
    expect(parseSeatKeyToTwoDigitSuffix('100')).toBeNull();
  });

  it('canonicalSeatKeyFromSuffix', () => {
    expect(canonicalSeatKeyFromSuffix('01')).toBe('seat01');
  });
});
