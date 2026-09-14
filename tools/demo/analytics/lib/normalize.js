'use strict';

/**
 * Normalize 2025-09 source into targetMonth / demoDay payload (no Firestore).
 */

const {
  CATEGORY_KEYS,
  CATEGORY_FIELD_MAP,
  PAYMENT_KEYS,
  assertMonth,
  assertDate,
  monthOf,
  dayOfMonth,
  pad2,
  sumValues,
  allocateByWeights,
  allocateMap,
} = require('./helpers');

function buildMonthlySot(sourceMonthly) {
  const paymentTotals = {};
  for (const k of PAYMENT_KEYS) {
    paymentTotals[k] = Number(sourceMonthly.paymentTotals?.[k] || 0);
  }
  // sideGameTip intentionally dropped

  const monthly = {
    grossSales: Number(sourceMonthly.grossSales),
    orderCount: Number(sourceMonthly.orderCount),
    avgOrderValue: Number(sourceMonthly.avgOrderValue),
    itemsSales: Number(sourceMonthly.itemsSales),
    sideGameChipSales: Number(sourceMonthly.sideGameChipSales),
    tournamentsSales: Number(sourceMonthly.tournamentsSales),
    extraCostSales: Number(sourceMonthly.extraCostSales),
    paymentTotals,
    dailySales: {}, // filled later
  };

  const catSum =
    monthly.itemsSales +
    monthly.sideGameChipSales +
    monthly.tournamentsSales +
    monthly.extraCostSales;
  const paySum = sumValues(monthly.paymentTotals);
  if (catSum !== monthly.grossSales) {
    throw new Error(`Source monthly category sum ${catSum} != gross ${monthly.grossSales}`);
  }
  if (paySum !== monthly.grossSales) {
    throw new Error(`Source monthly payment sum ${paySum} != gross ${monthly.grossSales}`);
  }

  const expectedAvg = Math.round(monthly.grossSales / monthly.orderCount);
  monthly.avgOrderValue = expectedAvg;

  return monthly;
}

function selectSourceShapeDays(sourceDays, dayCount) {
  const sorted = [...sourceDays].sort((a, b) => a.date.localeCompare(b.date));
  if (sorted.length === 0) throw new Error('Source has no days');
  const n = Math.min(dayCount, sorted.length);
  return sorted.slice(0, n);
}

function buildDayDoc(targetDate, gross, orderCount, monthlySot) {
  const catParts = {
    items: monthlySot.itemsSales,
    sideGameChip: monthlySot.sideGameChipSales,
    tournaments: monthlySot.tournamentsSales,
    extraCost: monthlySot.extraCostSales,
  };
  const byCategory = allocateMap(gross, CATEGORY_KEYS, catParts);
  const byPaymentMethod = allocateMap(gross, PAYMENT_KEYS, monthlySot.paymentTotals);

  return {
    date: targetDate,
    grossSales: gross,
    orderCount,
    itemsSales: byCategory.items,
    sideGameChipSales: byCategory.sideGameChip,
    tournamentsSales: byCategory.tournaments,
    extraCostSales: byCategory.extraCost,
    byCategory,
    byPaymentMethod,
  };
}

/**
 * @param {object} source - source_2025-09.json
 * @param {{ targetMonth: string, demoDay: string }} opts
 */
function normalizeDemoAnalytics(source, opts) {
  const { targetMonth, demoDay } = opts;
  assertMonth(targetMonth);
  assertDate(demoDay);

  if (monthOf(demoDay) !== targetMonth) {
    throw new Error(`demoDay ${demoDay} is not in targetMonth ${targetMonth}`);
  }

  const demoDom = dayOfMonth(demoDay);
  if (demoDom < 1) throw new Error('demoDay day-of-month invalid');

  const monthlySot = buildMonthlySot(source.monthly);
  const shapeDays = selectSourceShapeDays(source.days, demoDom);
  const n = shapeDays.length;

  const weights = shapeDays.map((d) => {
    const w = Number(d.grossSales);
    return w > 0 ? w : 1;
  });

  const grossParts = allocateByWeights(monthlySot.grossSales, weights);
  const orderParts = allocateByWeights(monthlySot.orderCount, weights);

  const days = [];
  const dailySales = {};
  for (let i = 0; i < n; i++) {
    const dom = i + 1;
    const targetDate = `${targetMonth}-${pad2(dom)}`;
    if (targetDate > demoDay) {
      throw new Error(`Internal error: generated future date ${targetDate} > ${demoDay}`);
    }
    const day = buildDayDoc(targetDate, grossParts[i], orderParts[i], monthlySot);
    days.push(day);
    dailySales[targetDate] = day.grossSales;
  }

  monthlySot.dailySales = dailySales;

  const byCategory = {
    totals: {
      items: monthlySot.itemsSales,
      sideGameChip: monthlySot.sideGameChipSales,
      tournaments: monthlySot.tournamentsSales,
      extraCost: monthlySot.extraCostSales,
    },
    orderCounts: { ...(source.byCategory?.orderCounts || {}) },
    itemSales: JSON.parse(JSON.stringify(source.byCategory?.itemSales || {})),
  };

  // Ensure orderCounts keys exist
  for (const k of CATEGORY_KEYS) {
    if (typeof byCategory.orderCounts[k] !== 'number') {
      byCategory.orderCounts[k] = 0;
    }
  }

  const plannedPaths = [
    `analyticsMonthly/${targetMonth}`,
    ...days.map((d) => `analyticsMonthly/${targetMonth}/days/${d.date}`),
    `analyticsMonthly/${targetMonth}/byCategory/summary`,
  ];

  return {
    meta: {
      sourceId: source.sourceId || 'analyticsMonthly/2025-09',
      targetMonth,
      demoDay,
      dayCount: n,
      note:
        'Timestamps are placeholders; writer must set Firestore Timestamp at apply time.',
    },
    monthly: monthlySot,
    days,
    byCategory,
    plannedPaths,
  };
}

module.exports = {
  normalizeDemoAnalytics,
  buildMonthlySot,
  CATEGORY_FIELD_MAP,
};
