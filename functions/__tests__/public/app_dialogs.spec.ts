/**
 * public/js/app_dialogs.js — custom alert/confirm
 * DOM は最小モック（jsdom 非依存）。
 */
// @ts-nocheck

function installMinimalDom() {
  const nodes = new Map();

  function createNode(tag) {
    const node = {
      _id: '',
      tagName: String(tag).toUpperCase(),
      className: '',
      textContent: '',
      type: '',
      children: [],
      attrs: {},
      listeners: {},
      parent: null,
      get firstChild() {
        return this.children[0] || null;
      },
      setAttribute(k, v) {
        this.attrs[k] = v;
      },
      appendChild(child) {
        child.parent = this;
        this.children.push(child);
        return child;
      },
      removeChild(child) {
        const i = this.children.indexOf(child);
        if (i >= 0) this.children.splice(i, 1);
        child.parent = null;
        return child;
      },
      addEventListener(type, fn) {
        this.listeners[type] = fn;
      },
      focus() {},
      click() {
        if (this.listeners.click) this.listeners.click();
      },
    };
    Object.defineProperty(node, 'id', {
      get() {
        return this._id || '';
      },
      set(v) {
        if (this._id) nodes.delete(this._id);
        this._id = v;
        if (v) nodes.set(v, node);
      },
    });
    return node;
  }

  const body = createNode('body');
  const document = {
    body,
    getElementById(id) {
      return nodes.get(id) || null;
    },
    createElement(tag) {
      return createNode(tag);
    },
  };

  global.document = document;
  global.window = global;
  return { document, body };
}

describe('app_dialogs', () => {
  let AppDialogs;
  let dom;

  beforeEach(() => {
    jest.resetModules();
    dom = installMinimalDom();
    AppDialogs = require('../../../public/js/app_dialogs.js');
    AppDialogs._resetForTests();
  });

  afterEach(() => {
    AppDialogs._resetForTests();
  });

  it('showAppAlert は textContent で message を表示し OK で閉じる', async () => {
    const p = AppDialogs.showAppAlert('hello <b>x</b>');
    const root = dom.document.getElementById('app-dialog-root');
    expect(root).toBeTruthy();
    expect(root.className).toContain('is-open');

    const panel = root.children.find((c) => c.className === 'app-dialog-panel');
    expect(panel).toBeTruthy();
    const messageEl = panel.children.find((c) => c.className === 'app-dialog-message');
    expect(messageEl.textContent).toBe('hello <b>x</b>');

    const actions = panel.children.find((c) => c.className === 'app-dialog-actions');
    const ok = actions.children.find((c) =>
      String(c.className).includes('app-dialog-btn-primary'),
    );
    ok.click();
    await p;
    expect(root.className).not.toContain('is-open');
  });

  it('showAppConfirm OK は true、Cancel は false。二重クリックでも1回だけ解決', async () => {
    const p = AppDialogs.showAppConfirm('削除しますか？');
    const root = dom.document.getElementById('app-dialog-root');
    const panel = root.children.find((c) => c.className === 'app-dialog-panel');
    const actions = panel.children.find((c) => c.className === 'app-dialog-actions');
    const cancel = actions.children.find((c) =>
      String(c.className).includes('app-dialog-btn-secondary'),
    );

    cancel.click();
    cancel.click();
    await expect(p).resolves.toBe(false);

    const p2 = AppDialogs.showAppConfirm('実行しますか？');
    const root2 = dom.document.getElementById('app-dialog-root');
    const panel2 = root2.children.find((c) => c.className === 'app-dialog-panel');
    const actions2 = panel2.children.find((c) => c.className === 'app-dialog-actions');
    const ok2 = actions2.children.find((c) =>
      String(c.className).includes('app-dialog-btn-primary'),
    );
    ok2.click();
    ok2.click();
    await expect(p2).resolves.toBe(true);
  });
});

describe('native dialog static audit (live paths)', () => {
  const fs = require('fs');
  const path = require('path');

  function collectLiveNativeDialogs(filePath) {
    const text = fs.readFileSync(filePath, 'utf8');
    const lines = text.split('\n');
    const hits = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!/(?<![\w.])(alert|confirm)\s*\(/.test(line)) continue;
      if (line.includes('AppDialogs')) continue;
      if (line.includes('confirmShifts') || line.includes('confirmedShifts')) continue;

      const lookback = lines.slice(Math.max(0, i - 20), i + 1).join('\n');
      let reason = 'live';
      if (/window\.orderItem\s*=/.test(lookback) || /dead-code 候補（HTML から未配線）/.test(lookback)) {
        if (/orderItem|この注文を確定しますか/.test(lookback + line)) {
          reason = 'dead:orderItem';
        }
      }
      if (/window\.joinTournament/.test(lookback)) {
        reason = 'dead:joinTournament';
      }
      hits.push({ line: i + 1, text: line.trim(), reason });
    }
    return hits;
  }

  it('user live 導線に native alert/confirm が残っていない', () => {
    const file = path.join(__dirname, '../../../public/user/index.html');
    const hits = collectLiveNativeDialogs(file);
    const live = hits.filter((h) => h.reason === 'live');
    expect(live).toEqual([]);
  });

  it('staff live 導線に native alert/confirm が残っていない', () => {
    const file = path.join(__dirname, '../../../public/staff/index.html');
    const hits = collectLiveNativeDialogs(file);
    const live = hits.filter((h) => h.reason === 'live');
    expect(live).toEqual([]);
  });
});
