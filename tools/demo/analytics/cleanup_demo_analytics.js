'use strict';

/**
 * Cleanup demo analyticsMonthly/{YYYY-MM} created by write_demo_analytics.js.
 *
 * Default: dry-run.
 * Deletes ONLY the demo seed month after verifying expected totals.
 * Aborts if unexpected subcollections with data exist, or values mismatch.
 *
 * Usage:
 *   node cleanup_demo_analytics.js --target-month 2026-09
 *   node cleanup_demo_analytics.js --target-month 2026-09 --apply
 */

const path = require('path');

const ROOT = path.resolve(__dirname);
const ADMIN_MODULE = path.resolve(
  ROOT,
  '../../../functions/node_modules/firebase-admin'
);
const ALLOWED_PROJECT_ID = 'amuse-app-template';

const EXPECTED = {
  grossSales: 4520000,
  orderCount: 1250,
  avgOrderValue: 3616,
};

const ALLOWED_SUBS = new Set(['days', 'byCategory']);

function parseArgs(argv) {
  const out = { targetMonth: null, apply: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') out.help = true;
    else if (a === '--apply') out.apply = true;
    else if (a === '--target-month') out.targetMonth = argv[++i];
    else throw new Error(`Unknown argument: ${a}`);
  }
  return out;
}

function resolveAdmin() {
  // eslint-disable-next-line import/no-dynamic-require, global-require
  return require(ADMIN_MODULE);
}

function initAdmin(admin) {
  if (process.env.FIRESTORE_EMULATOR_HOST) {
    throw new Error(
      `Refusing: FIRESTORE_EMULATOR_HOST=${process.env.FIRESTORE_EMULATOR_HOST}`
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
    throw new Error(`Project guard failed: ${appProject}`);
  }
  return { projectId: ALLOWED_PROJECT_ID };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.targetMonth) {
    console.log(
      'Usage: node cleanup_demo_analytics.js --target-month YYYY-MM [--apply]'
    );
    if (!args.targetMonth) process.exit(args.help ? 0 : 1);
    return;
  }
  if (!/^\d{4}-\d{2}$/.test(args.targetMonth)) {
    throw new Error(`Invalid --target-month ${args.targetMonth}`);
  }

  const admin = resolveAdmin();
  const { projectId } = initAdmin(admin);
  const db = admin.firestore();
  const month = args.targetMonth;
  const monthlyRef = db.doc(`analyticsMonthly/${month}`);

  console.log('\n========== cleanup demo analytics ==========');
  console.log(`mode: ${args.apply ? 'APPLY' : 'DRY-RUN'}`);
  console.log(`projectId: ${projectId}`);
  console.log(`target: analyticsMonthly/${month}`);

  const parentSnap = await monthlyRef.get();
  if (!parentSnap.exists) {
    // Still check orphan subs
    const cols = await monthlyRef.listCollections();
    let orphanDocs = 0;
    for (const col of cols) {
      const snap = await col.get();
      orphanDocs += snap.size;
      console.log(`  orphan ${col.id}: ${snap.size}`);
    }
    if (orphanDocs === 0) {
      console.log('Nothing to delete (already empty).');
      return;
    }
    console.error('STOP: parent missing but orphan subcollections exist.');
    process.exit(2);
  }

  const data = parentSnap.data() || {};
  const issues = [];
  if (data.grossSales !== EXPECTED.grossSales) {
    issues.push(`grossSales=${data.grossSales} != ${EXPECTED.grossSales}`);
  }
  if (data.orderCount !== EXPECTED.orderCount) {
    issues.push(`orderCount=${data.orderCount} != ${EXPECTED.orderCount}`);
  }
  if (data.avgOrderValue !== EXPECTED.avgOrderValue) {
    issues.push(
      `avgOrderValue=${data.avgOrderValue} != ${EXPECTED.avgOrderValue}`
    );
  }

  const cols = await monthlyRef.listCollections();
  const found = {};
  for (const col of cols) {
    const snap = await col.get();
    found[col.id] = snap.size;
    if (!ALLOWED_SUBS.has(col.id) && snap.size > 0) {
      issues.push(`unexpected subcollection ${col.id} has ${snap.size} doc(s)`);
    }
  }
  console.log(`parent: EXISTS gross=${data.grossSales} orders=${data.orderCount}`);
  console.log(`subs: ${JSON.stringify(found)}`);

  if (issues.length > 0) {
    console.error('STOP: analytics does not look like demo seed (or has extras).');
    for (const i of issues) console.error(`  - ${i}`);
    process.exit(2);
  }

  if (!args.apply) {
    console.log(
      `Dry-run OK. Would delete parent + days(${found.days || 0}) + byCategory.`
    );
    return;
  }

  // Delete days
  const daysSnap = await monthlyRef.collection('days').get();
  for (const doc of daysSnap.docs) {
    await doc.ref.delete();
  }
  // byCategory/summary
  const catSnap = await monthlyRef.collection('byCategory').get();
  for (const doc of catSnap.docs) {
    await doc.ref.delete();
  }
  // any leftover allowed empty leftovers
  const leftover = await monthlyRef.listCollections();
  for (const col of leftover) {
    const snap = await col.get();
    for (const doc of snap.docs) {
      await doc.ref.delete();
    }
  }
  await monthlyRef.delete();
  console.log(`Deleted analyticsMonthly/${month} (demo seed).`);
}

main().catch((e) => {
  console.error(e && e.stack ? e.stack : e);
  process.exit(1);
});
