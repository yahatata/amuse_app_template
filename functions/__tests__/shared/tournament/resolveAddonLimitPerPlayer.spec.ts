import { resolveAddonLimitPerPlayer } from '../../../src/shared/tournament/resolveAddonLimitPerPlayer';

describe('resolveAddonLimitPerPlayer', () => {
  it('isAddon が true でないとき 0（false・undefined・文字列など）', () => {
    expect(resolveAddonLimitPerPlayer({ isAddon: false })).toBe(0);
    expect(resolveAddonLimitPerPlayer({ isAddon: undefined })).toBe(0);
    expect(resolveAddonLimitPerPlayer({ isAddon: null })).toBe(0);
    expect(resolveAddonLimitPerPlayer({ isAddon: 'true' as unknown as boolean })).toBe(0);
    expect(resolveAddonLimitPerPlayer({ isAddon: true, addonLimitPerPlayer: 2 })).toBe(2);
  });

  it('isAddon true + 欠損 → 1', () => {
    expect(resolveAddonLimitPerPlayer({ isAddon: true })).toBe(1);
    expect(resolveAddonLimitPerPlayer({ isAddon: true, addonLimitPerPlayer: undefined })).toBe(
      1,
    );
  });

  it('isAddon true + 正の整数 → その値', () => {
    expect(resolveAddonLimitPerPlayer({ isAddon: true, addonLimitPerPlayer: 1 })).toBe(1);
    expect(resolveAddonLimitPerPlayer({ isAddon: true, addonLimitPerPlayer: 5 })).toBe(5);
  });

  it('isAddon true + 不正値 → 1', () => {
    expect(resolveAddonLimitPerPlayer({ isAddon: true, addonLimitPerPlayer: 0 })).toBe(1);
    expect(resolveAddonLimitPerPlayer({ isAddon: true, addonLimitPerPlayer: -1 })).toBe(1);
    expect(resolveAddonLimitPerPlayer({ isAddon: true, addonLimitPerPlayer: 2.5 })).toBe(1);
    expect(resolveAddonLimitPerPlayer({ isAddon: true, addonLimitPerPlayer: NaN })).toBe(1);
    expect(resolveAddonLimitPerPlayer({ isAddon: true, addonLimitPerPlayer: '2' as unknown as number })).toBe(
      1,
    );
  });
});
