import { calculateAvgStack } from '../../../src/shared/tournament/calculateAvgStack';

describe('calculateAvgStack', () => {
  const baseSnapshot = {
    startStack: 10000,
    addonStack: 5000,
    isAddon: true,
  };

  it('entries のみで avgStack が計算される', () => {
    expect(
      calculateAvgStack(
        { entries: 3, reentries: 0, playersBusted: 0, addons: 0 },
        baseSnapshot,
      ),
    ).toBe(10000);
  });

  it('entries + reentries で totalEntries が計算される', () => {
    expect(
      calculateAvgStack(
        { entries: 2, reentries: 1, playersBusted: 0, addons: 0 },
        baseSnapshot,
      ),
    ).toBe(10000);
  });

  it('playersBusted が分母から引かれる', () => {
    expect(
      calculateAvgStack(
        { entries: 3, reentries: 0, playersBusted: 1, addons: 0 },
        baseSnapshot,
      ),
    ).toBe(15000);
  });

  it('playersIn は計算に使わない', () => {
    // playersIn が過大でも remainingPlayers ベースで計算される
    expect(
      calculateAvgStack(
        { entries: 2, reentries: 0, playersBusted: 1, addons: 0 },
        baseSnapshot,
      ),
    ).toBe(20000);
  });

  it('addons * addonStack が totalChips に加算される', () => {
    expect(
      calculateAvgStack(
        { entries: 2, reentries: 0, playersBusted: 0, addons: 1 },
        baseSnapshot,
      ),
    ).toBe(12500);
  });

  it('addons = 0 なら addonStack 欠損でも計算できる', () => {
    expect(
      calculateAvgStack(
        { entries: 2, reentries: 0, playersBusted: 0, addons: 0 },
        { startStack: 8000 },
      ),
    ).toBe(8000);
  });

  it('addons > 0 かつ addonStack 欠損なら null', () => {
    expect(
      calculateAvgStack(
        { entries: 2, reentries: 0, playersBusted: 0, addons: 1 },
        { startStack: 8000 },
      ),
    ).toBeNull();
  });

  it('remainingPlayers <= 0 なら null', () => {
    expect(
      calculateAvgStack(
        { entries: 2, reentries: 0, playersBusted: 2, addons: 0 },
        baseSnapshot,
      ),
    ).toBeNull();
  });

  it('startStack 欠損なら null', () => {
    expect(
      calculateAvgStack(
        { entries: 2, reentries: 0, playersBusted: 0, addons: 0 },
        { addonStack: 5000 },
      ),
    ).toBeNull();
  });

  it('小数は floor される', () => {
    expect(
      calculateAvgStack(
        { entries: 3, reentries: 0, playersBusted: 0, addons: 1 },
        { startStack: 10000, addonStack: 1000 },
      ),
    ).toBe(10333);
  });
});
