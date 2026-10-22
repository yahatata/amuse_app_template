'use strict';

/**
 * D02-D01 demo analytics — shared constants & helpers
 * Spec: docs/営業デモ準備/D02-D01_2025-09再利用仕様.md
 */

const ALLOWED_PROJECT_ID = 'amuse-app-template';

const CATEGORY_KEYS = ['items', 'sideGameChip', 'tournaments', 'extraCost'];

const CATEGORY_FIELD_MAP = {
  items: 'itemsSales',
  sideGameChip: 'sideGameChipSales',
  tournaments: 'tournamentsSales',
  extraCost: 'extraCostSales',
};

/** Dashboard payment keys (sideGameTip removed) */
const PAYMENT_KEYS = [
  'cash',
  'credit_card',
  'electronic_money',
  'pointA',
  'pointB',
  'sideGameChip',
];

function parseArgs(argv) {
  const out = {
    targetMonth: null,
    demoDay: null,
    apply: false,
    source: null,
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') out.help = true;
    else if (a === '--apply') out.apply = true;
    else if (a === '--target-month') out.targetMonth = argv[++i];
    else if (a === '--demo-day') out.demoDay = argv[++i];
    else if (a === '--source') out.source = argv[++i];
    else throw new Error(`Unknown argument: ${a}`);
  }
  return out;
}

function assertMonth(month) {
  if (!/^\d{4}-\d{2}$/.test(month)) {
    throw new Error(`Invalid targetMonth: ${month} (expected YYYY-MM)`);
  }
}

function assertDate(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error(`Invalid demoDay: ${date} (expected YYYY-MM-DD)`);
  }
  const [y, m, d] = date.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (
    dt.getUTCFullYear() !== y ||
    dt.getUTCMonth() !== m - 1 ||
    dt.getUTCDate() !== d
  ) {
    throw new Error(`Invalid calendar date: ${date}`);
  }
}

function monthOf(date) {
  return date.slice(0, 7);
}

function dayOfMonth(date) {
  return Number(date.slice(8, 10));
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function sumValues(obj) {
  return Object.values(obj || {}).reduce((a, b) => a + Number(b || 0), 0);
}

/**
 * Largest-remainder allocation of total across weights.
 * Residual absorbed on last index.
 */
function allocateByWeights(total, weights) {
  const n = weights.length;
  if (n === 0) throw new Error('allocateByWeights: empty weights');
  const wSum = weights.reduce((a, b) => a + b, 0);
  if (wSum <= 0) {
    const base = Math.floor(total / n);
    const parts = Array(n).fill(base);
    parts[n - 1] += total - base * n;
    return parts;
  }
  const raw = weights.map((w) => (total * w) / wSum);
  const floors = raw.map((x) => Math.floor(x));
  let rem = total - floors.reduce((a, b) => a + b, 0);
  const frac = raw
    .map((x, i) => ({ i, f: x - floors[i] }))
    .sort((a, b) => b.f - a.f);
  const parts = floors.slice();
  for (let k = 0; k < rem; k++) {
    parts[frac[k % n].i] += 1;
  }
  // Safety: force exact sum via last bucket
  const diff = total - parts.reduce((a, b) => a + b, 0);
  parts[n - 1] += diff;
  return parts;
}

/**
 * Allocate parts that sum to `total` using ratio of `sourceParts`.
 * Last key absorbs residual.
 */
function allocateMap(total, keys, sourceParts) {
  const weights = keys.map((k) => Math.max(0, Number(sourceParts[k] || 0)));
  const parts = allocateByWeights(total, weights);
  const out = {};
  keys.forEach((k, i) => {
    out[k] = parts[i];
  });
  return out;
}

module.exports = {
  ALLOWED_PROJECT_ID,
  CATEGORY_KEYS,
  CATEGORY_FIELD_MAP,
  PAYMENT_KEYS,
  parseArgs,
  assertMonth,
  assertDate,
  monthOf,
  dayOfMonth,
  pad2,
  sumValues,
  allocateByWeights,
  allocateMap,
};
