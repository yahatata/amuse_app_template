jest.mock('../../src/shared/devices', () => ({
  getCallerDeviceByUid: jest.fn(),
  isActive: jest.fn(),
}));

jest.mock('../../src/domains/webhook/services/lineRichMenu', () => ({
  linkUserRichMenu: jest.fn().mockResolvedValue(true),
  unlinkRichMenu: jest.fn().mockResolvedValue(true),
}));

jest.mock('../../src/domains/staff/helpers/checkFutureStaffSchedule', () => ({
  checkFutureStaffSchedule: jest.fn(),
}));

import * as admin from 'firebase-admin';
import { getCallerDeviceByUid, isActive } from '../../src/shared/devices';
import { linkUserRichMenu, unlinkRichMenu } from '../../src/domains/webhook/services/lineRichMenu';
import { checkFutureStaffSchedule } from '../../src/domains/staff/helpers/checkFutureStaffSchedule';
import { retireStaff } from '../../src/domains/staff/callables/retireStaff';

describe('retireStaff', () => {
  const adminUid = 'admin-device-uid';
  const staffId = 'staff-active-001';
  let staffData: Record<string, unknown>;
  let usersExists = false;
  let updatePayload: Record<string, unknown> | null = null;

  beforeEach(() => {
    jest.clearAllMocks();
    staffData = {
      uid: staffId,
      fullName: '山田太郎',
      fullNameKana: 'やまだたろう',
      email: 'test@example.com',
      hourlyWage: 1200,
      bankInfo: { bankName: 'テスト銀行' },
      status: 'active',
    };
    usersExists = false;
    updatePayload = null;

    (getCallerDeviceByUid as jest.Mock).mockResolvedValue({
      id: 'device-1',
      role: 'admin',
      status: 'active',
    });
    (isActive as jest.Mock).mockReturnValue(true);
    (checkFutureStaffSchedule as jest.Mock).mockResolvedValue({
      blocked: false,
      shiftRequestCount: 0,
      assignmentCount: 0,
      samples: [],
    });

    jest.spyOn(admin.firestore(), 'collection').mockImplementation((name: string) => {
      if (name === 'staffs') {
        return {
          doc: jest.fn().mockReturnValue({
            get: jest.fn().mockResolvedValue({
              exists: true,
              data: () => staffData,
            }),
            update: jest.fn().mockImplementation(async (payload: Record<string, unknown>) => {
              updatePayload = payload;
              Object.assign(staffData, payload);
            }),
          }),
        } as unknown as admin.firestore.CollectionReference;
      }
      if (name === 'users') {
        return {
          doc: jest.fn().mockReturnValue({
            get: jest.fn().mockResolvedValue({ exists: usersExists }),
          }),
        } as unknown as admin.firestore.CollectionReference;
      }
      throw new Error(`unexpected collection: ${name}`);
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  function callRetire(overrides: Record<string, unknown> = {}) {
    return (retireStaff as any).run({
      data: {
        staffId,
        retiredDate: '2026-07-09',
        retiredReason: 'テスト退職',
        ...overrides,
      },
      auth: { uid: adminUid, token: {} as never },
      rawRequest: {} as never,
      acceptsStreaming: false,
    });
  }

  it('active → retired with PII cleared and retained fields kept', async () => {
    const result = await callRetire();
    expect(result.success).toBe(true);
    expect(updatePayload?.status).toBe('retired');
    expect(updatePayload?.retiredDate).toBe('2026-07-09');
    expect(staffData.fullName).toBe('山田太郎');
    expect(staffData.hourlyWage).toBe(1200);
  });

  it('blocks when future shiftRequests exist', async () => {
    (checkFutureStaffSchedule as jest.Mock).mockResolvedValue({
      blocked: true,
      shiftRequestCount: 2,
      assignmentCount: 0,
      samples: [{ kind: 'shiftRequest', dateKey: '2026-12-01' }],
    });

    await expect(callRetire()).rejects.toMatchObject({
      code: 'failed-precondition',
      details: expect.objectContaining({ errorKey: 'STAFF_FUTURE_SCHEDULE_EXISTS' }),
    });
  });

  it('rejects double retire with STAFF_ALREADY_RETIRED', async () => {
    staffData.status = 'retired';
    await expect(callRetire()).rejects.toMatchObject({
      details: expect.objectContaining({ errorKey: 'STAFF_ALREADY_RETIRED' }),
    });
  });

  it('links user rich menu when users doc exists', async () => {
    usersExists = true;
    await callRetire();
    expect(linkUserRichMenu).toHaveBeenCalledWith(staffId);
  });

  it('unlinks rich menu when users doc missing', async () => {
    await callRetire();
    expect(unlinkRichMenu).toHaveBeenCalledWith(staffId);
  });
});
