import { assertActiveStaff } from '../../src/domains/staff/helpers/staffStatus';
import * as admin from 'firebase-admin';
import { HttpsError } from 'firebase-functions/v2/https';

describe('activeStaffGuard', () => {
  const staffId = 'staff-guard-test';

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('rejects retired staff with STAFF_RETIRED', async () => {
    jest.spyOn(admin.firestore(), 'collection').mockReturnValue({
      doc: jest.fn().mockReturnValue({
        get: jest.fn().mockResolvedValue({
          exists: true,
          data: () => ({ status: 'retired', fullName: '退職者' }),
        }),
      }),
    } as unknown as admin.firestore.CollectionReference);

    await expect(assertActiveStaff(staffId)).rejects.toMatchObject({
      code: 'permission-denied',
      details: { errorKey: 'STAFF_RETIRED' },
    } satisfies Partial<HttpsError>);
  });

  it('allows active staff', async () => {
    jest.spyOn(admin.firestore(), 'collection').mockReturnValue({
      doc: jest.fn().mockReturnValue({
        get: jest.fn().mockResolvedValue({
          exists: true,
          data: () => ({ status: 'active', fullName: '在籍者' }),
        }),
      }),
    } as unknown as admin.firestore.CollectionReference);

    const snap = await assertActiveStaff(staffId);
    expect(snap.exists).toBe(true);
  });

  it('rejects missing staff with STAFF_NOT_ACTIVE', async () => {
    jest.spyOn(admin.firestore(), 'collection').mockReturnValue({
      doc: jest.fn().mockReturnValue({
        get: jest.fn().mockResolvedValue({ exists: false }),
      }),
    } as unknown as admin.firestore.CollectionReference);

    await expect(assertActiveStaff(staffId)).rejects.toMatchObject({
      details: { errorKey: 'STAFF_NOT_ACTIVE' },
    });
  });
});
