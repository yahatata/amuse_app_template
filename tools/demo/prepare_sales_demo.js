'use strict';

/**
 * Sales-demo day prep orchestrator (amuse-app-template only).
 *
 * Runs (in order):
 *   1) Analytics seed (tools/demo/analytics)
 *   2) Staff LINE past attendance x3 (tools/demo/attendance)
 *   3) Demo users 02–16 check-in (tools/demo/checkin)
 *
 * Default: dry-run / preflight only (NO writes).
 * Apply: only after ALL prechecks pass + explicit --apply.
 *
 * Usage:
 *   node tools/demo/prepare_sales_demo.js --demo-date 2026-09-14
 *   node tools/demo/prepare_sales_demo.js --demo-date 2026-09-14 --apply
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname);
const REPO_ROOT = path.resolve(ROOT, '../..');
const OUT_DIR = path.join(ROOT, 'out');
const ADMIN_MODULE = path.resolve(
  REPO_ROOT,
  'functions/node_modules/firebase-admin'
);

const ALLOWED_PROJECT_ID = 'amuse-app-template';

const ANALYTICS_DIR = path.join(ROOT, 'analytics');
const ATTENDANCE_DIR = path.join(ROOT, 'attendance');
const CHECKIN_DIR = path.join(ROOT, 'checkin');

const ANALYTICS_WRITE = path.join(ANALYTICS_DIR, 'write_demo_analytics.js');
const ATTENDANCE_WRITE = path.join(
  ATTENDANCE_DIR,
  'write_staff_line_demo_attendance.js'
);
const CHECKIN_WRITE = path.join(CHECKIN_DIR, 'checkin_demo_users.js');

const ANALYTICS_KNOWN_SUBCOLLECTIONS = [
  'days',
  'byCategory',
  'aggregationMarkers',
  'byTemplateTournaments',
  'byUser',
];

function printHelp() {
  console.log(`Sales demo prep orchestrator

Usage:
  node tools/demo/prepare_sales_demo.js --demo-date YYYY-MM-DD
  node tools/demo/prepare_sales_demo.js --demo-date YYYY-MM-DD --apply

Default is dry-run (precheck all three systems, no writes).
--apply runs writes ONLY after ALL prechecks pass.

Hard guards:
  - projectId must be ${ALLOWED_PROJECT_ID}
  - FIRESTORE_EMULATOR_HOST must be unset
  - no overwrite / no unrelated deletes
`);
}

function parseArgs(argv) {
  const out = { demoDate: null, apply: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') out.help = true;
    else if (a === '--apply') out.apply = true;
    else if (a === '--demo-date') out.demoDate = argv[++i];
    else if (a === '--dry-run') {
      /* default; accepted explicitly */
    } else throw new Error(`Unknown argument: ${a}`);
  }
  return out;
}

function assertDemoDate(demoDate) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(demoDate)) {
    throw new Error(`Invalid --demo-date: ${demoDate}`);
  }
  const [y, m, d] = demoDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (
    dt.getUTCFullYear() !== y ||
    dt.getUTCMonth() !== m - 1 ||
    dt.getUTCDate() !== d
  ) {
    throw new Error(`Invalid calendar --demo-date: ${demoDate}`);
  }
  return {
    demoDate,
    targetMonth: `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}`,
  };
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
    throw new Error(
      `Project guard failed: app/env projectId="${appProject}" (allowed: ${ALLOWED_PROJECT_ID})`
    );
  }
  process.env.GCLOUD_PROJECT = ALLOWED_PROJECT_ID;
  process.env.GOOGLE_CLOUD_PROJECT = ALLOWED_PROJECT_ID;
  return { projectId: ALLOWED_PROJECT_ID };
}

function runChild(scriptPath, args, cwd) {
  const result = spawnSync(process.execPath, [scriptPath, ...args], {
    cwd,
    encoding: 'utf8',
    env: process.env,
    maxBuffer: 20 * 1024 * 1024,
  });
  return {
    code: result.status == null ? 1 : result.status,
    signal: result.signal || null,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    error: result.error ? String(result.error.message || result.error) : null,
  };
}

function extractManifestPath(text) {
  const m = String(text || '').match(/manifest:\s+(\S+)/);
  return m ? m[1] : null;
}

function extractPlannedPathsFile(text) {
  const m = String(text || '').match(
    /(?:planned paths saved|Rollback path list):\s+(\S+)/
  );
  return m ? m[1] : null;
}

/**
 * Read-only: analyticsMonthly/{YYYY-MM} must be fully empty
 * (no parent, no known/unknown subcollection docs).
 */
async function probeAnalyticsEmpty(db, targetMonth) {
  const issues = [];
  const monthlyRef = db.doc(`analyticsMonthly/${targetMonth}`);
  const parentSnap = await monthlyRef.get();
  if (parentSnap.exists) {
    issues.push(`parent analyticsMonthly/${targetMonth} exists`);
  }

  const found = {};
  let cols = [];
  try {
    cols = await monthlyRef.listCollections();
  } catch (e) {
    issues.push(`listCollections failed: ${e.message || e}`);
    return { ok: false, issues, found };
  }

  for (const col of cols) {
    const snap = await col.get();
    found[col.id] = snap.size;
    if (snap.size > 0) {
      issues.push(
        `subcollection analyticsMonthly/${targetMonth}/${col.id} has ${snap.size} doc(s)`
      );
    }
  }

  // Explicit known paths (even if listCollections is empty / partial)
  for (const name of ANALYTICS_KNOWN_SUBCOLLECTIONS) {
    if (found[name] != null) continue;
    const snap = await monthlyRef.collection(name).limit(1).get();
    if (!snap.empty) {
      found[name] = '>=1';
      issues.push(
        `subcollection analyticsMonthly/${targetMonth}/${name} has doc(s)`
      );
    } else {
      found[name] = 0;
    }
  }

  const unexpected = Object.keys(found).filter(
    (k) => !ANALYTICS_KNOWN_SUBCOLLECTIONS.includes(k) && found[k] !== 0
  );
  for (const k of unexpected) {
    issues.push(
      `unexpected subcollection analyticsMonthly/${targetMonth}/${k} non-empty`
    );
  }

  return { ok: issues.length === 0, issues, found, parentExists: parentSnap.exists };
}

async function precheckAnalyticsNormalize(demoDate, targetMonth) {
  // eslint-disable-next-line import/no-dynamic-require, global-require
  const { normalizeDemoAnalytics } = require(path.join(
    ANALYTICS_DIR,
    'lib/normalize.js'
  ));
  // eslint-disable-next-line import/no-dynamic-require, global-require
  const { assertNormalizedPayload } = require(path.join(
    ANALYTICS_DIR,
    'lib/assert.js'
  ));
  const sourcePath = path.join(ANALYTICS_DIR, 'source_2025-09.json');
  const source = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
  const payload = normalizeDemoAnalytics(source, {
    targetMonth,
    demoDay: demoDate,
  });
  const assertResult = assertNormalizedPayload(payload, {
    targetMonth,
    demoDay: demoDate,
  });
  return { payload, assertResult };
}

async function precheckAll(admin, demoDate, targetMonth) {
  const db = admin.firestore();
  const results = {
    analytics: { ok: false },
    attendance: { ok: false },
    checkin: { ok: false },
  };

  console.log('\n========== PRECHECK: Analytics ==========');
  const norm = await precheckAnalyticsNormalize(demoDate, targetMonth);
  const empty = await probeAnalyticsEmpty(db, targetMonth);
  console.log(
    `normalize asserts: ok=${norm.assertResult.ok} dayCount=${norm.payload.days.length}`
  );
  console.log(
    `empty probe: ok=${empty.ok} parentExists=${empty.parentExists} found=${JSON.stringify(empty.found)}`
  );
  if (!empty.ok) {
    for (const i of empty.issues) console.log(`  - ${i}`);
  }
  if (!norm.assertResult.ok) {
    for (const e of norm.assertResult.errors) console.log(`  - assert: ${e}`);
  }
  // Also run official writer dry-run for parity / planned paths
  const analyticsDry = runChild(
    ANALYTICS_WRITE,
    ['--target-month', targetMonth, '--demo-day', demoDate],
    ANALYTICS_DIR
  );
  console.log(`writer dry-run exit=${analyticsDry.code}`);
  results.analytics = {
    ok:
      norm.assertResult.ok &&
      empty.ok &&
      analyticsDry.code === 0 &&
      !analyticsDry.error,
    normalizeOk: norm.assertResult.ok,
    emptyOk: empty.ok,
    emptyIssues: empty.issues,
    emptyFound: empty.found,
    writerExit: analyticsDry.code,
    plannedPathsFile: extractPlannedPathsFile(
      `${analyticsDry.stdout}\n${analyticsDry.stderr}`
    ),
    dayCount: norm.payload.days.length,
    grossSales: norm.payload.monthly.grossSales,
    orderCount: norm.payload.monthly.orderCount,
  };
  console.log(`Analytics precheck: ${results.analytics.ok ? 'PASS' : 'FAIL'}`);

  console.log('\n========== PRECHECK: Attendance ==========');
  const attendanceDry = runChild(ATTENDANCE_WRITE, [], ATTENDANCE_DIR);
  process.stdout.write(attendanceDry.stdout || '');
  process.stderr.write(attendanceDry.stderr || '');
  results.attendance = {
    ok: attendanceDry.code === 0 && !attendanceDry.error,
    exit: attendanceDry.code,
    collisionLikely: attendanceDry.code === 2,
    error: attendanceDry.error,
  };
  console.log(
    `Attendance precheck: ${results.attendance.ok ? 'PASS' : 'FAIL'} (exit=${attendanceDry.code})`
  );

  console.log('\n========== PRECHECK: Check-in ==========');
  const checkinDry = runChild(CHECKIN_WRITE, [], CHECKIN_DIR);
  process.stdout.write(checkinDry.stdout || '');
  process.stderr.write(checkinDry.stderr || '');
  results.checkin = {
    ok: checkinDry.code === 0 && !checkinDry.error,
    exit: checkinDry.code,
    collisionLikely: checkinDry.code === 2,
    error: checkinDry.error,
  };
  console.log(
    `Check-in precheck: ${results.checkin.ok ? 'PASS' : 'FAIL'} (exit=${checkinDry.code})`
  );

  const allOk =
    results.analytics.ok && results.attendance.ok && results.checkin.ok;
  return { allOk, results };
}

async function readBackAfterApply(admin, demoDate, targetMonth, applyInfo) {
  const db = admin.firestore();
  const rb = {
    analytics: { ok: false },
    attendance: { ok: false },
    checkin: { ok: false },
  };

  // Analytics
  const monthlyRef = db.doc(`analyticsMonthly/${targetMonth}`);
  const monthlySnap = await monthlyRef.get();
  const daysSnap = await monthlyRef.collection('days').get();
  const catSnap = await monthlyRef.collection('byCategory').doc('summary').get();
  const m = monthlySnap.exists ? monthlySnap.data() || {} : {};
  rb.analytics = {
    ok:
      monthlySnap.exists &&
      catSnap.exists &&
      daysSnap.size > 0 &&
      m.grossSales === 4520000 &&
      m.orderCount === 1250,
    parent: monthlySnap.exists,
    days: daysSnap.size,
    byCategory: catSnap.exists,
    grossSales: m.grossSales,
    orderCount: m.orderCount,
  };

  // Attendance via child manifest if present
  let attManifest = null;
  if (applyInfo.attendanceManifest && fs.existsSync(applyInfo.attendanceManifest)) {
    attManifest = JSON.parse(
      fs.readFileSync(applyInfo.attendanceManifest, 'utf8')
    );
  }
  if (attManifest && Array.isArray(attManifest.created)) {
    let okCount = 0;
    for (const row of attManifest.created) {
      const snap = await db.collection('attendances').doc(row.docId).get();
      const d = snap.exists ? snap.data() || {} : null;
      if (
        d &&
        d.staffId === row.staffId &&
        d.date === row.date &&
        d.actualWorkMinutes === row.actualWorkMinutes
      ) {
        okCount += 1;
      }
    }
    rb.attendance = {
      ok: okCount === 3 && attManifest.created.length === 3,
      okCount,
      expected: 3,
      manifest: applyInfo.attendanceManifest,
    };
  } else {
    rb.attendance = {
      ok: false,
      reason: 'attendance manifest missing',
      manifest: applyInfo.attendanceManifest || null,
    };
  }

  // Check-in via child manifest
  let cinManifest = null;
  if (applyInfo.checkinManifest && fs.existsSync(applyInfo.checkinManifest)) {
    cinManifest = JSON.parse(fs.readFileSync(applyInfo.checkinManifest, 'utf8'));
  }
  if (cinManifest && Array.isArray(cinManifest.created)) {
    let stayOk = 0;
    let billOk = 0;
    for (const row of cinManifest.created) {
      if (!row.uid || row.error) continue;
      const staySnap = await db.collection('activeStays').doc(row.uid).get();
      const stay = staySnap.exists ? staySnap.data() || {} : null;
      if (stay && stay.isActive === true) stayOk += 1;
      if (row.billId) {
        const billSnap = await db.collection('bills').doc(row.billId).get();
        if (billSnap.exists && billSnap.data()?.status === 'open') billOk += 1;
      }
    }
    rb.checkin = {
      ok: stayOk === 15 && billOk === 15,
      activeStayOk: stayOk,
      openBillOk: billOk,
      expected: 15,
      businessDate: cinManifest.businessDate || null,
      manifest: applyInfo.checkinManifest,
    };
  } else {
    rb.checkin = {
      ok: false,
      reason: 'checkin manifest missing',
      manifest: applyInfo.checkinManifest || null,
    };
  }

  rb.allOk = rb.analytics.ok && rb.attendance.ok && rb.checkin.ok;
  return rb;
}

function saveMasterManifest(manifest) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = path.join(OUT_DIR, `sales_demo_prepare_${stamp}.json`);
  fs.writeFileSync(file, JSON.stringify(manifest, null, 2) + '\n');
  return file;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    process.exit(0);
  }
  if (!args.demoDate) {
    printHelp();
    throw new Error('--demo-date YYYY-MM-DD is required');
  }

  const { demoDate, targetMonth } = assertDemoDate(args.demoDate);
  const mode = args.apply ? 'APPLY' : 'DRY-RUN';

  console.log('\n=== prepare_sales_demo ===');
  console.log(`mode: ${mode}`);
  console.log(`demoDate: ${demoDate}`);
  console.log(`targetMonth: ${targetMonth}`);
  console.log(`projectId (required): ${ALLOWED_PROJECT_ID}`);

  const admin = resolveAdmin();
  const { projectId } = initAdmin(admin);

  const executedAt = new Date().toISOString();
  const master = {
    projectId,
    demoDate,
    targetMonth,
    executedAt,
    mode,
    status: 'running',
    precheck: null,
    apply: null,
    readBack: null,
    analytics: null,
    attendance: null,
    checkin: null,
    businessDate: null,
  };

  const { allOk, results } = await precheckAll(admin, demoDate, targetMonth);
  master.precheck = {
    allOk,
    analytics: results.analytics,
    attendance: results.attendance,
    checkin: results.checkin,
  };

  if (!allOk) {
    master.status = 'precheck_failed';
    const manifestPath = saveMasterManifest(master);
    console.log('\n========================================');
    console.log('NO CHANGES MADE');
    console.log('Reason: one or more prechecks FAILED (expected if demo data already exists).');
    console.log(`master manifest: ${manifestPath}`);
    console.log('========================================\n');
    process.exit(2);
  }

  console.log('\n========================================');
  console.log('ALL PRECHECKS PASSED');
  console.log('========================================');

  if (!args.apply) {
    master.status = 'dry_run_ok';
    const manifestPath = saveMasterManifest(master);
    console.log('\nDry-run complete. No Firestore writes performed.');
    console.log(`master manifest: ${manifestPath}`);
    console.log(
      `\nSales-day command:\n  node tools/demo/prepare_sales_demo.js --demo-date ${demoDate} --apply\n`
    );
    process.exit(0);
  }

  // ----- APPLY (only after all prechecks passed) -----
  master.apply = {
    analytics: { ok: false },
    attendance: { ok: false },
    checkin: { ok: false },
    stoppedAt: null,
  };

  console.log('\n========== APPLY: Analytics ==========');
  const analyticsApply = runChild(
    ANALYTICS_WRITE,
    ['--target-month', targetMonth, '--demo-day', demoDate, '--apply'],
    ANALYTICS_DIR
  );
  console.log(analyticsApply.stdout);
  if (analyticsApply.stderr) console.error(analyticsApply.stderr);
  master.apply.analytics = {
    ok: analyticsApply.code === 0,
    exit: analyticsApply.code,
    plannedPathsFile: extractPlannedPathsFile(
      `${analyticsApply.stdout}\n${analyticsApply.stderr}`
    ),
  };
  master.analytics = {
    targetMonth,
    plannedPathsFile: master.apply.analytics.plannedPathsFile,
  };
  if (!master.apply.analytics.ok) {
    master.apply.stoppedAt = 'analytics';
    master.status = 'apply_failed_partial';
    const manifestPath = saveMasterManifest(master);
    console.error('\nAPPLY STOPPED at analytics. No automatic cleanup.');
    console.error(`master manifest: ${manifestPath}`);
    process.exit(1);
  }

  console.log('\n========== APPLY: Attendance ==========');
  const attendanceApply = runChild(ATTENDANCE_WRITE, ['--apply'], ATTENDANCE_DIR);
  console.log(attendanceApply.stdout);
  if (attendanceApply.stderr) console.error(attendanceApply.stderr);
  const attendanceManifest = extractManifestPath(
    `${attendanceApply.stdout}\n${attendanceApply.stderr}`
  );
  master.apply.attendance = {
    ok: attendanceApply.code === 0,
    exit: attendanceApply.code,
    manifest: attendanceManifest,
  };
  master.attendance = { manifest: attendanceManifest };
  if (!master.apply.attendance.ok) {
    master.apply.stoppedAt = 'attendance';
    master.status = 'apply_failed_partial';
    const manifestPath = saveMasterManifest(master);
    console.error(
      '\nAPPLY STOPPED at attendance (analytics may already be written). No automatic cleanup.'
    );
    console.error(`master manifest: ${manifestPath}`);
    process.exit(1);
  }

  console.log('\n========== APPLY: Check-in ==========');
  const checkinApply = runChild(CHECKIN_WRITE, ['--apply'], CHECKIN_DIR);
  console.log(checkinApply.stdout);
  if (checkinApply.stderr) console.error(checkinApply.stderr);
  const checkinManifest = extractManifestPath(
    `${checkinApply.stdout}\n${checkinApply.stderr}`
  );
  master.apply.checkin = {
    ok: checkinApply.code === 0,
    exit: checkinApply.code,
    manifest: checkinManifest,
  };
  master.checkin = { manifest: checkinManifest };
  if (checkinManifest && fs.existsSync(checkinManifest)) {
    try {
      const cm = JSON.parse(fs.readFileSync(checkinManifest, 'utf8'));
      master.businessDate = cm.businessDate || null;
    } catch (_) {
      /* ignore */
    }
  }
  if (!master.apply.checkin.ok) {
    master.apply.stoppedAt = 'checkin';
    master.status = 'apply_failed_partial';
    const manifestPath = saveMasterManifest(master);
    console.error(
      '\nAPPLY STOPPED at check-in (analytics/attendance may already be written). No automatic cleanup.'
    );
    console.error(`master manifest: ${manifestPath}`);
    process.exit(1);
  }

  console.log('\n========== READ-BACK ==========');
  const readBack = await readBackAfterApply(admin, demoDate, targetMonth, {
    attendanceManifest,
    checkinManifest,
  });
  master.readBack = readBack;

  if (!readBack.allOk) {
    master.status = 'readback_failed';
    const manifestPath = saveMasterManifest(master);
    console.error('READ-BACK FAILED');
    console.error(JSON.stringify(readBack, null, 2));
    console.error(`master manifest: ${manifestPath}`);
    process.exit(1);
  }

  master.status = 'pass';
  const manifestPath = saveMasterManifest(master);
  console.log('\n========================================');
  console.log('SALES DEMO PREP: PASS');
  console.log(`master manifest: ${manifestPath}`);
  console.log('========================================\n');
}

main().catch((e) => {
  console.error(e && e.stack ? e.stack : e);
  process.exit(1);
});
