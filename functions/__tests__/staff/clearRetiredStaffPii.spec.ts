import { RETIRED_STAFF_PII_FIELDS, buildRetiredStaffPiiDeletes } from '../../src/domains/staff/helpers/clearRetiredStaffPii';

describe('clearRetiredStaffPii', () => {
  it('includes expected PII fields', () => {
    expect(RETIRED_STAFF_PII_FIELDS).toEqual(
      expect.arrayContaining(['email', 'phoneNumber', 'loginId', 'qrCodeUrl'])
    );
    expect(RETIRED_STAFF_PII_FIELDS).not.toContain('fullName');
    expect(RETIRED_STAFF_PII_FIELDS).not.toContain('fullNameKana');
  });

  it('buildRetiredStaffPiiDeletes returns delete entries for all PII fields', () => {
    const deletes = buildRetiredStaffPiiDeletes();
    for (const field of RETIRED_STAFF_PII_FIELDS) {
      expect(deletes[field]).toBeDefined();
    }
  });
});
