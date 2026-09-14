'use strict';

/**
 * Staff LINE demo: 3 past attendances for one staff.
 * Reuses tools/demo/attendance helpers + attendanceDocFieldsFromRecord + cleanup manifest format.
 *
 * Usage:
 *   node write_staff_line_demo_attendance.js
 *   node write_staff_line_demo_attendance.js --apply
 */

const fs = require('fs');
const path = require('path');

const {
  ALLOWED_PROJECT_ID,
  jstWallClockToUtcDate,
  formatIso,
  computeMinutes,
  normalizeStaffStatus,
} = require('./lib/helpers');
const { attendanceDocFieldsFromRecord } = require('./lib/plan');
const { assertReadBack } = require('./lib/assert');

const ROOT = path.resolve(__dirname);
const ADMIN_MODULE = path.resolve(
  ROOT,
  '../../../functions/node_modules/firebase-admin'
);

const STAFF_ID = 'U286d9ad523afd49a7aa0490b4de534ee';

/** Spec rows (JST). clockOutDate defaults to date when omitted. */
const SPECS = [
  {
    date: '2026-09-03',
    clockIn: { hour: 9, minute: 0 },
    clockOutDate: '2026-09-03',
    clockOut: { hour: 15, minute: 0 },
    expectedActualWorkMinutes: 360,
  },
  {
    date: '2026-09-10',
    clockIn: { hour: 12, minute: 0 },
    clockOutDate: '2026-09-10',
    clockOut: { hour: 17, minute: 0 },
    expectedActualWorkMinutes: 300,
  },
  {
    date: '2026-09-13',
    clockIn: { hour: 18, minute: 0 },
    clockOutDate: '2026-09-14',
    clockOut: { hour: 0, minute: 0 },
    expectedActualWorkMinutes: 360,
  },
];

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

async function validateStaff(db, staffId) {
  const snap = await db.collection('staffs').doc(staffId).get();
  if (!snap.exists) {
    throw new Error(`Staff guard: staffs/${staffId} does not exist`);
  }
  const data = snap.data() || {};
  if (normalizeStaffStatus(data) === 'retired') {
    throw new Error(`Staff guard: staffs/${staffId} is retired`);
  }
  const name =
    (typeof data.fullName === 'string' && data.fullName.trim()) ||
    (typeof data.staffsFullName === 'string' && data.staffsFullName.trim()) ||
    null;
  if (!name) {
    throw new Error(`Staff guard: staffs/${staffId} has no fullName`);
  }
  return name;
}

function buildPlan(staffId, staffsFullName) {
  const records = SPECS.map((spec) => {
    const clockInDate = jstWallClockToUtcDate(
      spec.date,
      spec.clockIn.hour,
      spec.clockIn.minute
    );
    const clockOutDate = jstWallClockToUtcDate(
      spec.clockOutDate,
      spec.clockOut.hour,
      spec.clockOut.minute
    );
    if (clockOutDate.getTime() <= clockInDate.getTime()) {
      throw new Error(`clockOut <= clockIn for ${spec.date}`);
    }
    const minutes = computeMinutes(clockInDate, clockOutDate);
    if (minutes.actualWorkMinutes !== spec.expectedActualWorkMinutes) {
      throw new Error(
        `actualWorkMinutes ${minutes.actualWorkMinutes} != expected ${spec.expectedActualWorkMinutes} for ${spec.date}`
      );
    }
    return {
      staffId,
      staffsFullName,
      date: spec.date,
      clockInIso: formatIso(clockInDate),
      clockOutIso: formatIso(clockOutDate),
      clockInMs: clockInDate.getTime(),
      clockOutMs: clockOutDate.getTime(),
      ...minutes,
      closedStoreWithoutClockOut: false,
      isManual: true,
      isDeleted: false,
      isOnBreak: false,
      currentBreakStartedAt: null,
      breakCount: 0,
      payrollStatus: 'unreflected',
      lastActionType: 'create_attendance',
      expectedActualWorkMinutes: spec.expectedActualWorkMinutes,
    };
  });

  return {
    meta: {
      demoDay: '2026-09-14',
      staffIds: [staffId],
      staffNames: [staffsFullName],
      recordCount: records.length,
      pattern: 'staff-line-3-custom',
      breaks: 'none',
      attendanceLogs: 'not written',
    },
    records,
  };
}

function assertCustomPlan(plan) {
  const errors = [];
  if (plan.records.length !== 3) {
    errors.push(`expected 3 records, got ${plan.records.length}`);
  }
  for (const r of plan.records) {
    const pair = `${r.staffId}__${r.date}`;
    if (r.staffId !== STAFF_ID) errors.push(`wrong staffId ${pair}`);
    if (r.isManual !== true) errors.push(`isManual ${pair}`);
    if (r.isDeleted !== false) errors.push(`isDeleted ${pair}`);
    if (r.breakCount !== 0 || r.breakMinutes !== 0) errors.push(`breaks ${pair}`);
    if (r.payrollStatus !== 'unreflected') errors.push(`payroll ${pair}`);
    if (r.closedStoreWithoutClockOut !== false) {
      errors.push(`closedStoreWithoutClockOut ${pair}`);
    }
    if (r.actualWorkMinutes !== r.expectedActualWorkMinutes) {
      errors.push(
        `actualWorkMinutes ${r.actualWorkMinutes} != ${r.expectedActualWorkMinutes} (${pair})`
      );
    }
    if (!(r.clockOutMs > r.clockInMs)) errors.push(`order ${pair}`);
  }
  // 9/13 overnight: out must be 2026-09-13T15:00:00.000Z (= 9/14 00:00 JST)
  const overnight = plan.records.find((r) => r.date === '2026-09-13');
  if (!overnight) errors.push('missing 2026-09-13');
  else if (overnight.clockOutIso !== '2026-09-13T15:00:00.000Z') {
    errors.push(
      `9/13 clockOutIso expected 2026-09-13T15:00:00.000Z got ${overnight.clockOutIso}`
    );
  }
  if (overnight && overnight.clockInIso !== '2026-09-13T09:00:00.000Z') {
    errors.push(
      `9/13 clockInIso expected 2026-09-13T09:00:00.000Z got ${overnight.clockInIso}`
    );
  }
  return { ok: errors.length === 0, errors };
}

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

async function applyWrite(admin, plan) {
  const db = admin.firestore();
  const FieldValue = admin.firestore.FieldValue;
  const Timestamp = admin.firestore.Timestamp;

  const collisions = await findCollisions(db, plan.records);
  if (collisions.length > 0) {
    throw new Error(
      `Collision: ${collisions.length} existing. Abort (no overwrite).`
    );
  }

  const refs = plan.records.map(() => db.collection('attendances').doc());
  const batch = db.batch();
  plan.records.forEach((record, i) => {
    batch.create(
      refs[i],
      attendanceDocFieldsFromRecord(record, Timestamp, FieldValue)
    );
  });
  await batch.commit();

  const written = [];
  for (let i = 0; i < refs.length; i++) {
    const snap = await refs[i].get();
    written.push({ id: snap.id, data: snap.data() });
  }
  return written;
}

function saveManifest(plan, written, projectId, fullName) {
  const outDir = path.join(ROOT, 'out');
  fs.mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const manifest = {
    generatedAt: new Date().toISOString(),
    projectId,
    demoDay: plan.meta.demoDay,
    purpose: 'staff-line-past-attendance-3',
    created: written.map((w, i) => ({
      docId: w.id,
      staffId: plan.records[i].staffId,
      fullName,
      date: plan.records[i].date,
      clockIn: plan.records[i].clockInIso,
      clockOut: plan.records[i].clockOutIso,
      actualWorkMinutes: plan.records[i].actualWorkMinutes,
      path: `attendances/${w.id}`,
    })),
  };
  const file = path.join(
    outDir,
    `manifest_staff_line_${plan.meta.demoDay}_${stamp}.json`
  );
  fs.writeFileSync(file, JSON.stringify(manifest, null, 2) + '\n');
  return file;
}

async function main() {
  const apply = process.argv.includes('--apply');
  const admin = resolveAdmin();
  const { projectId } = initAdmin(admin);
  const db = admin.firestore();

  console.log(`\n=== staff LINE demo attendance ===`);
  console.log(`mode: ${apply ? 'APPLY' : 'DRY-RUN'}`);
  console.log(`projectId: ${projectId}`);
  console.log(`staffId: ${STAFF_ID}`);

  const fullName = await validateStaff(db, STAFF_ID);
  console.log(`fullName: ${fullName}`);

  const plan = buildPlan(STAFF_ID, fullName);
  const assertResult = assertCustomPlan(plan);
  const collisions = await findCollisions(db, plan.records);

  console.log('\n--- planned ---');
  for (const r of plan.records) {
    console.log(
      `  date=${r.date} in=${r.clockInIso} out=${r.clockOutIso} actualWorkMinutes=${r.actualWorkMinutes} night=${r.nightWorkMinutes}`
    );
  }
  console.log('--- collisions ---');
  if (collisions.length === 0) console.log('  none');
  else {
    for (const c of collisions) {
      console.log(`  EXISTING ${c.docId} ${c.staffId} ${c.date}`);
    }
  }
  console.log('--- asserts ---');
  console.log(`ok: ${assertResult.ok}`);
  if (!assertResult.ok) {
    for (const e of assertResult.errors) console.log(`  - ${e}`);
  }

  if (!assertResult.ok) {
    console.error('ASSERT FAILED');
    process.exit(1);
  }
  if (collisions.length > 0) {
    console.error('COLLISION — stop (no overwrite)');
    process.exit(2);
  }

  if (!apply) {
    console.log('\nDry-run OK. Re-run with --apply to write.');
    process.exit(0);
  }

  console.log('\nAPPLY...');
  const written = await applyWrite(admin, plan);
  const rb = assertReadBack(plan, written);
  if (!rb.ok) {
    console.error('READ-BACK FAILED');
    for (const e of rb.errors) console.error(`  - ${e}`);
    process.exit(1);
  }

  const manifestPath = saveManifest(plan, written, projectId, fullName);
  console.log('APPLY OK — read-back passed');
  console.log(`manifest: ${manifestPath}`);
  for (const row of JSON.parse(fs.readFileSync(manifestPath, 'utf8')).created) {
    console.log(
      `  ${row.date} docId=${row.docId} in=${row.clockIn} out=${row.clockOut} min=${row.actualWorkMinutes}`
    );
  }
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
