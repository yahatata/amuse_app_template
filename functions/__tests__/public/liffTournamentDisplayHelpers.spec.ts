const {
  formatLiffReentryDisplay,
  formatLiffAddonDisplay,
} = require('../../../public/user/liffTournamentDisplayHelpers.js');

describe('liffTournamentDisplayHelpers', () => {
  describe('formatLiffReentryDisplay', () => {
    it('maxReentries = 0 の場合は不可', () => {
      expect(
        formatLiffReentryDisplay({
          isReentry: true,
          maxReentries: 0,
          reentryFee: 3000,
        })
      ).toBe('不可');
    });

    it('maxReentries > 0 の場合は上限N回', () => {
      expect(
        formatLiffReentryDisplay({
          isReentry: true,
          maxReentries: 2,
          reentryFee: 3000,
        })
      ).toBe('上限2回（3,000円）');
    });

    it('maxReentries が null の場合は可', () => {
      expect(
        formatLiffReentryDisplay({
          isReentry: true,
          maxReentries: null,
          reentryFee: 3000,
        })
      ).toBe('可（3,000円）');
    });

    it('reentryFee = 0 の場合も金額を表示する', () => {
      expect(
        formatLiffReentryDisplay({
          isReentry: true,
          maxReentries: 2,
          reentryFee: 0,
        })
      ).toBe('上限2回（0円）');
    });
  });

  describe('formatLiffAddonDisplay', () => {
    it('addonLimitPerPlayer = 0 の場合は不可', () => {
      expect(
        formatLiffAddonDisplay({
          isAddon: true,
          addonLimitPerPlayer: 0,
          addonFee: 2000,
        })
      ).toBe('不可');
    });

    it('addonLimitPerPlayer > 0 の場合は上限N回', () => {
      expect(
        formatLiffAddonDisplay({
          isAddon: true,
          addonLimitPerPlayer: 1,
          addonFee: 2000,
        })
      ).toBe('上限1回（2,000円）');
    });

    it('addonLimitPerPlayer が null の場合は可', () => {
      expect(
        formatLiffAddonDisplay({
          isAddon: true,
          addonLimitPerPlayer: null,
          addonFee: 2000,
        })
      ).toBe('可（2,000円）');
    });

    it('addonFee = 0 の場合も金額を表示する', () => {
      expect(
        formatLiffAddonDisplay({
          isAddon: true,
          addonLimitPerPlayer: 1,
          addonFee: 0,
        })
      ).toBe('上限1回（0円）');
    });
  });
});
