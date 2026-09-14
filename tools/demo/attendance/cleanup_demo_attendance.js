'use strict';

/**
 * Cleanup demo attendances created by write_demo_attendance.js --apply.
 *
 * Default: dry-run (lists docs that would be deleted).
 * Deletes ONLY doc IDs listed in the manifest.
 *
 * Usage:
 *   node cleanup_demo_attendance.js --manifest out/manifest_....json
 *   node cleanup_demo_attendance.js --manifest out/manifest_....json --apply
 */

const fs = require('fs');
const path = require('path');

const { ALLOWED_PROJECT_ID, parseArgs } = require('./lib/helpers');

const ROOT = path.resolve(__dirname);
const ADMIN_MODULE = path.resolve(
  ROOT,
  '../../../functions/node_modules/firebase-admin'
);

function printHelp() {
  console.log(`Demo attendance cleanup (manifest-only)

Usage:
  node cleanup_demo_attendance.js --manifest path/to/manifest.json [--apply]

Default dry-run. --apply deletes only attendances/{docId} listed in manifest.
Does not touch shifts, staffs, attendanceLogs, or other attendances.
`);
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
  return { projectId: ALLOWED_PROJECT_ID };
}

function loadManifest(filePath) {
  const abs = path.resolve(filePath);
  const json = JSON.parse(fs.readFileSync(abs, 'utf8'));
  if (!Array.isArray(json.created) || json.created.length === 0) {
    throw new Error('manifest.created must be a non-empty array');
  }
  if (json.projectId && json.projectId !== ALLOWED_PROJECT_ID) {
    throw new Error(
      `manifest projectId "${json.projectId}" != ${ALLOWED_PROJECT_ID}`
    );
  }
  for (const row of json.created) {
    if (!row.docId || typeof row.docId !== 'string') {
      throw new Error('manifest entry missing docId');
    }
    if (row.path && row.path !== `attendances/${row.docId}`) {
      throw new Error(`manifest path not allowed: ${row.path}`);
    }
  }
  return { abs, json };
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

  console.log('\n========== cleanup demo attendance ==========');
  console.log(`mode:       ${args.apply ? 'APPLY' : 'DRY-RUN'}`);
  console.log(`projectId:  ${projectId}`);
  console.log(`manifest:   ${abs}`);
  console.log(`demoDay:    ${json.demoDay || '(none)'}`);
  console.log(`count:      ${json.created.length}`);
  console.log('--- targets ---');

  const existing = [];
  for (const row of json.created) {
    const ref = db.collection('attendances').doc(row.docId);
    const snap = await ref.get();
    const status = snap.exists ? 'EXISTS' : 'MISSING';
    console.log(
      `  ${status}  attendances/${row.docId}  staffId=${row.staffId || '?'} date=${row.date || '?'}`
    );
    if (snap.exists) existing.push(row.docId);
  }
  console.log('=============================================\n');

  if (!args.apply) {
    console.log(
      `Dry-run complete. Would delete ${existing.length} existing doc(s). No writes.`
    );
    return;
  }

  if (existing.length === 0) {
    console.log('Nothing to delete.');
    return;
  }

  const batch = db.batch();
  for (const docId of existing) {
    batch.delete(db.collection('attendances').doc(docId));
  }
  await batch.commit();
  console.log(`Deleted ${existing.length} attendance doc(s).`);
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
