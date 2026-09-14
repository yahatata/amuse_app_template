'use strict';

/**
 * Assertion suite for normalized demo analytics payload.
 */

const {
  CATEGORY_KEYS,
  PAYMENT_KEYS,
  monthOf,
  sumValues,
} = require('./helpers');

function fail(errors, msg) {
  errors.push(msg);
}

/**
 * @param {object} payload - normalizeDemoAnalytics result
 * @param {{ targetMonth: string, demoDay: string }} opts
 * @returns {{ ok: boolean, errors: string[], checks: object }}
 */
function assertNormalizedPayload(payload, opts) {
  const errors = [];
  const { targetMonth, demoDay } = opts;
  const m = payload.monthly;
  const days = payload.days || [];

  // --- monthly ---
  const catSum =
    m.itemsSales + m.sideGameChipSales + m.tournamentsSales + m.extraCostSales;
  if (catSum !== m.grossSales) {
    fail(errors, `monthly category ${catSum} != gross ${m.grossSales}`);
  }

  if (m.paymentTotals && 'sideGameTip' in m.paymentTotals) {
    fail(errors, 'monthly.paymentTotals must not contain sideGameTip');
  }

  for (const k of PAYMENT_KEYS) {
    if (typeof m.paymentTotals[k] !== 'number') {
      fail(errors, `monthly.paymentTotals.${k} missing or not number`);
    }
  }

  const paySum = sumValues(m.paymentTotals);
  if (paySum !== m.grossSales) {
    fail(errors, `monthly payment ${paySum} != gross ${m.grossSales}`);
  }

  const dailySum = sumValues(m.dailySales);
  if (dailySum !== m.grossSales) {
    fail(errors, `monthly dailySales sum ${dailySum} != gross ${m.grossSales}`);
  }

  if (!m.orderCount || m.orderCount <= 0) {
    fail(errors, `monthly.orderCount invalid: ${m.orderCount}`);
  } else {
    const expectedAvg = Math.round(m.grossSales / m.orderCount);
    if (m.avgOrderValue !== expectedAvg) {
      fail(
        errors,
        `avgOrderValue ${m.avgOrderValue} != expected ${expectedAvg}`
      );
    }
  }

  // required fields
  for (const f of [
    'grossSales',
    'orderCount',
    'avgOrderValue',
    'itemsSales',
    'sideGameChipSales',
    'tournamentsSales',
    'extraCostSales',
    'dailySales',
    'paymentTotals',
  ]) {
    if (m[f] === undefined || m[f] === null) {
      fail(errors, `monthly missing required field: ${f}`);
    }
  }

  // --- days ---
  const dates = new Set();
  let orderSum = 0;
  for (const day of days) {
    const d = day.date;
    if (!d || monthOf(d) !== targetMonth) {
      fail(errors, `day date out of targetMonth: ${d}`);
    }
    if (d > demoDay) {
      fail(errors, `future day date: ${d} > demoDay ${demoDay}`);
    }
    if (dates.has(d)) fail(errors, `duplicate day date: ${d}`);
    dates.add(d);

    const dayCat =
      day.itemsSales +
      day.sideGameChipSales +
      day.tournamentsSales +
      day.extraCostSales;
    if (dayCat !== day.grossSales) {
      fail(errors, `day ${d} category ${dayCat} != gross ${day.grossSales}`);
    }

    const byCatSum = sumValues(day.byCategory);
    if (byCatSum !== day.grossSales) {
      fail(errors, `day ${d} byCategory ${byCatSum} != gross ${day.grossSales}`);
    }

    const dayPay = sumValues(day.byPaymentMethod);
    if (dayPay !== day.grossSales) {
      fail(errors, `day ${d} payment ${dayPay} != gross ${day.grossSales}`);
    }

    if (m.dailySales[d] !== day.grossSales) {
      fail(
        errors,
        `dailySales[${d}]=${m.dailySales[d]} != day.grossSales ${day.grossSales}`
      );
    }

    for (const k of CATEGORY_KEYS) {
      if (typeof day.byCategory?.[k] !== 'number') {
        fail(errors, `day ${d} byCategory.${k} missing`);
      }
    }
    for (const k of PAYMENT_KEYS) {
      if (typeof day.byPaymentMethod?.[k] !== 'number') {
        fail(errors, `day ${d} byPaymentMethod.${k} missing`);
      }
    }

    orderSum += day.orderCount;
  }

  if (orderSum !== m.orderCount) {
    fail(errors, `sum(days.orderCount)=${orderSum} != monthly.orderCount ${m.orderCount}`);
  }

  if (Object.keys(m.dailySales).length !== days.length) {
    fail(
      errors,
      `dailySales keys ${Object.keys(m.dailySales).length} != days ${days.length}`
    );
  }

  // --- byCategory ---
  const bc = payload.byCategory;
  if (!bc?.totals) {
    fail(errors, 'byCategory.totals missing');
  } else {
    if (bc.totals.items !== m.itemsSales) {
      fail(errors, 'byCategory.totals.items != monthly.itemsSales');
    }
    if (bc.totals.sideGameChip !== m.sideGameChipSales) {
      fail(errors, 'byCategory.totals.sideGameChip != monthly.sideGameChipSales');
    }
    if (bc.totals.tournaments !== m.tournamentsSales) {
      fail(errors, 'byCategory.totals.tournaments != monthly.tournamentsSales');
    }
    if (bc.totals.extraCost !== m.extraCostSales) {
      fail(errors, 'byCategory.totals.extraCost != monthly.extraCostSales');
    }
  }

  if (!bc?.itemSales || typeof bc.itemSales !== 'object') {
    fail(errors, 'byCategory.itemSales missing');
  } else {
    for (const [id, item] of Object.entries(bc.itemSales)) {
      for (const f of ['qty', 'sales', 'name', 'category']) {
        if (item[f] === undefined) {
          fail(errors, `itemSales.${id} missing ${f}`);
        }
      }
    }
  }

  // paths
  const paths = payload.plannedPaths || [];
  for (const p of paths) {
    if (!p.startsWith(`analyticsMonthly/${targetMonth}`)) {
      fail(errors, `planned path outside allowlist prefix: ${p}`);
    }
    if (p.includes('/byUser/') || p.includes('/byTemplateTournaments/') || p.includes('/aggregationMarkers/')) {
      fail(errors, `forbidden subcollection in planned path: ${p}`);
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    checks: {
      grossSales: m.grossSales,
      orderCount: m.orderCount,
      avgOrderValue: m.avgOrderValue,
      categorySum: catSum,
      paymentSum: paySum,
      dailySum,
      dayCount: days.length,
      orderSum,
      pathCount: paths.length,
    },
  };
}

/**
 * Assert read-back docs against payload (after apply).
 */
function assertReadBack(payload, readBack) {
  const errors = [];
  const m = readBack.monthly || {};
  const expected = payload.monthly;

  for (const f of [
    'grossSales',
    'orderCount',
    'avgOrderValue',
    'itemsSales',
    'sideGameChipSales',
    'tournamentsSales',
    'extraCostSales',
  ]) {
    if (Number(m[f]) !== Number(expected[f])) {
      fail(errors, `read-back monthly.${f}: ${m[f]} != ${expected[f]}`);
    }
  }

  for (const [date, val] of Object.entries(expected.dailySales)) {
    if (Number(m.dailySales?.[date]) !== Number(val)) {
      fail(errors, `read-back dailySales[${date}] mismatch`);
    }
  }

  for (const day of payload.days) {
    const rb = readBack.daysByDate?.[day.date];
    if (!rb) {
      fail(errors, `read-back missing day ${day.date}`);
      continue;
    }
    if (Number(rb.grossSales) !== Number(day.grossSales)) {
      fail(errors, `read-back day ${day.date} gross mismatch`);
    }
    if (Number(rb.orderCount) !== Number(day.orderCount)) {
      fail(errors, `read-back day ${day.date} orderCount mismatch`);
    }
  }

  const bc = readBack.byCategory || {};
  if (Number(bc.totals?.items) !== Number(payload.byCategory.totals.items)) {
    fail(errors, 'read-back byCategory.totals.items mismatch');
  }

  return { ok: errors.length === 0, errors };
}

module.exports = {
  assertNormalizedPayload,
  assertReadBack,
};
