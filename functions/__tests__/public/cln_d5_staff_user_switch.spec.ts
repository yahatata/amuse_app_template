/**
 * CLN-D5: staff ↔ user 正式切替の live 文言に「開発用」が無いこと。
 * 認証 / LIFF / 遷移先 / session は維持。文言ロックのみ。
 */
// @ts-nocheck
const fs = require('fs');
const path = require('path');

const STAFF_HTML = fs.readFileSync(
  path.join(__dirname, '../../../public/staff/index.html'),
  'utf8',
);
const USER_HTML = fs.readFileSync(
  path.join(__dirname, '../../../public/user/index.html'),
  'utf8',
);

function sliceBetween(src, startMarker, endMarker) {
  const start = src.indexOf(startMarker);
  expect(start).toBeGreaterThanOrEqual(0);
  const end = src.indexOf(endMarker, start + startMarker.length);
  expect(end).toBeGreaterThan(start);
  return src.slice(start, end);
}

describe('CLN-D5 staff ↔ user formal switch wording', () => {
  let switchButton;
  let switchHandler;

  beforeAll(() => {
    switchButton = sliceBetween(
      STAFF_HTML,
      'class="function-btn switch-user-btn"',
      '</button>',
    );
    switchHandler = sliceBetween(
      STAFF_HTML,
      'window.switchToUserApp = () => {',
      '// デバッグ用QR生成関数',
    );
  });

  it('staff → user live button に 開発用 が無い', () => {
    expect(switchButton).toContain('onclick="switchToUserApp()"');
    expect(switchButton).toContain('<h3>ユーザーに切り替え</h3>');
    expect(switchButton).toContain('同じLINEアカウントの顧客画面へ');
    expect(switchButton).not.toMatch(/開発用/);
    expect(switchButton).not.toMatch(/（開発用）|\(開発用\)/);
  });

  it('formal handler switchToUserApp が残る', () => {
    expect(STAFF_HTML).toContain('window.switchToUserApp = () => {');
    expect(switchHandler).toContain('window.__CONFIG__?.userLiffId');
    expect(switchHandler).toContain('window.liff.openWindow');
  });

  it('staff → user 遷移先が userLiffId の LIFF URL のまま', () => {
    expect(switchHandler).toContain(
      'const liffUrl = `https://liff.line.me/${userLiffId}`',
    );
    expect(switchHandler).toContain(
      'window.liff.openWindow({ url: liffUrl, external: false })',
    );
    expect(switchHandler).toContain('window.location.href = liffUrl');
    expect(switchHandler).not.toMatch(/開発用/);
  });

  it('user → staff 戻りは LINE 戻る（独自 switchToStaff を足していない）', () => {
    expect(USER_HTML).not.toContain('switchToStaff');
    expect(USER_HTML).not.toContain('スタッフ画面に戻');
    expect(USER_HTML).not.toMatch(/開発用/);
    expect(switchHandler).not.toContain('showSuccess');
    expect(switchHandler).not.toContain('showMutationFeedback');
  });

  it('staff live HTML の切替経路に （開発用） が残っていない', () => {
    expect(STAFF_HTML).not.toMatch(/ユーザーへ遷移/);
    expect(STAFF_HTML).not.toMatch(/（開発用）|\(開発用\)/);
    const home = sliceBetween(
      STAFF_HTML,
      'id="home-page"',
      'id="registration-page"',
    );
    expect(home).not.toMatch(/開発用/);
  });
});
