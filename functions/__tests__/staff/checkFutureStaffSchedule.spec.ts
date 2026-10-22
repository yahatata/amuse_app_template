import * as admin from 'firebase-admin';
import { checkFutureStaffSchedule } from '../../src/domains/staff/helpers/checkFutureStaffSchedule';

describe('checkFutureStaffSchedule', () => {
  const staffId = 'staff-future-test';
  const todayJst = '2026-07-09';

  let shiftRequestsGet: jest.Mock;
  let daysGet: jest.Mock;

  beforeEach(() => {
    shiftRequestsGet = jest.fn().mockResolvedValue({ docs: [] });
    daysGet = jest.fn().mockResolvedValue({ docs: [] });

    const shiftRequestsCollection = {
      where: jest.fn().mockReturnThis(),
      get: shiftRequestsGet,
    };

    const daysCollection = {
      get: daysGet,
    };

    const shiftsDoc = {
      collection: jest.fn().mockReturnValue(daysCollection),
    };

    jest.spyOn(admin.firestore(), 'collection').mockImplementation((name: string) => {
      if (name === 'shiftRequests') {
        return shiftRequestsCollection as unknown as admin.firestore.CollectionReference;
      }
      if (name === 'shifts') {
        return {
          doc: jest.fn().mockReturnValue(shiftsDoc),
        } as unknown as admin.firestore.CollectionReference;
      }
      throw new Error(`unexpected collection: ${name}`);
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('blocks future shiftRequests', async () => {
    shiftRequestsGet.mockResolvedValue({
      docs: [
        { data: () => ({ dateKey: '2026-07-15', status: 'pending' }) },
        { data: () => ({ dateKey: '2026-07-01', status: 'pending' }) },
      ],
    });

    const result = await checkFutureStaffSchedule(staffId, todayJst);
    expect(result.blocked).toBe(true);
    expect(result.shiftRequestCount).toBe(1);
  });

  it('blocks future assignments', async () => {
    daysGet.mockResolvedValue({
      docs: [
        {
          id: '2026-07-20',
          data: () => ({
            assignments: [{ staffId, startMinute: 600, endMinute: 1080 }],
          }),
        },
      ],
    });

    const result = await checkFutureStaffSchedule(staffId, todayJst);
    expect(result.blocked).toBe(true);
    expect(result.assignmentCount).toBeGreaterThanOrEqual(1);
  });

  it('does not block past-only schedules', async () => {
    shiftRequestsGet.mockResolvedValue({
      docs: [{ data: () => ({ dateKey: '2026-07-01', status: 'pending' }) }],
    });

    const result = await checkFutureStaffSchedule(staffId, todayJst);
    expect(result.blocked).toBe(false);
  });
});
