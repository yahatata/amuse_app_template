'use strict';

/**
 * Bulk check-in demo users 02–16 via createBillWithActiveStay (same helper as QR/manual).
 *
 * Usage:
 *   node checkin_demo_users.js
 *   node checkin_demo_users.js --apply
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname);
const ADMIN_MODULE = path.resolve(ROOT, '../../../functions/node_modules/firebase-admin');
const HELPER = path.resolve(
  ROOT,
  '../../../functions/lib/domains/bills/repos/createBillWithActiveStay.js'
);
const USERS_MANIFEST = path.resolve(
  ROOT,
  '../users/out/manifest_demo_users_2026-09-14T02-26-03-138Z.json'
);

const ALLOWED_PROJECT_ID = 'amuse-app-template';

function parseArgs(argv) {
  return { apply: argv.includes('--apply'), help: argv.includes('--help') };
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
  process.env.GCLOUD_PROJECT = ALLOWED_PROJECT_ID;
  process.env.GOOGLE_CLOUD_PROJECT = ALLOWED_PROJECT_ID;
  return { projectId: ALLOWED_PROJECT_ID };
}

function loadTargets() {
  const json = JSON.parse(fs.readFileSync(USERS_MANIFEST, 'utf8'));
  if (!Array.isArray(json.created) || json.created.length === 0) {
    throw new Error('users manifest empty');
  }
  return json.created.map((c) => ({
    pokerName: c.pokerName,
    email: c.email,
    loginId: c.loginId,
    uid: c.uid,
  }));
}

async function readStoreState(db) {
  const snap = await db.collection('storeMeta').doc('currentBusinessDay').get();
  if (!snap.exists) return { exists: false };
  const d = snap.data() || {};
  return {
    exists: true,
    status: d.status || null,
    currentBusinessDateKey: d.currentBusinessDateKey || null,
  };
}

async function precheck(db, targets) {
  const rows = [];
  let blocking = false;
  for (const t of targets) {
    const userSnap = await db.collection('users').doc(t.uid).get();
    const staySnap = await db.collection('activeStays').doc(t.uid).get();
    const stay = staySnap.exists ? staySnap.data() || {} : null;
    const active = stay && stay.isActive === true;
    let status = 'READY';
    if (!userSnap.exists) {
      status = 'NO_USER';
      blocking = true;
    } else if (active) {
      status = 'ALREADY_ACTIVE';
      blocking = true;
    }
    rows.push({
      ...t,
      status,
      existingBillId: stay && stay.billId ? stay.billId : null,
      userPokerName: userSnap.exists ? userSnap.data().pokerName : null,
    });
  }
  return { rows, blocking };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log('Usage: node checkin_demo_users.js [--apply]');
    process.exit(0);
  }

  const admin = resolveAdmin();
  const { projectId } = initAdmin(admin);
  const db = admin.firestore();
  // eslint-disable-next-line import/no-dynamic-require, global-require
  const { createBillWithActiveStay } = require(HELPER);

  const targets = loadTargets();
  console.log(`\n=== demo check-in (${projectId}) ===`);
  console.log(`mode: ${args.apply ? 'APPLY' : 'DRY-RUN'}`);
  console.log(`targets: ${targets.length}`);

  const store = await readStoreState(db);
  console.log('\n--- storeMeta/currentBusinessDay ---');
  console.log(JSON.stringify(store));

  if (!store.exists || store.status !== 'running' || !store.currentBusinessDateKey) {
    console.error('\nSTOP: store is not running (need status=running + currentBusinessDateKey).');
    process.exit(2);
  }

  const { rows, blocking } = await precheck(db, targets);
  console.log('\n--- pre-check ---');
  for (const r of rows) {
    console.log(
      `${r.status.padEnd(16)} ${r.pokerName} uid=${r.uid}` +
        (r.existingBillId ? ` billId=${r.existingBillId}` : '')
    );
  }

  if (blocking) {
    console.error('\nSTOP: blocking pre-check (NO_USER or ALREADY_ACTIVE). No writes.');
    process.exit(2);
  }

  if (!args.apply) {
    console.log('\nAll READY. Re-run with --apply to check in.');
    process.exit(0);
  }

  const created = [];
  for (const t of rows) {
    const billId = crypto.randomUUID();
    const idempotencyKey = crypto.randomUUID();
    console.log(`\nCheck-in ${t.pokerName}...`);
    try {
      const result = await createBillWithActiveStay({
        billId,
        userId: t.uid,
        pokerName: t.userPokerName || t.pokerName,
        idempotencyKey,
        entranceFee: 0,
        // description なし → extras なし（デモ用・cleanup容易）
      });
      if (!result.success) {
        throw new Error(`helper success=false billId=${billId}`);
      }
      await db.collection('users').doc(t.uid).update({
        lastCheckInAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      const staySnap = await db.collection('activeStays').doc(t.uid).get();
      const billSnap = await db.collection('bills').doc(result.billId).get();
      const stayOk = staySnap.exists && staySnap.data()?.isActive === true;
      const billOk = billSnap.exists && billSnap.data()?.status === 'open';
      if (!stayOk || !billOk) {
        throw new Error(`read-back failed stayOk=${stayOk} billOk=${billOk}`);
      }

      const row = {
        pokerName: t.pokerName,
        uid: t.uid,
        billId: result.billId,
        businessDate: result.businessDate,
        activeStayPath: `activeStays/${t.uid}`,
        billPath: `bills/${result.billId}`,
        entranceFee: 0,
        lastCheckInAtUpdated: true,
        error: null,
      };
      created.push(row);
      console.log(`  OK billId=${result.billId} businessDate=${result.businessDate}`);
    } catch (e) {
      const msg = e && e.message ? e.message : String(e);
      console.error(`  FAIL ${t.pokerName}: ${msg}`);
      created.push({
        pokerName: t.pokerName,
        uid: t.uid,
        billId: null,
        error: msg,
      });
      console.error('Stopping further check-ins. Manifest saved for partial.');
      break;
    }
  }

  const outDir = path.join(ROOT, 'out');
  fs.mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const manifestPath = path.join(outDir, `manifest_checkin_${stamp}.json`);
  const manifest = {
    generatedAt: new Date().toISOString(),
    projectId,
    businessDate: store.currentBusinessDateKey,
    entranceFee: 0,
    sourceUsersManifest: USERS_MANIFEST,
    created,
  };
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
  console.log(`\nmanifest: ${manifestPath}`);

  const ok = created.filter((c) => !c.error && c.billId).length;
  console.log(`checkin_ok=${ok}/${rows.length}`);
  if (ok !== rows.length) process.exit(1);
  console.log('ALL DONE');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
