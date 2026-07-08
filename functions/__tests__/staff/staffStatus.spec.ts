import { normalizeStaffStatus, isActiveStaff } from '../../src/domains/staff/helpers/staffStatus';

describe('staffStatus helpers', () => {
  describe('normalizeStaffStatus', () => {
    it('treats missing status as active', () => {
      expect(normalizeStaffStatus({ fullName: 'test' })).toBe('active');
    });

    it('treats explicit active as active', () => {
      expect(normalizeStaffStatus({ status: 'active' })).toBe('active');
    });

    it('treats retired as retired', () => {
      expect(normalizeStaffStatus({ status: 'retired' })).toBe('retired');
    });
  });

  describe('isActiveStaff', () => {
    it('returns false for retired', () => {
      expect(isActiveStaff({ status: 'retired' })).toBe(false);
    });

    it('returns true when status unset', () => {
      expect(isActiveStaff({})).toBe(true);
    });
  });
});
