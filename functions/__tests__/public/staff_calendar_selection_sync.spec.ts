/**
 * F6 / SHF-02: LINE staff カレンダー pending 日 selection DOM 同期
 */
// @ts-nocheck

const fs = require('fs');
const path = require('path');

const STAFF_HTML = fs.readFileSync(
  path.join(__dirname, '../../../public/staff/index.html'),
  'utf8',
);

describe('staff calendar selection sync (F6 SHF-02)', () => {
  it('defines syncCalendarDaySelectionStyles as selection SSoT sync', () => {
    expect(STAFF_HTML).toMatch(/function syncCalendarDaySelectionStyles\s*\(/);
    expect(STAFF_HTML).toMatch(/selectedDates\.includes\(dateStr\)/);
  });

  it('selectDate updates state then syncs all cells (no current-day exclusion)', () => {
    expect(STAFF_HTML).toMatch(/syncCalendarDaySelectionStyles\(\)/);
    expect(STAFF_HTML).not.toMatch(/dayDate && dayDate !== dateStr/);
  });

  it('selectDate does not style stale targetElement directly', () => {
    const selectDateBlock = STAFF_HTML.match(
      /async function selectDate\([\s\S]*?\n      \}/,
    );
    expect(selectDateBlock).not.toBeNull();
    expect(selectDateBlock[0]).not.toMatch(/targetElement\.style\.backgroundColor/);
    expect(selectDateBlock[0]).not.toMatch(/targetElement\.classList/);
  });

  it('applyPendingShiftMarks delegates checkmark color to sync', () => {
    const fnBlock = STAFF_HTML.match(
      /function applyPendingShiftMarks\([\s\S]*?\n      \}/,
    );
    expect(fnBlock).not.toBeNull();
    expect(fnBlock[0]).toContain('applyShiftCalendarMarks');
    expect(STAFF_HTML).toMatch(
      /function applyShiftCalendarMarks\([\s\S]*syncCalendarDaySelectionStyles\(\)/,
    );
    expect(fnBlock[0]).not.toMatch(/classList\.contains\('selected'\)/);
  });

  it('renderCalendar syncs selection after innerHTML rebuild', () => {
    expect(STAFF_HTML).toMatch(
      /calendar\.innerHTML = calendarHTML;\s*\n\s*syncCalendarDaySelectionStyles\(\)/,
    );
  });

  it('openShiftManagement does not double-call initializeCalendar', () => {
    const openBlock = STAFF_HTML.match(
      /window\.openShiftManagement = \(\) => \{[\s\S]*?\n      \};/,
    );
    expect(openBlock).not.toBeNull();
    expect(openBlock[0]).not.toContain('initializeCalendar()');
    expect(STAFF_HTML).toMatch(/async function showShiftApplication\([\s\S]*initializeCalendar\(\)/);
  });

  it('K6 legacy refs remain absent', () => {
    expect(STAFF_HTML).not.toContain('submitAllShifts');
    expect(STAFF_HTML).not.toContain('submit-all-shifts-btn');
    expect(STAFF_HTML).not.toContain('pending-shifts-container');
  });

  it('formal shift submit path remains', () => {
    expect(STAFF_HTML).toMatch(/async function submitShifts\s*\(/);
    expect(STAFF_HTML).toContain("'submitShiftRequests'");
  });
});
