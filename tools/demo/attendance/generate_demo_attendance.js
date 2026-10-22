'use strict';

/**
 * Offline plan generator for demo past attendances (no Firestore).
 *
 * Usage:
 *   node generate_demo_attendance.js --demo-day 2026-09-20 --staff-file staffs.example.json
 *   node generate_demo_attendance.js --demo-day 2026-09-20 --staff-ids a,b,c
 */

const fs = require('fs');
const path = require('path');

const {
  parseArgs,
  resolveStaffIds,
  EXPECTED_STAFF_COUNT,
} = require('./lib/helpers');
const { buildDemoAttendancePlan } = require('./lib/plan');
const { assertAttendancePlan } = require('./lib/assert');

const ROOT = path.resolve(__dirname);

function printHelp() {
  console.log(`Demo past-attendance plan generator (offline, no DB)

Usage:
  node generate_demo_attendance.js --demo-day YYYY-MM-DD (--staff-file path | --staff-ids id1,id2,id3) [--out path]

Writes a planned JSON under out/ (or --out).
Does NOT write Firestore.
`);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    process.exit(0);
  }
  if (!args.demoDay) {
    printHelp();
    throw new Error('--demo-day is required');
  }

  const resolved = resolveStaffIds(args, fs);
  if (resolved.staffIds.length !== EXPECTED_STAFF_COUNT) {
    throw new Error(
      `Expected ${EXPECTED_STAFF_COUNT} staff IDs, got ${resolved.staffIds.length}`
    );
  }

  const staffNames =
    resolved.displayNames &&
    resolved.displayNames.length === EXPECTED_STAFF_COUNT
      ? resolved.displayNames
      : resolved.staffIds.map((id, i) => `DemoStaff-${String.fromCharCode(65 + i)}`);

  const plan = buildDemoAttendancePlan({
    demoDay: args.demoDay,
    staffIds: resolved.staffIds,
    staffNames,
  });
  const assertResult = assertAttendancePlan(plan, { demoDay: args.demoDay });

  console.log('\n========== generate_demo_attendance ==========');
  console.log(`demoDay:     ${plan.meta.demoDay}`);
  console.log(`staff source:${resolved.source}`);
  console.log(`pattern:     ${plan.meta.pattern}`);
  console.log(`recordCount: ${plan.meta.recordCount}`);
  console.log('--- staff ---');
  plan.meta.staffIds.forEach((id, i) => {
    console.log(`  [${String.fromCharCode(65 + i)}] ${id}  name=${plan.meta.staffNames[i]}`);
  });
  console.log('--- records ---');
  for (const r of plan.records) {
    console.log(
      `  ${r.date}  ${r.staffLabel}:${r.staffId}  ${r.clockInIso} → ${r.clockOutIso}  actual=${r.actualWorkMinutes}m night=${r.nightWorkMinutes}m`
    );
  }
  console.log('--- asserts ---');
  console.log(`ok: ${assertResult.ok}`);
  if (!assertResult.ok) {
    for (const e of assertResult.errors) console.log(`  - ${e}`);
  }
  console.log('==============================================\n');

  const outDir = path.join(ROOT, 'out');
  fs.mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outPath = path.resolve(
    args.out || path.join(outDir, `planned_${args.demoDay}_${stamp}.json`)
  );
  fs.writeFileSync(outPath, JSON.stringify(plan, null, 2) + '\n');
  console.log(`plan saved: ${outPath}`);

  if (!assertResult.ok) {
    process.exit(1);
  }
}

main();
