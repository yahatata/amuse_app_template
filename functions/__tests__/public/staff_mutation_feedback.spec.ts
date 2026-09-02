/**
 * CLN-D4: LINE staff 主要 mutation の結果は AppDialogs。
 * 下部 #success-message / #error-message だけに依存しない。
 * D1 電話 normalize・callable 名・loading 方式は維持。
 */
// @ts-nocheck
const fs = require('fs');
const path = require('path');

const STAFF_HTML = fs.readFileSync(
  path.join(__dirname, '../../../public/staff/index.html'),
  'utf8',
);

function sliceBetween(src, startMarker, endMarker) {
  const start = src.indexOf(startMarker);
  expect(start).toBeGreaterThanOrEqual(0);
  const end = src.indexOf(endMarker, start + startMarker.length);
  expect(end).toBeGreaterThan(start);
  return src.slice(start, end);
}

function afterLoading(src, loadingCloseSnippet, feedbackSnippet) {
  const loadingEnd = src.indexOf(loadingCloseSnippet);
  const feedbackAt = src.indexOf(feedbackSnippet);
  expect(loadingEnd).toBeGreaterThanOrEqual(0);
  expect(feedbackAt).toBeGreaterThan(loadingEnd);
}

describe('CLN-D4 staff mutation feedback', () => {
  let registration;
  let reactivation;
  let shiftSubmit;
  let correction;

  beforeAll(() => {
    registration = sliceBetween(
      STAFF_HTML,
      "registrationFormEl.addEventListener('submit'",
      'if (reactivationFormEl)',
    );
    reactivation = sliceBetween(
      STAFF_HTML,
      "reactivationFormEl.addEventListener('submit'",
      '// QRコード表示関数',
    );
    shiftSubmit = sliceBetween(
      STAFF_HTML,
      'async function submitShifts()',
      'function backToCalendar()',
    );
    correction = sliceBetween(
      STAFF_HTML,
      'async function submitCorrectionRequest(event)',
      'function setupCorrectionForm()',
    );
  });

  describe('新規登録 createStaffAccount', () => {
    it('success / error は showMutationFeedback（AppDialogs）', () => {
      expect(registration).toContain("httpsCallable(functions, 'createStaffAccount')");
      expect(registration).toContain(
        'await showMutationFeedback(classified.resolved.message)',
      );
      expect(registration).toContain(
        'await showMutationFeedback(classified.resolved)',
      );
      expect(registration).not.toMatch(/classified\.outcome === 'success'[\s\S]{0,400}showSuccess\(/);
    });

    it('送信前 validation はページ内 showError のまま', () => {
      expect(registration).toContain('StaffPhone.normalizeStaffPhoneNumber');
      expect(registration).toContain('showError(');
      expect(registration).toContain(
        'かなはひらがなまたはカタカナで入力してください。',
      );
    });

    it('dialog は executeWithGlobalLoading の後', () => {
      afterLoading(
        registration,
        ", '登録中…');",
        'await showMutationFeedback(classified.resolved.message)',
      );
    });
  });

  describe('再登録 reactivateStaffAccount', () => {
    it('success / error は showMutationFeedback（AppDialogs）', () => {
      expect(reactivation).toContain(
        "httpsCallable(functions, 'reactivateStaffAccount')",
      );
      expect(reactivation).toContain(
        'await showMutationFeedback(classified.resolved.message)',
      );
      expect(reactivation).toContain(
        'await showMutationFeedback(classified.resolved)',
      );
      expect(reactivation).not.toMatch(/classified\.outcome === 'success'[\s\S]{0,400}showSuccess\(/);
    });

    it('D1 phone normalize を維持する', () => {
      expect(reactivation).toContain('StaffPhone.normalizeStaffPhoneNumber');
    });

    it('dialog は executeWithGlobalLoading の後', () => {
      afterLoading(
        reactivation,
        ", '再登録中…');",
        'await showMutationFeedback(classified.resolved.message)',
      );
    });
  });

  describe('live シフト申請 submitShiftRequests', () => {
    it('success / error は AppDialogs 経路', () => {
      expect(shiftSubmit).toContain(
        "httpsCallable(functions, 'submitShiftRequests')",
      );
      expect(shiftSubmit).toContain(
        'await showMutationFeedback(LE.MESSAGES.SHIFT_SUBMIT_SUCCESS)',
      );
      expect(shiftSubmit).toContain(
        'await showMutationFeedback(classified.resolved)',
      );
      expect(shiftSubmit).not.toContain('showSuccess(LE.MESSAGES.SHIFT_SUBMIT_SUCCESS)');
    });

    it('空入力は既存 AppDialogs のまま', () => {
      expect(shiftSubmit).toContain(
        'await window.AppDialogs.showAppAlert(LE.MESSAGES.SHIFT_EMPTY_INPUT)',
      );
    });

    it('dialog は loading finally の後', () => {
      const finallyAt = shiftSubmit.indexOf('shiftSubmitBusy = false');
      const successAt = shiftSubmit.indexOf(
        'await showMutationFeedback(LE.MESSAGES.SHIFT_SUBMIT_SUCCESS)',
      );
      expect(finallyAt).toBeGreaterThanOrEqual(0);
      expect(successAt).toBeGreaterThan(finallyAt);
    });
  });

  describe('勤怠修正 createAttendanceCorrectionRequest', () => {
    it('success / error は showMutationFeedback', () => {
      expect(correction).toContain(
        "httpsCallable(functions, 'createAttendanceCorrectionRequest')",
      );
      expect(correction).toContain(
        'await showMutationFeedback(LE ? LE.MESSAGES.ATT_CORRECTION_SUCCESS',
      );
      expect(correction).toContain(
        'await showMutationFeedback(classified.resolved)',
      );
      expect(correction).not.toContain('showSuccess(LE ? LE.MESSAGES.ATT_CORRECTION_SUCCESS');
    });

    it('送信前 validation は showError のまま', () => {
      expect(correction).toContain('showError(validationError)');
    });

    it('dialog は executeWithGlobalLoading の後', () => {
      afterLoading(
        correction,
        "LE.MESSAGES.ATT_BTN_SUBMITTING : '申請中…');",
        'await showMutationFeedback(LE ? LE.MESSAGES.ATT_CORRECTION_SUCCESS',
      );
    });
  });

  describe('callable / helper 維持', () => {
    it('A分類 mutation の callable 名は変更していない', () => {
      expect(STAFF_HTML).toContain("httpsCallable(functions, 'createStaffAccount')");
      expect(STAFF_HTML).toContain(
        "httpsCallable(functions, 'reactivateStaffAccount')",
      );
      expect(STAFF_HTML).toContain(
        "httpsCallable(functions, 'submitShiftRequests')",
      );
      expect(STAFF_HTML).toContain(
        "httpsCallable(functions, 'createAttendanceCorrectionRequest')",
      );
    });

    it('showMutationFeedback は AppDialogs.showAppAlert を使う', () => {
      const helper = sliceBetween(
        STAFF_HTML,
        'async function showMutationFeedback(messageOrResolved)',
        'function showGlobalLoading',
      );
      expect(helper).toContain('window.AppDialogs.showAppAlert');
      expect(helper).not.toContain('successEl.textContent');
    });

    it('A分類 live 申請は下部 showSuccess に依存しない', () => {
      expect(registration).not.toContain('showSuccess(');
      expect(reactivation).not.toContain('showSuccess(');
      expect(shiftSubmit).not.toContain('showSuccess(');
      expect(correction).not.toContain('showSuccess(');
    });

    it('showSuccess / showError helper 自体は残す（validation / legacy）', () => {
      expect(STAFF_HTML).toContain('function showSuccess(message)');
      expect(STAFF_HTML).toContain('function showError(message, error = null)');
      expect(STAFF_HTML).toContain('id="success-message"');
      expect(STAFF_HTML).toContain('id="error-message"');
    });

    it('executeWithGlobalLoading は維持する', () => {
      expect(registration).toContain('executeWithGlobalLoading');
      expect(reactivation).toContain('executeWithGlobalLoading');
      expect(shiftSubmit).toContain('executeWithGlobalLoading');
      expect(correction).toContain('executeWithGlobalLoading');
    });
  });
});
