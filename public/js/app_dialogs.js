/**
 * App-owned alert / confirm (LINE LIFF).
 * Replaces window.alert / window.confirm so Hosting origin is not shown as dialog title.
 *
 * Messages are always rendered as text (no HTML injection).
 */
(function (global) {
  'use strict';

  var ROOT_ID = 'app-dialog-root';
  var openCount = 0;

  function ensureRoot() {
    var root = document.getElementById(ROOT_ID);
    if (root) return root;
    root = document.createElement('div');
    root.id = ROOT_ID;
    root.setAttribute('aria-live', 'polite');
    document.body.appendChild(root);
    return root;
  }

  function clearRoot(root) {
    while (root.firstChild) {
      root.removeChild(root.firstChild);
    }
  }

  function setText(el, text) {
    el.textContent = text == null ? '' : String(text);
  }

  function closeDialog(root) {
    clearRoot(root);
    root.className = '';
    openCount = Math.max(0, openCount - 1);
  }

  /**
   * @param {string} message
   * @param {{ okLabel?: string }} [options]
   * @returns {Promise<void>}
   */
  function showAppAlert(message, options) {
    options = options || {};
    var okLabel = options.okLabel || 'OK';
    var root = ensureRoot();

    // 二重表示防止: 既存を閉じてから出す
    clearRoot(root);
    openCount = 0;

    return new Promise(function (resolve) {
      openCount += 1;
      root.className = 'app-dialog-root is-open';

      var backdrop = document.createElement('div');
      backdrop.className = 'app-dialog-backdrop';
      backdrop.setAttribute('role', 'presentation');

      var panel = document.createElement('div');
      panel.className = 'app-dialog-panel';
      panel.setAttribute('role', 'dialog');
      panel.setAttribute('aria-modal', 'true');

      var msg = document.createElement('p');
      msg.className = 'app-dialog-message';
      setText(msg, message);

      var actions = document.createElement('div');
      actions.className = 'app-dialog-actions';

      var okBtn = document.createElement('button');
      okBtn.type = 'button';
      okBtn.className = 'app-dialog-btn app-dialog-btn-primary';
      setText(okBtn, okLabel);

      var settled = false;
      function finish() {
        if (settled) return;
        settled = true;
        closeDialog(root);
        resolve();
      }

      okBtn.addEventListener('click', finish);
      actions.appendChild(okBtn);
      panel.appendChild(msg);
      panel.appendChild(actions);
      root.appendChild(backdrop);
      root.appendChild(panel);

      try {
        okBtn.focus();
      } catch (_e) {}
    });
  }

  /**
   * @param {string} message
   * @param {{ okLabel?: string, cancelLabel?: string }} [options]
   * @returns {Promise<boolean>}
   */
  function showAppConfirm(message, options) {
    options = options || {};
    var okLabel = options.okLabel || 'OK';
    var cancelLabel = options.cancelLabel || 'キャンセル';
    var root = ensureRoot();

    clearRoot(root);
    openCount = 0;

    return new Promise(function (resolve) {
      openCount += 1;
      root.className = 'app-dialog-root is-open';

      var backdrop = document.createElement('div');
      backdrop.className = 'app-dialog-backdrop';
      backdrop.setAttribute('role', 'presentation');

      var panel = document.createElement('div');
      panel.className = 'app-dialog-panel';
      panel.setAttribute('role', 'dialog');
      panel.setAttribute('aria-modal', 'true');

      var msg = document.createElement('p');
      msg.className = 'app-dialog-message';
      setText(msg, message);

      var actions = document.createElement('div');
      actions.className = 'app-dialog-actions';

      var cancelBtn = document.createElement('button');
      cancelBtn.type = 'button';
      cancelBtn.className = 'app-dialog-btn app-dialog-btn-secondary';
      setText(cancelBtn, cancelLabel);

      var okBtn = document.createElement('button');
      okBtn.type = 'button';
      okBtn.className = 'app-dialog-btn app-dialog-btn-primary';
      setText(okBtn, okLabel);

      var settled = false;
      function finish(result) {
        if (settled) return;
        settled = true;
        closeDialog(root);
        resolve(!!result);
      }

      cancelBtn.addEventListener('click', function () {
        finish(false);
      });
      okBtn.addEventListener('click', function () {
        finish(true);
      });

      actions.appendChild(cancelBtn);
      actions.appendChild(okBtn);
      panel.appendChild(msg);
      panel.appendChild(actions);
      root.appendChild(backdrop);
      root.appendChild(panel);

      try {
        okBtn.focus();
      } catch (_e) {}
    });
  }

  var api = {
    showAppAlert: showAppAlert,
    showAppConfirm: showAppConfirm,
    /** @private test helper */
    _getOpenCount: function () {
      return openCount;
    },
    /** @private test helper */
    _resetForTests: function () {
      var root = document.getElementById(ROOT_ID);
      if (root) {
        clearRoot(root);
        root.className = '';
      }
      openCount = 0;
    },
  };

  global.AppDialogs = api;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof window !== 'undefined' ? window : global);
