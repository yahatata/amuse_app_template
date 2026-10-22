'use strict';

/**
 * Build planned demo attendances (no DB).
 * Pattern: D-4 A/B/C, D-2 A/C, D-1 A/B/C → 8 rows.
 */

const {
  EXPECTED_STAFF_COUNT,
  EXPECTED_ATTENDANCE_COUNT,
  PATTERN_DAYS,
  STAFF_SCHEDULES,
  assertDate,
  subtractDays,
  jstWallClockToUtcDate,
  formatIso,
  computeMinutes,
} = require('./helpers');

/**
 * @param {{
 *   demoDay: string,
 *   staffIds: string[],
 *   staffNames: string[],
 * }} opts
 */
function buildDemoAttendancePlan(opts) {
  const demoDay = assertDate(opts.demoDay);
  const { staffIds, staffNames } = opts;

  if (!Array.isArray(staffIds) || staffIds.length !== EXPECTED_STAFF_COUNT) {
    throw new Error(
      `Expected exactly ${EXPECTED_STAFF_COUNT} staffIds, got ${staffIds?.length}`
    );
  }
  if (!Array.isArray(staffNames) || staffNames.length !== EXPECTED_STAFF_COUNT) {
    throw new Error(
      `Expected exactly ${EXPECTED_STAFF_COUNT} staffNames, got ${staffNames?.length}`
    );
  }
  for (const id of staffIds) {
    if (typeof id !== 'string' || !id.trim()) {
      throw new Error(`Invalid staffId: ${id}`);
    }
  }

  const unique = new Set(staffIds);
  if (unique.size !== staffIds.length) {
    throw new Error('Duplicate staffIds are not allowed');
  }

  const records = [];
  for (const daySpec of PATTERN_DAYS) {
    if (daySpec.offset <= 0) {
      throw new Error(`Pattern offset must be > 0 (got ${daySpec.offset})`);
    }
    const date = subtractDays(demoDay, daySpec.offset);
    if (date >= demoDay) {
      throw new Error(`Internal date guard failed: ${date} >= demoDay ${demoDay}`);
    }
    for (const idx of daySpec.staffIndexes) {
      const schedule = STAFF_SCHEDULES[idx];
      const staffId = staffIds[idx];
      const staffsFullName = staffNames[idx];
      const clockInDate = jstWallClockToUtcDate(
        date,
        schedule.clockIn.hour,
        schedule.clockIn.minute
      );
      const clockOutDate = jstWallClockToUtcDate(
        date,
        schedule.clockOut.hour,
        schedule.clockOut.minute
      );
      if (clockOutDate.getTime() <= clockInDate.getTime()) {
        throw new Error(`clockOut <= clockIn for ${staffId} on ${date}`);
      }
      const minutes = computeMinutes(clockInDate, clockOutDate);

      records.push({
        staffId,
        staffsFullName,
        staffIndex: idx,
        staffLabel: String.fromCharCode(65 + idx),
        date,
        offsetFromDemoDay: daySpec.offset,
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
      });
    }
  }

  if (records.length !== EXPECTED_ATTENDANCE_COUNT) {
    throw new Error(
      `Expected ${EXPECTED_ATTENDANCE_COUNT} records, got ${records.length}`
    );
  }

  return {
    meta: {
      demoDay,
      staffIds: staffIds.slice(),
      staffNames: staffNames.slice(),
      recordCount: records.length,
      pattern: 'D-4:A/B/C; D-2:A/C; D-1:A/B/C',
      breaks: 'none',
      attendanceLogs: 'not written',
      attributionFields: 'left to attendanceOnWrite on apply',
    },
    records,
  };
}

/**
 * Firestore document body for create (Timestamps / serverTimestamp injected by writer).
 * Mirrors createAttendance initial fields + post-recalculate minutes (no breaks).
 */
function attendanceDocFieldsFromRecord(record, Timestamp, FieldValue) {
  return {
    staffId: record.staffId,
    staffsFullName: record.staffsFullName,
    date: record.date,
    clockIn: Timestamp.fromMillis(record.clockInMs),
    clockOut: Timestamp.fromMillis(record.clockOutMs),
    closedStoreWithoutClockOut: false,
    isManual: true,
    nightMinutes: record.nightMinutes,
    totalMinutes: record.totalMinutes,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    breakMinutes: 0,
    actualWorkMinutes: record.actualWorkMinutes,
    nightWorkMinutes: record.nightWorkMinutes,
    isOnBreak: false,
    currentBreakStartedAt: null,
    breakCount: 0,
    lastActionType: 'create_attendance',
    lastActionAt: FieldValue.serverTimestamp(),
    lastActionByDeviceId: 'tools/demo/attendance',
    manualReason: null,
    payrollReflectedAt: null,
    payrollStatus: 'unreflected',
    reflectedPayrollRunId: null,
    reflectedAt: null,
    isDeleted: false,
    deletedAt: null,
    deletedBy: null,
  };
}

module.exports = {
  buildDemoAttendancePlan,
  attendanceDocFieldsFromRecord,
};
