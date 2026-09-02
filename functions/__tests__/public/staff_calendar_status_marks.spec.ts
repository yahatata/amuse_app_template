/**
 * F6 / SHF-02: LINE staff カレンダー pending(緑) / confirmed(青) マーク
 */
// @ts-nocheck

const fs = require('fs');
const path = require('path');

const STAFF_HTML = fs.readFileSync(
  path.join(__dirname, '../../../public/staff/index.html'),
  'utf8',
);

describe('staff calendar status marks (F6 SHF-02)', () => {
  it('legend explains green pending and blue confirmed checkmarks', () => {
    expect(STAFF_HTML).toMatch(/shift-calendar-legend/);
    expect(STAFF_HTML).toMatch(/緑の✓/);
    expect(STAFF_HTML).toMatch(/申請済み・修正可能/);
    expect(STAFF_HTML).toMatch(/青の✓/);
    expect(STAFF_HTML).toMatch(/確定済み・修正不可/);
    expect(STAFF_HTML).toMatch(/#4caf50/);
    expect(STAFF_HTML).toMatch(/#2196F3/);
  });

  it('fetches pending and confirmed dates without Functions schema change', () => {
    expect(STAFF_HTML).toMatch(/function fetchShiftCalendarMarkDatesForMonth\s*\(/);
    expect(STAFF_HTML).toMatch(/status",\s*"==",\s*"pending"/);
    expect(STAFF_HTML).toMatch(/\["interim_confirmed",\s*"final_confirmed"\]/);
    expect(STAFF_HTML).toMatch(/confirmed === true/);
  });

  it('pending days get pending-checkmark (green)', () => {
    expect(STAFF_HTML).toMatch(/class="pending-checkmark"/);
    expect(STAFF_HTML).toMatch(/className = 'pending-checkmark'/);
  });

  it('interim/final confirmed days get confirmed-checkmark (blue)', () => {
    expect(STAFF_HTML).toMatch(/class="confirmed-checkmark"/);
    expect(STAFF_HTML).toMatch(/className = 'confirmed-checkmark'/);
    expect(STAFF_HTML).toMatch(/color: #2196F3/);
  });

  it('confirmed takes priority over pending on the same date', () => {
    expect(STAFF_HTML).toMatch(/confirmed > pending/);
    const applyBlock = STAFF_HTML.match(
      /function applyShiftCalendarMarks\([\s\S]*?\n      \}/,
    );
    expect(applyBlock).not.toBeNull();
    expect(applyBlock[0]).toMatch(/if \(confirmed\.has\(dateStr\)\)/);
    expect(applyBlock[0]).toMatch(/if \(pending\.has\(dateStr\)\)/);
  });

  it('confirmed days are blocked from selection / edit UI', () => {
    expect(STAFF_HTML).toMatch(/function isConfirmedShiftDate\s*\(/);
    const selectBlock = STAFF_HTML.match(
      /async function selectDate\([\s\S]*?\n      \}/,
    );
    expect(selectBlock).not.toBeNull();
    expect(selectBlock[0]).toMatch(/isConfirmedShiftDate\(dateStr\)/);
    expect(selectBlock[0]).toMatch(/SHIFT_REQUEST_ALREADY_CONFIRMED/);
  });

  it('selection sync still styles pending checkmarks and keeps confirmed blue', () => {
    const syncBlock = STAFF_HTML.match(
      /function syncCalendarDaySelectionStyles\s*\([\s\S]*?\n      \}/,
    );
    expect(syncBlock).not.toBeNull();
    expect(syncBlock[0]).toMatch(/pending-checkmark/);
    expect(syncBlock[0]).toMatch(/confirmed-checkmark/);
    expect(syncBlock[0]).toMatch(/#4caf50/);
    expect(syncBlock[0]).toMatch(/#2196F3/);
    expect(STAFF_HTML).toMatch(/selectedDates\.includes\(dateStr\)/);
  });

  it('applyPendingShiftMarks remains and delegates to applyShiftCalendarMarks', () => {
    expect(STAFF_HTML).toMatch(/function applyPendingShiftMarks\s*\(/);
    expect(STAFF_HTML).toMatch(/function applyShiftCalendarMarks\s*\(/);
    const pendingApply = STAFF_HTML.match(
      /function applyPendingShiftMarks\([\s\S]*?\n      \}/,
    );
    expect(pendingApply).not.toBeNull();
    expect(pendingApply[0]).toContain('applyShiftCalendarMarks');
    expect(STAFF_HTML).toMatch(
      /function applyShiftCalendarMarks\([\s\S]*syncCalendarDaySelectionStyles\(\)/,
    );
  });
});
