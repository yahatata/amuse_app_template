/**
 * CLN-K1〜K6: dead production source が無いこと、正式経路が残ること。
 */
// @ts-nocheck

const fs = require('fs');
const path = require('path');

const USER_HTML = fs.readFileSync(
  path.join(__dirname, '../../../public/user/index.html'),
  'utf8',
);
const STAFF_HTML = fs.readFileSync(
  path.join(__dirname, '../../../public/staff/index.html'),
  'utf8',
);

describe('CLN-K dead code removed (production HTML)', () => {
  it('K1 joinTournament 定義なし', () => {
    expect(USER_HTML).not.toMatch(/window\.joinTournament\s*=/);
    expect(USER_HTML).not.toMatch(/function joinTournament\s*\(/);
  });

  it('K2 orderItem / processOrder 定義なし', () => {
    expect(USER_HTML).not.toMatch(/window\.orderItem\s*=/);
    expect(USER_HTML).not.toMatch(/function processOrder\s*\(/);
  });

  it('K3 executeWithButtonLoading が user/staff に無い', () => {
    expect(USER_HTML).not.toContain('executeWithButtonLoading');
    expect(STAFF_HTML).not.toContain('executeWithButtonLoading');
  });

  it('formal Tournament 参加経路は残る', () => {
    expect(USER_HTML).toContain("'registerForTournament'");
    expect(USER_HTML).toContain('AppDialogs.showAppAlert');
    expect(USER_HTML).toContain('AppDialogs.showAppConfirm');
  });

  it('formal 注文経路は orderAllItems', () => {
    expect(USER_HTML).toContain('window.orderAllItems');
    expect(USER_HTML).toContain('onclick="orderAllItems()"');
  });

  it('D4 の executeWithGlobalLoading は残る', () => {
    expect(STAFF_HTML).toContain('executeWithGlobalLoading');
    expect(USER_HTML).toContain('executeWithGlobalLoading');
  });

  it('K6 legacy 一括提出 DOM/関数なし', () => {
    expect(STAFF_HTML).not.toContain('submitAllShifts');
    expect(STAFF_HTML).not.toContain('submit-all-shifts-btn');
    expect(STAFF_HTML).not.toContain('pending-shifts-container');
    expect(STAFF_HTML).not.toContain('shift-input-container');
    expect(STAFF_HTML).not.toContain('addShiftToList');
  });

  it('K6 formal シフト提出経路は残る', () => {
    expect(STAFF_HTML).toMatch(/async function submitShifts\s*\(/);
    expect(STAFF_HTML).toContain("'submitShiftRequests'");
    expect(STAFF_HTML).toContain('go-to-edit-page-btn');
    expect(STAFF_HTML).toContain('submit-shifts-btn');
  });
});
