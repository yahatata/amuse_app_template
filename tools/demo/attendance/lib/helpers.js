'use strict';

/**
 * Demo past-attendance tools — shared constants & helpers
 * Align with tools/demo/analytics/lib/helpers.js
 */

const ALLOWED_PROJECT_ID = 'amuse-app-template';

/** Default night band (same as functions defaults) */
const DEFAULT_NIGHT_WORK_START_HOUR = 22;
const DEFAULT_NIGHT_WORK_END_HOUR = 5;

const EXPECTED_STAFF_COUNT = 3;
const EXPECTED_ATTENDANCE_COUNT = 8;

/** Pattern offsets from demo-day (days before). Must all be > 0. */
const PATTERN_DAYS = [
  { offset: 4, staffIndexes: [0, 1, 2] },
  { offset: 2, staffIndexes: [0, 2] },
  { offset: 1, staffIndexes: [0, 1, 2] },
];

/**
 * JST wall-clock times per staff index (A/B/C).
 * End before night band (22:00).
 */
const STAFF_SCHEDULES = [
  { clockIn: { hour: 17, minute: 0 }, clockOut: { hour: 21, minute: 30 } },
  { clockIn: { hour: 17, minute: 15 }, clockOut: { hour: 21, minute: 45 } },
  { clockIn: { hour: 17, minute: 30 }, clockOut: { hour: 21, minute: 50 } },
];

function parseArgs(argv) {
  const out = {
    demoDay: null,
    staffFile: null,
    staffIds: null,
    apply: false,
    manifest: null,
    offline: false,
    out: null,
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') out.help = true;
    else if (a === '--apply') out.apply = true;
    else if (a === '--offline') out.offline = true;
    else if (a === '--demo-day') out.demoDay = argv[++i];
    else if (a === '--staff-file') out.staffFile = argv[++i];
    else if (a === '--staff-ids') out.staffIds = argv[++i];
    else if (a === '--manifest') out.manifest = argv[++i];
    else if (a === '--out') out.out = argv[++i];
    else throw new Error(`Unknown argument: ${a}`);
  }
  return out;
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function assertDate(date) {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error(`Invalid date: ${date} (expected YYYY-MM-DD)`);
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
  return date;
}

/** Subtract n calendar days from YYYY-MM-DD using UTC (TZ-independent). */
function subtractDays(dateKey, days) {
  assertDate(dateKey);
  const [y, m, d] = dateKey.split('-').map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d));
  utc.setUTCDate(utc.getUTCDate() - days);
  return `${utc.getUTCFullYear()}-${pad2(utc.getUTCMonth() + 1)}-${pad2(
    utc.getUTCDate()
  )}`;
}

/**
 * JST wall-clock on dateKey → UTC Date.
 * Same contract as Flutter attendanceWallClockToUtcIso (wall clock → UTC ISO).
 */
function jstWallClockToUtcDate(dateKey, hour, minute) {
  assertDate(dateKey);
  if (
    !Number.isInteger(hour) ||
    hour < 0 ||
    hour > 23 ||
    !Number.isInteger(minute) ||
    minute < 0 ||
    minute > 59
  ) {
    throw new Error(`Invalid JST time: ${hour}:${minute}`);
  }
  const [y, m, d] = dateKey.split('-').map(Number);
  // JST = UTC+9 → UTC = local - 9h
  return new Date(Date.UTC(y, m - 1, d, hour - 9, minute, 0, 0));
}

function formatIso(d) {
  return d.toISOString();
}

/**
 * Port of functions nightWorkMinutes.calculateNightWorkMinutes
 * (minute-loop in JST hours).
 */
function calculateNightWorkMinutesMs(
  clockInMs,
  clockOutMs,
  nightWorkStartHour = DEFAULT_NIGHT_WORK_START_HOUR,
  nightWorkEndHour = DEFAULT_NIGHT_WORK_END_HOUR
) {
  const jstOffset = 9 * 60 * 60 * 1000;
  let nightMinutes = 0;
  let currentMs = clockInMs;
  while (currentMs < clockOutMs) {
    const hour = new Date(currentMs + jstOffset).getUTCHours();
    if (hour >= nightWorkStartHour || hour < nightWorkEndHour) {
      nightMinutes += 1;
    }
    currentMs += 60 * 1000;
  }
  return nightMinutes;
}

/**
 * Minutes fields after recalculateAttendanceFromBreaks with no breaks:
 * totalMinutes = floor((out-in)/60000)
 * actualWorkMinutes = totalMinutes - breakMinutes (0)
 * nightWorkMinutes = calculateNightWorkMinutes(...)
 */
function computeMinutes(clockInDate, clockOutDate) {
  const totalMinutes = Math.floor(
    (clockOutDate.getTime() - clockInDate.getTime()) / (1000 * 60)
  );
  const breakMinutes = 0;
  const actualWorkMinutes = Math.max(0, totalMinutes - breakMinutes);
  const nightWorkMinutes = calculateNightWorkMinutesMs(
    clockInDate.getTime(),
    clockOutDate.getTime()
  );
  return {
    totalMinutes,
    breakMinutes,
    actualWorkMinutes,
    nightWorkMinutes,
    nightMinutes: nightWorkMinutes,
  };
}

function normalizeStaffStatus(data) {
  if (data && data.status === 'retired') return 'retired';
  return 'active';
}

function loadStaffIdsFromFile(filePath, fs) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const json = JSON.parse(raw);
  let ids = json.staffIds || json.staff_ids || null;
  if (!ids && Array.isArray(json)) ids = json;
  if (!Array.isArray(ids) || ids.length === 0) {
    throw new Error(
      `staff file must contain staffIds: string[] — ${filePath}`
    );
  }
  const staffIds = ids.map((id) => {
    if (typeof id !== 'string' || !id.trim()) {
      throw new Error(`Invalid staffId in ${filePath}: ${id}`);
    }
    return id.trim();
  });
  const displayNames = Array.isArray(json.displayNames)
    ? json.displayNames.map((n) => String(n))
    : null;
  return { staffIds, displayNames };
}

function resolveStaffIds(args, fs) {
  if (args.staffIds && args.staffFile) {
    throw new Error('Use either --staff-ids or --staff-file, not both');
  }
  if (args.staffIds) {
    const staffIds = args.staffIds
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    return { staffIds, displayNames: null, source: 'cli' };
  }
  if (args.staffFile) {
    const loaded = loadStaffIdsFromFile(args.staffFile, fs);
    return { ...loaded, source: args.staffFile };
  }
  throw new Error('--staff-file or --staff-ids is required');
}

module.exports = {
  ALLOWED_PROJECT_ID,
  DEFAULT_NIGHT_WORK_START_HOUR,
  DEFAULT_NIGHT_WORK_END_HOUR,
  EXPECTED_STAFF_COUNT,
  EXPECTED_ATTENDANCE_COUNT,
  PATTERN_DAYS,
  STAFF_SCHEDULES,
  parseArgs,
  pad2,
  assertDate,
  subtractDays,
  jstWallClockToUtcDate,
  formatIso,
  calculateNightWorkMinutesMs,
  computeMinutes,
  normalizeStaffStatus,
  loadStaffIdsFromFile,
  resolveStaffIds,
};
