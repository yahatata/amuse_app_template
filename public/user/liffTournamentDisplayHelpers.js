function formatLiffFeeSuffix(fee) {
  if (typeof fee !== 'number' || Number.isNaN(fee)) return '';
  return `（${fee.toLocaleString()}円）`;
}

function formatLiffReentryDisplay(tournament) {
  if (tournament.isReentry !== true) return '不可';
  if (typeof tournament.maxReentries === 'number') {
    if (tournament.maxReentries === 0) return '不可';
    const feeSuffix = formatLiffFeeSuffix(tournament.reentryFee);
    return `上限${tournament.maxReentries}回${feeSuffix}`;
  }
  const feeSuffix = formatLiffFeeSuffix(tournament.reentryFee);
  return `可${feeSuffix}`;
}

function formatLiffAddonDisplay(tournament) {
  if (tournament.isAddon !== true) return '不可';
  if (typeof tournament.addonLimitPerPlayer === 'number') {
    if (tournament.addonLimitPerPlayer === 0) return '不可';
    const feeSuffix = formatLiffFeeSuffix(tournament.addonFee);
    return `上限${tournament.addonLimitPerPlayer}回${feeSuffix}`;
  }
  const feeSuffix = formatLiffFeeSuffix(tournament.addonFee);
  return `可${feeSuffix}`;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    formatLiffFeeSuffix,
    formatLiffReentryDisplay,
    formatLiffAddonDisplay,
  };
}

if (typeof window !== 'undefined') {
  window.formatLiffFeeSuffix = formatLiffFeeSuffix;
  window.formatLiffReentryDisplay = formatLiffReentryDisplay;
  window.formatLiffAddonDisplay = formatLiffAddonDisplay;
}
