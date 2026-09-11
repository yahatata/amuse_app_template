'use strict';

/**
 * Guarded Admin writer for demo past attendances (D02-G02 / G03 look).
 *
 * Default: dry-run (NO Firestore writes).
 * Apply: require explicit --apply after all asserts + collision guard.
 *
 * Usage:
 *   node write_demo_attendance.js --demo-day 2026-09-20 --staff-file staffs.local.json
 *   node write_demo_attendance.js --demo-day 2026-09-20 --staff-file staffs.local.json --apply
 *
 * NEVER run --apply unless explicitly approved. This session must not apply.
 */

const fs = require('fs');
const path = require('path');

const {
  ALLOWED_PROJECT_ID,
  EXPECTED_STAFF_COUNT,
  parseArgs,
  resolveStaffIds,
  normalizeStaffStatus,
} = require('./lib/helpers');
const {
  buildDemoAttendancePlan,
  attendanceDocFieldsFromRecord,
} = require('./lib/plan');
const { assertAttendancePlan, assertReadBack } = require('./lib/assert');

const ROOT = path.resolve(__dirname);
const ADMIN_MODULE = path.resolve(
  ROOT,
  '../../../functions/node_modules/firebase-admin'
);

function printHelp() {
  console.log(`Demo past-attendance guarded writer

Usage:
  node write_demo_attendance.js --demo-day YYYY-MM-DD (--staff-file path | --staff-ids id1,id2,id3) [--offline] [--apply]

Default is dry-run (no writes).
--apply writes attendances ONLY after staff + collision + plan asserts.

--offline: plan + asserts only (no Firestore). Uses displayNames from staff file
           or placeholder names. Cannot --apply with --offline.

Hard guards:
  - projectId must be ${ALLOWED_PROJECT_ID}
  - write collection: attendances only (no breaks / logs / shifts)
  - no date >= demo-day
  - existing (staffId, date) aborts entire apply (no merge/overwrite)
  - FIRESTORE_EMULATOR_HOST blocks apply
`);
}

function resolveAdmin() {
  // eslint-disable-next-line import/no-dynamic-require, global-require
  return require(ADMIN_MODULE);
}

function initAdmin(admin, { allowEmulator }) {
  if (process.env.FIRESTORE_EMULATOR_HOST && !allowEmulator) {
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

/**
 * Load active staff fullNames. Throws if missing or retired.
 */
async function validateStaff(db, staffIds) {
  const staffNames = [];
  for (const uid of staffIds) {
    const snap = await db.collection('staffs').doc(uid).get();
    if (!snap.exists) {
      throw new Error(`Staff guard: staffs/${uid} does not exist`);
    }
    const data = snap.data() || {};
    if (normalizeStaffStatus(data) === 'retired') {
      throw new Error(`Staff guard: staffs/${uid} is retired`);
    }
    const name =
      (typeof data.fullName === 'string' && data.fullName.trim()) ||
      (typeof data.staffsFullName === 'string' && data.staffsFullName.trim()) ||
      null;
    if (!name) {
      throw new Error(`Staff guard: staffs/${uid} has no fullName`);
    }
    staffNames.push(name);
  }
  return staffNames;
}

/**
 * Collision: any non-deleted attendance for (staffId, date) → abort.
 * Returns list of collisions (empty if none).
 */
async function findCollisions(db, records) {
  const collisions = [];
  for (const r of records) {
    const snap = await db
      .collection('attendances')
      .where('staffId', '==', r.staffId)
      .where('date', '==', r.date)
      .get();
    for (const doc of snap.docs) {
      const d = doc.data() || {};
      if (d.isDeleted === true) continue;
      collisions.push({
        docId: doc.id,
        staffId: r.staffId,
        date: r.date,
      });
    }
  }
  return collisions;
}

function printSummary({
  mode,
  projectId,
  plan,
  assertResult,
  collisions,
  staffValidated,
}) {
  console.log('\n========== demo attendance dry-run / apply summary ==========');
  console.log(`mode:            ${mode}`);
  console.log(`projectId:       ${projectId}`);
  console.log(`demoDay:         ${plan.meta.demoDay}`);
  console.log(`pattern:         ${plan.meta.pattern}`);
  console.log(`breaks:          ${plan.meta.breaks}`);
  console.log(`attendanceLogs:  ${plan.meta.attendanceLogs}`);
  console.log(`staffValidated:  ${staffValidated}`);
  console.log(`recordCount:     ${plan.meta.recordCount}`);
  console.log('--- staff ---');
  plan.meta.staffIds.forEach((id, i) => {
    console.log(
      `  [${String.fromCharCode(65 + i)}] uid=${id}  fullName=${plan.meta.staffNames[i]}`
    );
  });
  console.log('--- planned attendances ---');
  for (const r of plan.records) {
    console.log(
      `  date=${r.date}  staffId=${r.staffId}  fullName=${r.staffsFullName}  in=${r.clockInIso}  out=${r.clockOutIso}  actualWorkMinutes=${r.actualWorkMinutes}`
    );
  }
  console.log('--- collisions ---');
  if (!collisions) {
    console.log('  (not checked)');
  } else if (collisions.length === 0) {
    console.log('  none');
  } else {
    for (const c of collisions) {
      console.log(`  EXISTING doc=${c.docId} staffId=${c.staffId} date=${c.date}`);
    }
  }
  console.log('--- asserts ---');
  console.log(`ok:              ${assertResult.ok}`);
  console.log(`checks:          ${JSON.stringify(assertResult.checks)}`);
  if (!assertResult.ok) {
    console.log('errors:');
    for (const e of assertResult.errors) console.log(`  - ${e}`);
  }
  console.log('============================================================\n');
}

async function applyWrite(admin, plan) {
  if (process.env.FIRESTORE_EMULATOR_HOST) {
    throw new Error(
      `APPLY refused: FIRESTORE_EMULATOR_HOST=${process.env.FIRESTORE_EMULATOR_HOST}`
    );
  }

  const db = admin.firestore();
  const FieldValue = admin.firestore.FieldValue;
  const Timestamp = admin.firestore.Timestamp;

  const collisions = await findCollisions(db, plan.records);
  if (collisions.length > 0) {
    throw new Error(
      `Collision guard: ${collisions.length} existing attendance(s). Abort (no merge/overwrite).`
    );
  }

  // Pre-allocate refs then batch.create — all-or-nothing for this batch size (8).
  const refs = plan.records.map(() => db.collection('attendances').doc());
  const batch = db.batch();
  plan.records.forEach((record, i) => {
    const body = attendanceDocFieldsFromRecord(record, Timestamp, FieldValue);
    batch.create(refs[i], body);
  });
  await batch.commit();

  const written = [];
  for (let i = 0; i < refs.length; i++) {
    const snap = await refs[i].get();
    written.push({ id: snap.id, data: snap.data() });
  }
  return written;
}

function saveManifest(plan, written, projectId) {
  const outDir = path.join(ROOT, 'out');
  fs.mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const manifest = {
    generatedAt: new Date().toISOString(),
    projectId,
    demoDay: plan.meta.demoDay,
    created: written.map((w, i) => ({
      docId: w.id,
      staffId: plan.records[i].staffId,
      date: plan.records[i].date,
      path: `attendances/${w.id}`,
    })),
  };
  const file = path.join(
    outDir,
    `manifest_${plan.meta.demoDay}_${stamp}.json`
  );
  fs.writeFileSync(file, JSON.stringify(manifest, null, 2) + '\n');
  return file;
}

function savePlanDump(plan, demoDay) {
  const outDir = path.join(ROOT, 'out');
  fs.mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = path.join(outDir, `planned_${demoDay}_${stamp}.json`);
  fs.writeFileSync(file, JSON.stringify(plan, null, 2) + '\n');
  return file;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    process.exit(0);
  }
  if (!args.demoDay) {
    printHelp();
    throw new Error('--demo-day is required');
  }
  if (args.apply && args.offline) {
    throw new Error('Cannot --apply with --offline');
  }

  const resolved = resolveStaffIds(args, fs);
  if (resolved.staffIds.length !== EXPECTED_STAFF_COUNT) {
    throw new Error(
      `Expected ${EXPECTED_STAFF_COUNT} staff IDs, got ${resolved.staffIds.length}`
    );
  }

  let projectId = ALLOWED_PROJECT_ID;
  let admin = null;
  let staffNames = null;
  let staffValidated = false;
  let collisions = null;

  if (args.offline) {
    staffNames =
      resolved.displayNames &&
      resolved.displayNames.length === EXPECTED_STAFF_COUNT
        ? resolved.displayNames
        : resolved.staffIds.map(
            (id, i) => `DemoStaff-${String.fromCharCode(65 + i)}`
          );
    projectId = `${ALLOWED_PROJECT_ID} (offline — unverified)`;
  } else {
    admin = resolveAdmin();
    // dry-run: refuse emulator only on apply; for dry-run still refuse emulator
    // to match analytics (initAdmin always refuses emulator).
    const g = initAdmin(admin, { allowEmulator: false });
    projectId = g.projectId;
    const db = admin.firestore();
    staffNames = await validateStaff(db, resolved.staffIds);
    staffValidated = true;
  }

  const plan = buildDemoAttendancePlan({
    demoDay: args.demoDay,
    staffIds: resolved.staffIds,
    staffNames,
  });
  const assertResult = assertAttendancePlan(plan, { demoDay: args.demoDay });

  if (!args.offline && admin) {
    collisions = await findCollisions(admin.firestore(), plan.records);
  }

  printSummary({
    mode: args.apply ? 'APPLY' : args.offline ? 'DRY-RUN (offline)' : 'DRY-RUN',
    projectId,
    plan,
    assertResult,
    collisions,
    staffValidated,
  });

  const planFile = savePlanDump(plan, args.demoDay);
  console.log(`planned JSON saved: ${planFile}`);

  if (!assertResult.ok) {
    console.error('ASSERT FAILED — apply forbidden');
    process.exit(1);
  }

  if (collisions && collisions.length > 0) {
    console.error(
      `COLLISION GUARD: ${collisions.length} existing doc(s) — apply forbidden`
    );
    if (args.apply) process.exit(1);
  }

  if (!args.apply) {
    console.log('Dry-run complete. No Firestore writes performed.');
    return;
  }

  // --- apply ---
  console.log('Starting APPLY (writes enabled)...');
  const written = await applyWrite(admin, plan);
  const rb = assertReadBack(plan, written);
  if (!rb.ok) {
    console.error('READ-BACK ASSERT FAILED');
    for (const e of rb.errors) console.error(`  - ${e}`);
    process.exit(1);
  }
  const manifestFile = saveManifest(plan, written, projectId);
  console.log('APPLY OK — read-back asserts passed');
  console.log(`manifest: ${manifestFile}`);
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
