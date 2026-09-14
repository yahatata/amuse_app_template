'use strict';

/**
 * Cleanup demo check-ins created by checkin_demo_users.js --apply.
 *
 * Default: dry-run.
 * Deletes ONLY paths listed in the check-in manifest, and ONLY if each bill
 * still looks like an untouched demo check-in (open / no orders / no extras /
 * stay matches). Any mutation aborts the whole run (no partial deletes).
 *
 * Usage:
 *   node cleanup_demo_checkin.js --manifest out/manifest_checkin_....json
 *   node cleanup_demo_checkin.js --manifest out/manifest_checkin_....json --apply
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname);
const ADMIN_MODULE = path.resolve(
  ROOT,
  '../../../functions/node_modules/firebase-admin'
);
const ALLOWED_PROJECT_ID = 'amuse-app-template';

function parseArgs(argv) {
  const out = { manifest: null, apply: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') out.help = true;
    else if (a === '--apply') out.apply = true;
    else if (a === '--manifest') out.manifest = argv[++i];
    else throw new Error(`Unknown argument: ${a}`);
  }
  return out;
}

function printHelp() {
  console.log(`Demo check-in cleanup (manifest-only, mutation-safe)

Usage:
  node cleanup_demo_checkin.js --manifest path/to/manifest.json [--apply]

Default dry-run. --apply deletes only after ALL targets pass safety checks.
`);
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

function loadManifest(filePath) {
  const abs = path.resolve(filePath);
  const json = JSON.parse(fs.readFileSync(abs, 'utf8'));
  if (json.projectId && json.projectId !== ALLOWED_PROJECT_ID) {
    throw new Error(`manifest projectId "${json.projectId}" != ${ALLOWED_PROJECT_ID}`);
  }
  if (!Array.isArray(json.created) || json.created.length === 0) {
    throw new Error('manifest.created must be a non-empty array');
  }
  for (const row of json.created) {
    if (!row.uid || !row.billId) {
      throw new Error(`manifest row missing uid/billId: ${JSON.stringify(row)}`);
    }
  }
  return { abs, json };
}

async function listSubcollectionIds(ref) {
  const cols = await ref.listCollections();
  const out = {};
  for (const col of cols) {
    const snap = await col.get();
    out[col.id] = snap.docs.map((d) => d.id);
  }
  return out;
}

async function inspectTarget(db, row, expectedBusinessDate) {
  const issues = [];
  const billRef = db.collection('bills').doc(row.billId);
  const stayRef = db.collection('activeStays').doc(row.uid);
  const billSnap = await billRef.get();
  const staySnap = await stayRef.get();

  const report = {
    pokerName: row.pokerName,
    uid: row.uid,
    billId: row.billId,
    billExists: billSnap.exists,
    stayExists: staySnap.exists,
    safe: true,
    issues: [],
    subcollections: {},
    todaysBillPath: null,
  };

  if (!billSnap.exists) {
    // Already gone — OK to skip delete
    report.safe = true;
    report.missing = true;
    return report;
  }

  const bill = billSnap.data() || {};
  if (bill.status !== 'open') {
    issues.push(`bill.status=${bill.status} (expected open)`);
  }
  if (expectedBusinessDate && bill.businessDate !== expectedBusinessDate) {
    issues.push(
      `bill.businessDate=${bill.businessDate} != manifest ${expectedBusinessDate}`
    );
  }
  const partyUserId = bill.party && bill.party.userId;
  if (partyUserId && partyUserId !== row.uid) {
    issues.push(`bill.party.userId=${partyUserId} != uid ${row.uid}`);
  }
  if (typeof bill.entranceFee === 'number' && bill.entranceFee !== 0) {
    issues.push(`bill.entranceFee=${bill.entranceFee} (expected 0)`);
  }

  const subs = await listSubcollectionIds(billRef);
  report.subcollections = subs;

  const allowedSubs = new Set(['settlementCycles', 'idempotency', 'extras']);
  for (const name of Object.keys(subs)) {
    if (!allowedSubs.has(name) && (subs[name] || []).length > 0) {
      issues.push(`unexpected bill subcollection with docs: ${name}`);
    }
  }

  // orders / items / tournament links / payments etc. = mutated
  for (const forbidden of [
    'orders',
    'orderItems',
    'tournaments',
    'participants',
    'payments',
    'refunds',
    'sideGameSessions',
  ]) {
    if ((subs[forbidden] || []).length > 0) {
      issues.push(`mutated: ${forbidden} has ${(subs[forbidden] || []).length} doc(s)`);
    }
  }

  if ((subs.extras || []).length > 0) {
    issues.push(`extras present (${subs.extras.length}) — demo check-in had none`);
  }

  // settlementCycles: allow only initial cycle "1"
  const cycles = subs.settlementCycles || [];
  if (cycles.length === 0) {
    issues.push('settlementCycles missing');
  } else if (cycles.length > 1 || cycles[0] !== '1') {
    issues.push(`settlementCycles unexpected ids=[${cycles.join(',')}]`);
  }

  if (staySnap.exists) {
    const stay = staySnap.data() || {};
    if (stay.isActive !== true) {
      issues.push(`activeStay.isActive=${stay.isActive}`);
    }
    if (stay.billId && stay.billId !== row.billId) {
      issues.push(`activeStay.billId=${stay.billId} != manifest billId`);
    }
  }

  // Optional todaysBills dual-write doc
  if (bill.businessDate) {
    const tbId = `${bill.businessDate}_${row.billId}`;
    const tbRef = db.collection('todaysBills').doc(tbId);
    const tbSnap = await tbRef.get();
    if (tbSnap.exists) {
      report.todaysBillPath = `todaysBills/${tbId}`;
    }
  }

  report.issues = issues;
  report.safe = issues.length === 0;
  return report;
}

async function deleteBillTree(db, billId, subcollections) {
  const billRef = db.collection('bills').doc(billId);
  // Delete known subdocs first
  for (const [colName, ids] of Object.entries(subcollections || {})) {
    for (const id of ids) {
      await billRef.collection(colName).doc(id).delete();
    }
  }
  // Any leftover subcollections
  const leftover = await billRef.listCollections();
  for (const col of leftover) {
    const snap = await col.get();
    for (const doc of snap.docs) {
      await doc.ref.delete();
    }
  }
  await billRef.delete();
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    process.exit(0);
  }
  if (!args.manifest) {
    printHelp();
    throw new Error('--manifest is required');
  }

  const { abs, json } = loadManifest(args.manifest);
  const admin = resolveAdmin();
  const { projectId } = initAdmin(admin);
  const db = admin.firestore();

  console.log('\n========== cleanup demo check-in ==========');
  console.log(`mode:      ${args.apply ? 'APPLY' : 'DRY-RUN'}`);
  console.log(`projectId: ${projectId}`);
  console.log(`manifest:  ${abs}`);
  console.log(`businessDate: ${json.businessDate || '(none)'}`);
  console.log(`count:     ${json.created.length}`);

  const reports = [];
  let blocking = false;
  for (const row of json.created) {
    if (row.error || !row.billId) {
      console.log(`  SKIP ${row.pokerName} (error/no billId)`);
      continue;
    }
    const r = await inspectTarget(db, row, json.businessDate);
    reports.push(r);
    const flag = r.missing ? 'MISSING' : r.safe ? 'SAFE' : 'UNSAFE';
    console.log(
      `  ${flag.padEnd(7)} ${r.pokerName} bill=${r.billId} stay=${r.stayExists}`
    );
    if (!r.safe) {
      blocking = true;
      for (const i of r.issues) console.log(`           - ${i}`);
    }
  }

  if (blocking) {
    console.error(
      '\nSTOP: one or more bills look mutated / unsafe. No deletes performed.'
    );
    process.exit(2);
  }

  const toDelete = reports.filter((r) => !r.missing);
  if (!args.apply) {
    console.log(
      `\nDry-run OK. Would delete ${toDelete.length} bill tree(s) + matching activeStays/todaysBills.`
    );
    return;
  }

  for (const r of toDelete) {
    console.log(`Deleting ${r.pokerName}...`);
    await deleteBillTree(db, r.billId, r.subcollections);
    await db.collection('activeStays').doc(r.uid).delete();
    if (r.todaysBillPath) {
      await db.doc(r.todaysBillPath).delete();
    }
  }
  console.log(`Deleted ${toDelete.length} demo check-in(s).`);
}

main().catch((e) => {
  console.error(e && e.stack ? e.stack : e);
  process.exit(1);
});
