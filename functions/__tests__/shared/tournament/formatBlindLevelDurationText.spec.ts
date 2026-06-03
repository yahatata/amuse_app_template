import { formatBlindLevelDurationText } from '../../../src/shared/tournament/formatBlindLevelDurationText';

describe('formatBlindLevelDurationText', () => {
  it('単一 duration を返す', () => {
    expect(formatBlindLevelDurationText([{ level: 1, duration: 15 }])).toBe('15分');
  });

  it('level 順に複数 duration を返す', () => {
    expect(
      formatBlindLevelDurationText([
        { level: 3, duration: 15 },
        { level: 1, duration: 25 },
        { level: 2, duration: 20 },
      ])
    ).toBe('25分 / 20分 / 15分');
  });

  it('重複 duration を出現順ユニークで返す', () => {
    expect(
      formatBlindLevelDurationText([
        { level: 1, duration: 25 },
        { level: 2, duration: 20 },
        { level: 3, duration: 20 },
        { level: 4, duration: 15 },
      ])
    ).toBe('25分 / 20分 / 15分');
  });

  it('空 levels は空文字', () => {
    expect(formatBlindLevelDurationText([])).toBe('');
    expect(formatBlindLevelDurationText(null)).toBe('');
  });
});
