/**
 * CLN-D1: LINE staff 登録 / 再登録の電話番号正規化
 * backend `staffClientNonce` と同じ桁規則。Functions は変更しない。
 */
const fs = require('fs');
const path = require('path');

const StaffPhone = require('../../../public/js/staff_phone.js');

const BACKEND_PHONE_REGEXP = /^(0[5789]0\d{8}|0[1-9]\d{8,9})$/;
const STAFF_HTML = fs.readFileSync(
  path.join(__dirname, '../../../public/staff/index.html'),
  'utf8',
);

describe('staff_phone (CLN-D1)', () => {
  describe('normalize / validation', () => {
    it('ハイフンなし 09012345678 はそのまま', () => {
      const normalized = StaffPhone.normalizeStaffPhoneNumber('09012345678');
      expect(normalized).toBe('09012345678');
      expect(StaffPhone.isValidStaffPhoneNumber(normalized)).toBe(true);
    });

    it('ハイフン付き 090-1234-5678 を 09012345678 にする', () => {
      const normalized = StaffPhone.normalizeStaffPhoneNumber('090-1234-5678');
      expect(normalized).toBe('09012345678');
      expect(StaffPhone.isValidStaffPhoneNumber(normalized)).toBe(true);
    });

    it('先頭末尾の空白は trim する', () => {
      expect(StaffPhone.normalizeStaffPhoneNumber('  09012345678  ')).toBe(
        '09012345678',
      );
      expect(StaffPhone.normalizeStaffPhoneNumber('  090-1234-5678  ')).toBe(
        '09012345678',
      );
    });

    it('normalize 後 10〜11 桁の数字なら PASS（backend と同じ規則）', () => {
      const cases = ['09012345678', '0312345678', '03123456789'];
      for (const raw of cases) {
        const normalized = StaffPhone.normalizeStaffPhoneNumber(raw);
        expect(StaffPhone.isValidStaffPhoneNumber(normalized)).toBe(true);
        expect(BACKEND_PHONE_REGEXP.test(normalized)).toBe(true);
      }
    });

    it('再登録: ハイフンなしは正規化後も同じ', () => {
      const normalized = StaffPhone.normalizeStaffPhoneNumber('08011112222');
      expect(normalized).toBe('08011112222');
      expect(StaffPhone.isValidStaffPhoneNumber(normalized)).toBe(true);
    });

    it('再登録: ハイフン付きも正規化する', () => {
      const normalized = StaffPhone.normalizeStaffPhoneNumber('080-1111-2222');
      expect(normalized).toBe('08011112222');
      expect(StaffPhone.isValidStaffPhoneNumber(normalized)).toBe(true);
    });

    it('normalize 後に桁数不足なら reject', () => {
      const normalized = StaffPhone.normalizeStaffPhoneNumber('090-12-345');
      expect(normalized).toBe('09012345');
      expect(StaffPhone.isValidStaffPhoneNumber(normalized)).toBe(false);
      expect(BACKEND_PHONE_REGEXP.test(normalized)).toBe(false);
    });

    it('不正文字が残る入力は reject', () => {
      const leftover = StaffPhone.normalizeStaffPhoneNumber('090-1234-567a');
      expect(leftover).toBe('0901234567a');
      expect(StaffPhone.isValidStaffPhoneNumber(leftover)).toBe(false);

      const spaced = StaffPhone.normalizeStaffPhoneNumber('090 1234 5678');
      expect(spaced).toBe('090 1234 5678');
      expect(StaffPhone.isValidStaffPhoneNumber(spaced)).toBe(false);
    });

    it('payload 相当の正規化値にハイフンを含めない', () => {
      const samples = ['09012345678', '090-1234-5678', ' 080-1111-2222 '];
      for (const raw of samples) {
        const normalized = StaffPhone.normalizeStaffPhoneNumber(raw);
        expect(normalized).not.toMatch(/[-－−‐–—ー]/);
        if (StaffPhone.isValidStaffPhoneNumber(normalized)) {
          expect(BACKEND_PHONE_REGEXP.test(normalized)).toBe(true);
        }
      }
    });

    it('エラー文言はハイフン禁止ではなく桁の数字を案内する', () => {
      expect(StaffPhone.INVALID_STAFF_PHONE_MESSAGE).toBe(
        '電話番号は10〜11桁の数字で入力してください',
      );
      expect(StaffPhone.INVALID_STAFF_PHONE_MESSAGE).not.toContain('ハイフンなし');
    });
  });

  describe('staff HTML wiring', () => {
    it('新規登録 / 再登録の placeholder が 09012345678', () => {
      expect(STAFF_HTML).toMatch(
        /id="phone"[^>]*placeholder="09012345678"/,
      );
      expect(STAFF_HTML).toMatch(
        /id="reactivation-phone"[^>]*placeholder="09012345678"/,
      );
    });

    it('staff 登録系にハイフン付き電話 placeholder を残さない', () => {
      expect(STAFF_HTML).not.toContain('090-1234-5678');
      expect(STAFF_HTML).not.toContain('000-0000-0000');
    });

    it('登録 / 再登録とも送信前に normalize する', () => {
      const normalizeCalls = STAFF_HTML.match(
        /StaffPhone\.normalizeStaffPhoneNumber/g,
      );
      expect(normalizeCalls && normalizeCalls.length).toBeGreaterThanOrEqual(3);
    });

    it('callable 名は createStaffAccount / reactivateStaffAccount のまま', () => {
      expect(STAFF_HTML).toContain("httpsCallable(functions, 'createStaffAccount')");
      expect(STAFF_HTML).toContain(
        "httpsCallable(functions, 'reactivateStaffAccount')",
      );
    });
  });
});
