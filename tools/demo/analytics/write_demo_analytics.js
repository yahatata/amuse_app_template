'use strict';

/**
 * Guarded Admin writer for D02-D01 demo analytics.
 *
 * Default: dry-run (NO Firestore writes).
 * Apply: require explicit --apply after all asserts pass.
 *
 * Usage:
 *   node write_demo_analytics.js --target-month 2026-09 --demo-day 2026-09-20
 *   node write_demo_analytics.js --target-month 2026-09 --demo-day 2026-09-20 --apply
 */

const fs = require('fs');
const path = require('path');

const { ALLOWED_PROJECT_ID, parseArgs } = require('./lib/helpers');
const { normalizeDemoAnalytics } = require('./lib/normalize');
const {
  assertNormalizedPayload,
  assertReadBack,
} = require('./lib/assert');

const ROOT = path.resolve(__dirname);
const DEFAULT_SOURCE = path.join(ROOT, 'source_2025-09.json');
const ADMIN_MODULE = path.resolve(
  ROOT,
  '../../../functions/node_modules/firebase-admin'
);

function printHelp() {
  console.log(`D02-D01 guarded demo analytics writer

Usage:
  node write_demo_analytics.js --target-month YYYY-MM --demo-day YYYY-MM-DD [--source path] [--apply]

Default is dry-run (no writes).
--apply performs Firestore writes ONLY after asserts + existing-doc guard.

Hard guards:
  - projectId must be ${ALLOWED_PROJECT_ID}
  - write paths limited to analyticsMonthly/{targetMonth} (+ days, byCategory/summary)
  - existing analyticsMonthly/{targetMonth} aborts apply
  - FIRESTORE_EMULATOR_HOST must be unset
`);
}

function loadSource(sourcePath) {
  const raw = fs.readFileSync(sourcePath, 'utf8');
  return JSON.parse(raw);
}

function formatYen(n) {
  return `¥${Number(n).toLocaleString('ja-JP')}`;
}

function printDryRunSummary(payload, assertResult, projectId, mode) {
  const m = payload.monthly;
  const bc = payload.byCategory;
  console.log('\n========== D02-D01 dry-run summary ==========');
  console.log(`mode:            ${mode}`);
  console.log(`projectId:       ${projectId}`);
  console.log(`targetMonth:     ${payload.meta.targetMonth}`);
  console.log(`demoDay:         ${payload.meta.demoDay}`);
  console.log(`sourceId:        ${payload.meta.sourceId}`);
  console.log('--- monthly ---');
  console.log(`grossSales:      ${formatYen(m.grossSales)}`);
  console.log(`orderCount:      ${m.orderCount}`);
  console.log(`avgOrderValue:   ${m.avgOrderValue}`);
  console.log(
    `categories:      items=${m.itemsSales} chip=${m.sideGameChipSales} tn=${m.tournamentsSales} extra=${m.extraCostSales}`
  );
  console.log(`payments:        ${JSON.stringify(m.paymentTotals)}`);
  console.log(`dayCount:        ${payload.days.length}`);
  console.log('--- byCategory ---');
  console.log(`totals:          ${JSON.stringify(bc.totals)}`);
  console.log(`itemSales keys:  ${Object.keys(bc.itemSales || {}).join(', ')}`);
  console.log('--- planned paths ---');
  for (const p of payload.plannedPaths) {
    console.log(`  ${p}`);
  }
  console.log('--- asserts ---');
  console.log(`ok:              ${assertResult.ok}`);
  console.log(`checks:          ${JSON.stringify(assertResult.checks)}`);
  if (!assertResult.ok) {
    console.log('errors:');
    for (const e of assertResult.errors) console.log(`  - ${e}`);
  }
  console.log('============================================\n');
}

function resolveAdmin() {
  // eslint-disable-next-line import/no-dynamic-require, global-require
  return require(ADMIN_MODULE);
}

function initAdmin(admin) {
  if (process.env.FIRESTORE_EMULATOR_HOST) {
    throw new Error(
      `Refusing to run: FIRESTORE_EMULATOR_HOST=${process.env.FIRESTORE_EMULATOR_HOST}`
    );
  }

  if (!admin.apps.length) {
    admin.initializeApp({ projectId: ALLOWED_PROJECT_ID });
  }

  const appProject =
    admin.app().options.projectId ||
    process.env.GCLOUD_PROJECT ||
    process.env.GOOGLE_CLOUD_PROJECT ||
    null;

  if (appProject !== ALLOWED_PROJECT_ID) {
    throw new Error(
      `Project guard failed: app/env projectId="${appProject}" (allowed: ${ALLOWED_PROJECT_ID})`
    );
  }

  // Extra ADC project check when available
  return { projectId: ALLOWED_PROJECT_ID };
}

function monthlyDocForWrite(monthly, FieldValue) {
  return {
    grossSales: monthly.grossSales,
    orderCount: monthly.orderCount,
    avgOrderValue: monthly.avgOrderValue,
    itemsSales: monthly.itemsSales,
    sideGameChipSales: monthly.sideGameChipSales,
    tournamentsSales: monthly.tournamentsSales,
    extraCostSales: monthly.extraCostSales,
    dailySales: monthly.dailySales,
    paymentTotals: monthly.paymentTotals,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };
}

function dayDocForWrite(day, FieldValue) {
  return {
    grossSales: day.grossSales,
    orderCount: day.orderCount,
    itemsSales: day.itemsSales,
    sideGameChipSales: day.sideGameChipSales,
    tournamentsSales: day.tournamentsSales,
    extraCostSales: day.extraCostSales,
    byCategory: day.byCategory,
    byPaymentMethod: day.byPaymentMethod,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };
}

function byCategoryDocForWrite(byCategory, FieldValue) {
  return {
    totals: byCategory.totals,
    orderCounts: byCategory.orderCounts,
    itemSales: byCategory.itemSales,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };
}

async function checkExistingTarget(db, targetMonth) {
  const snap = await db.doc(`analyticsMonthly/${targetMonth}`).get();
  return snap.exists;
}

async function applyWrite(admin, payload) {
  const db = admin.firestore();
  const FieldValue = admin.firestore.FieldValue;
  const targetMonth = payload.meta.targetMonth;

  const exists = await checkExistingTarget(db, targetMonth);
  if (exists) {
    throw new Error(
      `Existing-doc guard: analyticsMonthly/${targetMonth} already exists. Abort (no merge/overwrite).`
    );
  }

  const batch = db.batch();
  const monthlyRef = db.doc(`analyticsMonthly/${targetMonth}`);
  batch.create(monthlyRef, monthlyDocForWrite(payload.monthly, FieldValue));

  for (const day of payload.days) {
    const ref = monthlyRef.collection('days').doc(day.date);
    batch.create(ref, dayDocForWrite(day, FieldValue));
  }

  const catRef = monthlyRef.collection('byCategory').doc('summary');
  batch.create(catRef, byCategoryDocForWrite(payload.byCategory, FieldValue));

  await batch.commit();

  // read-back
  const monthlySnap = await monthlyRef.get();
  const daysSnap = await monthlyRef.collection('days').get();
  const catSnap = await catRef.get();
  const daysByDate = {};
  daysSnap.docs.forEach((d) => {
    daysByDate[d.id] = d.data();
  });

  return {
    monthly: monthlySnap.data(),
    daysByDate,
    byCategory: catSnap.data(),
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    process.exit(0);
  }
  if (!args.targetMonth || !args.demoDay) {
    printHelp();
    throw new Error('--target-month and --demo-day are required');
  }

  const sourcePath = path.resolve(args.source || DEFAULT_SOURCE);
  const source = loadSource(sourcePath);
  const payload = normalizeDemoAnalytics(source, {
    targetMonth: args.targetMonth,
    demoDay: args.demoDay,
  });

  const assertResult = assertNormalizedPayload(payload, {
    targetMonth: args.targetMonth,
    demoDay: args.demoDay,
  });

  // Project identity for dry-run display (no write)
  let projectId = ALLOWED_PROJECT_ID;
  let admin = null;

  if (args.apply) {
    admin = resolveAdmin();
    const g = initAdmin(admin);
    projectId = g.projectId;
  } else {
    // dry-run may still verify ADC project without writing
    try {
      admin = resolveAdmin();
      const g = initAdmin(admin);
      projectId = g.projectId;
    } catch (e) {
      console.warn(`[warn] project probe skipped: ${e.message}`);
      projectId = `${ALLOWED_PROJECT_ID} (unverified locally)`;
    }
  }

  printDryRunSummary(
    payload,
    assertResult,
    projectId,
    args.apply ? 'APPLY' : 'DRY-RUN'
  );

  // Always save rollback path list locally (no secrets)
  const outDir = path.join(ROOT, 'out');
  fs.mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const pathListFile = path.join(
    outDir,
    `planned_paths_${args.targetMonth}_${stamp}.txt`
  );
  fs.writeFileSync(pathListFile, payload.plannedPaths.join('\n') + '\n');
  console.log(`planned paths saved: ${pathListFile}`);

  if (!assertResult.ok) {
    console.error('ASSERT FAILED — apply forbidden');
    process.exit(1);
  }

  if (!args.apply) {
    console.log('Dry-run complete. No Firestore writes performed.');
    // Optional existing-doc probe (read-only)
    if (admin) {
      const db = admin.firestore();
      const exists = await checkExistingTarget(db, args.targetMonth);
      console.log(
        `existing analyticsMonthly/${args.targetMonth}: ${exists ? 'YES (apply would abort)' : 'NO (apply allowed)'}`
      );
    }
    return;
  }

  // --- apply path ---
  console.log('Starting APPLY (writes enabled)...');
  const readBack = await applyWrite(admin, payload);
  const rb = assertReadBack(payload, readBack);
  if (!rb.ok) {
    console.error('READ-BACK ASSERT FAILED');
    for (const e of rb.errors) console.error(`  - ${e}`);
    console.error(
      'Manual rollback: delete only the paths listed in',
      pathListFile
    );
    process.exit(1);
  }
  console.log('APPLY OK — read-back asserts passed');
  console.log(`Rollback path list: ${pathListFile}`);
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
