jest.mock('../../../src/domains/shift/services/helpers', () => {
  const actual = jest.requireActual('../../../src/domains/shift/services/helpers');
  return {
    ...actual,
    assertAdminDevice: jest.fn(async () => undefined),
    getRequiredStaffByTimeSlot: jest.fn(async () => ({
      version: 2,
      byStyle: {
        weekday: [],
        weekendHoliday: [],
        event: [],
        allDay: [],
        closed: [],
      },
    })),
  };
});

import * as admin from 'firebase-admin';
import { interimConfirmRequests } from '../../../src/domains/shift/callables/interimConfirmRequests';

type DocMap = Map<string, Record<string, unknown>>;

type InterimTestStore = {
  shiftRequests: DocMap;
  days: DocMap;
};

function makeStore(): InterimTestStore {
  return {
    shiftRequests: new Map(),
    days: new Map(),
  };
}

function makeFirestoreMock(store: InterimTestStore) {
  const makeDocRef = (collectionPath: string, id: string) => {
    const getData = () => {
      if (collectionPath === 'shiftRequests') {
        return store.shiftRequests.get(id) || null;
      }
      const m = collectionPath.match(/^shifts\/([^/]+)\/days$/);
      if (m) {
        return store.days.get(`${m[1]}/${id}`) || null;
      }
      return null;
    };

    const setData = (payload: Record<string, unknown>, merge = false) => {
      if (collectionPath === 'shiftRequests') {
        const prev = store.shiftRequests.get(id) || {};
        store.shiftRequests.set(id, merge ? { ...prev, ...payload } : { ...payload });
        return;
      }
      const m = collectionPath.match(/^shifts\/([^/]+)\/days$/);
      if (m) {
        const key = `${m[1]}/${id}`;
        const prev = store.days.get(key) || {};
        store.days.set(key, merge ? { ...prev, ...payload } : { ...payload });
      }
    };

    const ref: any = {
      id,
      get: jest.fn(async () => {
        const data = getData();
        return {
          exists: !!data,
          id,
          data: () => data || undefined,
        };
      }),
      update: jest.fn(async (payload: Record<string, unknown>) => {
        const data = getData();
        if (!data) throw new Error(`missing doc for update: ${collectionPath}/${id}`);
        setData({ ...data, ...payload }, false);
      }),
      collection: jest.fn((sub: string) => makeCollection(`${collectionPath}/${id}/${sub}`)),
    };
    return ref;
  };

  const makeCollection = (collectionPath: string) => ({
    doc: jest.fn((id: string) => makeDocRef(collectionPath, id)),
  });

  jest.spyOn(admin.firestore(), 'collection').mockImplementation((name: string) => {
    return makeCollection(name) as unknown as admin.firestore.CollectionReference;
  });

  jest.spyOn(admin.firestore(), 'runTransaction').mockImplementation(async (fn: any) => {
    const tx = {
      get: async (ref: any) => ref.get(),
      update: (ref: any, data: any) => ref.update(data),
    };
    return fn(tx);
  });

  jest.spyOn(admin.firestore.FieldValue, 'serverTimestamp').mockReturnValue('TS' as never);
  jest.spyOn(admin.firestore.FieldValue, 'increment').mockImplementation((n: number) => n as never);
}

function callInterim(data: Record<string, unknown>) {
  return (interimConfirmRequests as any).run({
    data,
    auth: { uid: 'admin-uid', token: {} as never },
    rawRequest: {} as never,
    acceptsStreaming: false,
  });
}

describe('interimConfirmRequests', () => {
  const dateKey = '2026-10-05';
  const yearMonth = '2026-10';
  const requestId = 'staff-1_2026-10-05';

  afterEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  it('keeps staff latest request times on shiftRequests; saves allocation to assignments', async () => {
    const store = makeStore();
    makeFirestoreMock(store);

    const staffRequestStart = 19 * 60; // 19:00
    const staffRequestEnd = 22 * 60; // 22:00
    const originalStart = 18 * 60; // 18:00 audit
    const originalEnd = 23 * 60; // 23:00
    const allocationStart = 19 * 60; // 19:00
    const allocationEnd = 21 * 60; // 21:00

    store.shiftRequests.set(requestId, {
      requestId,
      staffId: 'staff-1',
      staffName: 'テスト',
      dateKey,
      yearMonth,
      status: 'pending',
      startMinute: staffRequestStart,
      endMinute: staffRequestEnd,
      originalStartMinute: originalStart,
      originalEndMinute: originalEnd,
    });

    store.days.set(`${yearMonth}/${dateKey}`, {
      businessHours: {
        openMinute: 9 * 60,
        closeMinute: 23 * 60,
        isClosed: false,
      },
      pendingRequestCount: 1,
      isFinalized: false,
      sufficientOverride: null,
      assignments: [],
    });

    const result = await callInterim({
      dateKey,
      installationId: 'device-1',
      selections: [
        {
          requestId,
          startMinute: allocationStart,
          endMinute: allocationEnd,
        },
      ],
    });

    expect(result.success).toBe(true);
    expect(result.confirmedCount).toBe(1);

    const requestDoc = store.shiftRequests.get(requestId)!;
    expect(requestDoc.status).toBe('interim_confirmed');
    expect(requestDoc.startMinute).toBe(staffRequestStart);
    expect(requestDoc.endMinute).toBe(staffRequestEnd);
    expect(requestDoc.originalStartMinute).toBe(originalStart);
    expect(requestDoc.originalEndMinute).toBe(originalEnd);

    const dayDoc = store.days.get(`${yearMonth}/${dateKey}`)!;
    const assignments = dayDoc.assignments as Array<{
      startMinute: number;
      endMinute: number;
      sourceRequestId: string;
    }>;
    expect(assignments).toHaveLength(1);
    expect(assignments[0].startMinute).toBe(allocationStart);
    expect(assignments[0].endMinute).toBe(allocationEnd);
    expect(assignments[0].sourceRequestId).toBe(requestId);
  });
});
