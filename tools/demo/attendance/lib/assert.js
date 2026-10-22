'use strict';

/**
 * Assertions for demo attendance plan.
 */

const {
  EXPECTED_STAFF_COUNT,
  EXPECTED_ATTENDANCE_COUNT,
  DEFAULT_NIGHT_WORK_START_HOUR,
  assertDate,
} = require('./helpers');

function fail(errors, msg) {
  errors.push(msg);
}

/**
 * @param {object} plan - buildDemoAttendancePlan result
 * @param {{ demoDay: string }} opts
 */
function assertAttendancePlan(plan, opts) {
  const errors = [];
  const demoDay = assertDate(opts.demoDay);
  const records = plan.records || [];

  if (records.length !== EXPECTED_ATTENDANCE_COUNT) {
    fail(
      errors,
      `record count ${records.length} != expected ${EXPECTED_ATTENDANCE_COUNT}`
    );
  }

  if ((plan.meta?.staffIds || []).length !== EXPECTED_STAFF_COUNT) {
    fail(errors, `staff count != ${EXPECTED_STAFF_COUNT}`);
  }

  const pairKeys = new Set();
  for (const r of records) {
    if (!r.staffId || typeof r.staffId !== 'string') {
      fail(errors, 'missing staffId');
    }
    if (!r.staffsFullName || typeof r.staffsFullName !== 'string') {
      fail(errors, `missing staffsFullName for ${r.staffId}`);
    }
    if (!r.date || r.date >= demoDay) {
      fail(
        errors,
        `date must be strictly before demoDay: ${r.date} (demoDay=${demoDay})`
      );
    }
    assertDate(r.date);

    if (!(r.clockOutMs > r.clockInMs)) {
      fail(errors, `clockOut <= clockIn for ${r.staffId} ${r.date}`);
    }

    const pair = `${r.staffId}__${r.date}`;
    if (pairKeys.has(pair)) {
      fail(errors, `duplicate staffId+date: ${pair}`);
    }
    pairKeys.add(pair);

    if (r.closedStoreWithoutClockOut !== false) {
      fail(errors, `closedStoreWithoutClockOut must be false (${pair})`);
    }
    if (r.isManual !== true) fail(errors, `isManual must be true (${pair})`);
    if (r.isDeleted !== false) fail(errors, `isDeleted must be false (${pair})`);
    if (r.isOnBreak !== false) fail(errors, `isOnBreak must be false (${pair})`);
    if (r.currentBreakStartedAt !== null) {
      fail(errors, `currentBreakStartedAt must be null (${pair})`);
    }
    if (r.breakCount !== 0 || r.breakMinutes !== 0) {
      fail(errors, `breaks must be zero (${pair})`);
    }
    if (r.payrollStatus !== 'unreflected') {
      fail(errors, `payrollStatus must be unreflected (${pair})`);
    }

    // Time range: clock-in 16:00–20:00 JST, clock-out before night start
    const jstOffset = 9 * 60 * 60 * 1000;
    const inHour = new Date(r.clockInMs + jstOffset).getUTCHours();
    const outHour = new Date(r.clockOutMs + jstOffset).getUTCHours();
    const outMin = new Date(r.clockOutMs + jstOffset).getUTCMinutes();
    if (inHour < 16 || inHour > 20) {
      fail(errors, `clockIn JST hour out of demo range: ${inHour} (${pair})`);
    }
    if (
      outHour > DEFAULT_NIGHT_WORK_START_HOUR ||
      (outHour === DEFAULT_NIGHT_WORK_START_HOUR && outMin > 0)
    ) {
      fail(
        errors,
        `clockOut enters night band (>= ${DEFAULT_NIGHT_WORK_START_HOUR}:00 JST) (${pair})`
      );
    }
    // Also reject outHour >= 22 via the above; ensure night minutes stay 0
    if (r.nightWorkMinutes !== 0) {
      fail(
        errors,
        `nightWorkMinutes expected 0 for pre-night shift, got ${r.nightWorkMinutes} (${pair})`
      );
    }

    const expectedTotal = Math.floor((r.clockOutMs - r.clockInMs) / 60000);
    if (r.totalMinutes !== expectedTotal) {
      fail(
        errors,
        `totalMinutes ${r.totalMinutes} != ${expectedTotal} (${pair})`
      );
    }
    if (r.actualWorkMinutes !== expectedTotal) {
      fail(
        errors,
        `actualWorkMinutes ${r.actualWorkMinutes} != ${expectedTotal} (${pair})`
      );
    }

    for (const f of [
      'clockInIso',
      'clockOutIso',
      'lastActionType',
      'totalMinutes',
      'actualWorkMinutes',
      'nightWorkMinutes',
    ]) {
      if (r[f] === undefined || r[f] === null) {
        fail(errors, `missing field ${f} (${pair})`);
      }
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    checks: {
      recordCount: records.length,
      staffCount: plan.meta?.staffIds?.length ?? 0,
      pairCount: pairKeys.size,
      demoDay,
    },
  };
}

/**
 * Read-back check after apply.
 * @param {object} plan
 * @param {Array<{ id: string, data: object }>} written
 */
function assertReadBack(plan, written) {
  const errors = [];
  if (written.length !== plan.records.length) {
    fail(
      errors,
      `read-back count ${written.length} != planned ${plan.records.length}`
    );
  }

  const byPair = new Map();
  for (const w of written) {
    const d = w.data || {};
    byPair.set(`${d.staffId}__${d.date}`, w);
  }

  for (const r of plan.records) {
    const key = `${r.staffId}__${r.date}`;
    const w = byPair.get(key);
    if (!w) {
      fail(errors, `read-back missing ${key}`);
      continue;
    }
    const d = w.data;
    if (d.isDeleted === true) fail(errors, `read-back isDeleted ${key}`);
    if (d.closedStoreWithoutClockOut === true) {
      fail(errors, `read-back closedStoreWithoutClockOut ${key}`);
    }
    if (d.isManual !== true) fail(errors, `read-back isManual ${key}`);
    if (Number(d.actualWorkMinutes) !== Number(r.actualWorkMinutes)) {
      fail(errors, `read-back actualWorkMinutes mismatch ${key}`);
    }
    if (d.staffsFullName !== r.staffsFullName) {
      fail(errors, `read-back staffsFullName mismatch ${key}`);
    }
  }

  return { ok: errors.length === 0, errors };
}

module.exports = {
  assertAttendancePlan,
  assertReadBack,
};
