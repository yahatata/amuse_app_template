import { isActiveStaff } from '../../src/domains/staff/helpers/staffStatus';

describe('ensureStaffRichMenu active guard (logic)', () => {
  it('does not treat retired staff as active', () => {
    expect(isActiveStaff({ status: 'retired' })).toBe(false);
  });

  it('treats unset status as active for rich menu linking', () => {
    expect(isActiveStaff({ fullName: 'test' })).toBe(true);
  });
});
