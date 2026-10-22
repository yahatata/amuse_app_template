/**
 * LINE staff 登録 / 再登録の電話番号正規化（CLN-D1）。
 * 保存・送信はハイフンなし数字列。backend `staffClientNonce` と同じ桁規則。
 */
(function (root) {
  'use strict';

  var HYPHENS = /[-－−‐–—ー]/g;
  var PHONE_REGEXP = /^(0[5789]0\d{8}|0[1-9]\d{8,9})$/;
  var INVALID_STAFF_PHONE_MESSAGE =
    '電話番号は10〜11桁の数字で入力してください';

  function normalizeStaffPhoneNumber(raw) {
    if (typeof raw !== 'string') return '';
    return raw.trim().replace(HYPHENS, '');
  }

  function isValidStaffPhoneNumber(normalized) {
    return PHONE_REGEXP.test(normalized);
  }

  var api = {
    normalizeStaffPhoneNumber: normalizeStaffPhoneNumber,
    isValidStaffPhoneNumber: isValidStaffPhoneNumber,
    INVALID_STAFF_PHONE_MESSAGE: INVALID_STAFF_PHONE_MESSAGE,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  root.StaffPhone = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
