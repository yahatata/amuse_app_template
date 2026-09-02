jest.mock('../../src/shared/config/configLoader', () => ({
  getStoreConfig: jest.fn(async () => ({
    shift: { schedulingStartDay: 16 },
  })),
}));

jest.mock('../../src/domains/shift/services/helpers', () => {
  const actual = jest.requireActual('../../src/domains/shift/services/helpers');
  return {
    ...actual,
    isInShiftSchedulingPeriod: jest.fn(() => false),
    isInsufficientDaysNotificationSent: jest.fn(async () => false),
    isInsufficientDayOrTimeSlot: jest.fn(async () => false),
  };
});

import * as admin from 'firebase-admin';
import { HttpsError } from 'firebase-functions/v2/https';
import { submitShiftRequests } from '../../src/domains/staff/callables/submitShiftRequests';
import { getShifts } from '../../src/domains/staff/callables/getShifts';
import {
  isInShiftSchedulingPeriod,
  isInsufficientDaysNotificationSent,
  isInsufficientDayOrTimeSlot,
} from '../../src/domains/shift/services/helpers';
import { getJstNextYearMonth } from '../../src/domains/staff/helpers/shiftSubmitNonce';

type DocMap = Map<string, Record<string, unknown>>;

type ShiftTestStore = {
  staff: Record<string, unknown> | null;
  mutationRequests: DocMap;
  shiftRequests: DocMap;
  days: DocMap; // key: `${ym}/${dateKey}`
  months: DocMap; // key: ym
};

function nextMonthDateKeys(days: number[]): string[] {
  const ym = getJstNextYearMonth();
  return days.map((d) => `${ym}-${String(d).padStart(2, '0')}`);
}

function defaultBh(overrides?: Partial<{ openMinute: number; closeMinute: number; isClosed: boolean }>) {
  return {
    openMinute: 9 * 60,
    closeMinute: 22 * 60,
    isClosed: false,
    ...overrides,
  };
}

function makeStore(uid: string): ShiftTestStore {
  const dateKeys = nextMonthDateKeys([1, 2, 3, 4, 5]);
  const ym = getJstNextYearMonth();
  const days: DocMap = new Map();
  for (const dk of dateKeys) {
    days.set(`${ym}/${dk}`, {
      businessHours: defaultBh(),
      pendingRequestCount: 0,
      isFinalized: false,
      isSufficient: true,
      assignments: [],
    });
  }
  return {
    staff: { uid, status: 'active', fullName: 'テストスタッフ' },
    mutationRequests: new Map(),
    shiftRequests: new Map(),
    days,
    months: new Map([[ym, { allDaysFinalized: false }]]),
  };
}

function makeFirestoreMock(store: ShiftTestStore, uid: string) {
  const makeDocRef = (collectionPath: string, id: string) => {
    const getData = () => {
      if (collectionPath === 'staffs') {
        return id === uid ? store.staff : null;
      }
      if (collectionPath === `staffs/${uid}/shiftMutationRequests`) {
        return store.mutationRequests.get(id) || null;
      }
      if (collectionPath === 'shiftRequests') {
        return store.shiftRequests.get(id) || null;
      }
      if (collectionPath === 'shifts') {
        return store.months.get(id) || null;
      }
      // days: shifts/{ym}/days
      const m = collectionPath.match(/^shifts\/([^/]+)\/days$/);
      if (m) {
        return store.days.get(`${m[1]}/${id}`) || null;
      }
      return null;
    };

    const setData = (payload: Record<string, unknown>, merge = false) => {
      if (collectionPath === 'staffs' && id === uid) {
        store.staff = merge ? { ...(store.staff || {}), ...payload } : { ...payload };
        return;
      }
      if (collectionPath === `staffs/${uid}/shiftMutationRequests`) {
        const prev = store.mutationRequests.get(id) || {};
        store.mutationRequests.set(id, merge ? { ...prev, ...payload } : { ...payload });
        return;
      }
      if (collectionPath === 'shiftRequests') {
        const prev = store.shiftRequests.get(id) || {};
        store.shiftRequests.set(id, merge ? { ...prev, ...payload } : { ...payload });
        return;
      }
      if (collectionPath === 'shifts') {
        const prev = store.months.get(id) || {};
        store.months.set(id, merge ? { ...prev, ...payload } : { ...payload });
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
      path: `${collectionPath}/${id}`,
      get: jest.fn(async () => {
        const data = getData();
        return {
          exists: !!data,
          id,
          data: () => data || undefined,
        };
      }),
      set: jest.fn(async (payload: Record<string, unknown>, opts?: { merge?: boolean }) => {
        setData(payload, opts?.merge === true);
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

  const makeCollection = (collectionPath: string) => {
    return {
      doc: jest.fn((id: string) => makeDocRef(collectionPath, id)),
      where: jest.fn((field: string, _op: string, value: unknown) => {
        return {
          where: jest.fn((field2: string, _op2: string, value2: unknown) => ({
            get: jest.fn(async () => {
              if (collectionPath !== 'shiftRequests') {
                return { docs: [], size: 0 };
              }
              const docs = [...store.shiftRequests.entries()]
                .filter(([, d]) => d[field] === value && d[field2] === value2)
                .map(([id, d]) => ({
                  id,
                  data: () => d,
                  exists: true,
                }));
              return { docs, size: docs.length };
            }),
          })),
          get: jest.fn(async () => {
            if (collectionPath !== 'shiftRequests') {
              return { docs: [], size: 0 };
            }
            const docs = [...store.shiftRequests.entries()]
              .filter(([, d]) => d[field] === value)
              .map(([id, d]) => ({
                id,
                data: () => d,
                exists: true,
              }));
            return { docs, size: docs.length };
          }),
        };
      }),
      get: jest.fn(async () => {
        const m = collectionPath.match(/^shifts\/([^/]+)\/days$/);
        if (m) {
          const ym = m[1];
          const docs = [...store.days.entries()]
            .filter(([k]) => k.startsWith(`${ym}/`))
            .map(([k, d]) => {
              const id = k.split('/')[1];
              return {
                id,
                data: () => d,
                exists: true,
              };
            });
          return { docs, size: docs.length };
        }
        return { docs: [], size: 0 };
      }),
      limit: jest.fn().mockReturnValue({
        get: jest.fn(async () => ({ docs: [], size: 0 })),
      }),
    };
  };

  jest.spyOn(admin.firestore(), 'collection').mockImplementation((name: string) => {
    return makeCollection(name) as unknown as admin.firestore.CollectionReference;
  });

  jest.spyOn(admin.firestore(), 'runTransaction').mockImplementation(async (fn: any) => {
    const tx = {
      get: async (ref: any) => ref.get(),
      set: (ref: any, data: any, opts?: any) => ref.set(data, opts),
      update: (ref: any, data: any) => ref.update(data),
    };
    return fn(tx);
  });
}

function callSubmit(uid: string | undefined, data: Record<string, unknown>) {
  return (submitShiftRequests as any).run({
    data,
    auth: uid ? { uid, token: {} as never } : undefined,
    rawRequest: {} as never,
    acceptsStreaming: false,
  });
}

function callGet(uid: string | undefined, data: Record<string, unknown> = {}) {
  return (getShifts as any).run({
    data,
    auth: uid ? { uid, token: {} as never } : undefined,
    rawRequest: {} as never,
    acceptsStreaming: false,
  });
}

function errKey(e: unknown): string | undefined {
  if (e instanceof HttpsError) {
    return (e.details as { errorKey?: string } | undefined)?.errorKey;
  }
  return undefined;
}

describe('submitShiftRequests (L6-A)', () => {
  const uid = 'staff-uid-l6a';

  afterEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
    (isInShiftSchedulingPeriod as jest.Mock).mockReturnValue(false);
    (isInsufficientDaysNotificationSent as jest.Mock).mockResolvedValue(false);
    (isInsufficientDayOrTimeSlot as jest.Mock).mockResolvedValue(false);
  });

  it('rejects unauthenticated', async () => {
    await expect(
      callSubmit(undefined, { clientNonce: 'n1', shifts: [] }),
    ).rejects.toMatchObject({
      details: expect.objectContaining({ errorKey: 'SHIFT_UNAUTHENTICATED' }),
    });
  });

  it('rejects client staffId/userId', async () => {
    const store = makeStore(uid);
    makeFirestoreMock(store, uid);
    await expect(
      callSubmit(uid, {
        clientNonce: 'n-staffid',
        staffId: 'other',
        shifts: [{ dateKey: nextMonthDateKeys([1])[0], startMinute: 600, endMinute: 720 }],
      }),
    ).rejects.toMatchObject({
      details: expect.objectContaining({ errorKey: 'SHIFT_INVALID_ARGUMENT' }),
    });
  });

  it('rejects retired staff', async () => {
    const store = makeStore(uid);
    store.staff = { uid, status: 'retired' };
    makeFirestoreMock(store, uid);
    await expect(
      callSubmit(uid, {
        clientNonce: 'n-retired',
        shifts: [{ dateKey: nextMonthDateKeys([1])[0], startMinute: 600, endMinute: 720 }],
      }),
    ).rejects.toMatchObject({
      details: expect.objectContaining({ errorKey: 'STAFF_RETIRED' }),
    });
  });

  it.each([
    ['missing', {}],
    ['empty', { clientNonce: '' }],
    ['whitespace', { clientNonce: '   ' }],
    ['invalid chars', { clientNonce: 'bad nonce!' }],
    ['too long', { clientNonce: 'x'.repeat(129) }],
  ])('rejects nonce: %s', async (_label, extra) => {
    const store = makeStore(uid);
    makeFirestoreMock(store, uid);
    const [dateKey] = nextMonthDateKeys([1]);
    await expect(
      callSubmit(uid, {
        ...extra,
        shifts: [{ dateKey, startMinute: 600, endMinute: 720 }],
      }),
    ).rejects.toMatchObject({
      details: expect.objectContaining({ errorKey: 'SHIFT_SUBMIT_NONCE_REQUIRED' }),
    });
  });

  it('rejects empty shifts', async () => {
    const store = makeStore(uid);
    makeFirestoreMock(store, uid);
    await expect(callSubmit(uid, { clientNonce: 'n-empty', shifts: [] })).rejects.toMatchObject({
      details: expect.objectContaining({ errorKey: 'SHIFT_INVALID_ARGUMENT' }),
    });
  });

  it('rejects non-array shifts', async () => {
    const store = makeStore(uid);
    makeFirestoreMock(store, uid);
    await expect(
      callSubmit(uid, { clientNonce: 'n-na', shifts: { dateKey: 'x' } }),
    ).rejects.toMatchObject({
      details: expect.objectContaining({ errorKey: 'SHIFT_INVALID_ARGUMENT' }),
    });
  });

  it('rejects duplicate dateKey', async () => {
    const store = makeStore(uid);
    makeFirestoreMock(store, uid);
    const [dateKey] = nextMonthDateKeys([1]);
    await expect(
      callSubmit(uid, {
        clientNonce: 'n-dup',
        shifts: [
          { dateKey, startMinute: 600, endMinute: 720 },
          { dateKey, startMinute: 720, endMinute: 840 },
        ],
      }),
    ).rejects.toMatchObject({
      details: expect.objectContaining({ errorKey: 'SHIFT_INVALID_ARGUMENT' }),
    });
  });

  it('rejects start >= end / non-hour / >1440 / wrong month', async () => {
    const store = makeStore(uid);
    makeFirestoreMock(store, uid);
    const [dateKey] = nextMonthDateKeys([1]);

    await expect(
      callSubmit(uid, {
        clientNonce: 'n-ge',
        shifts: [{ dateKey, startMinute: 720, endMinute: 720 }],
      }),
    ).rejects.toMatchObject({
      details: expect.objectContaining({ errorKey: 'SHIFT_INVALID_ARGUMENT' }),
    });

    await expect(
      callSubmit(uid, {
        clientNonce: 'n-step',
        shifts: [{ dateKey, startMinute: 610, endMinute: 720 }],
      }),
    ).rejects.toMatchObject({
      details: expect.objectContaining({ errorKey: 'SHIFT_INVALID_ARGUMENT' }),
    });

    await expect(
      callSubmit(uid, {
        clientNonce: 'n-1441',
        shifts: [{ dateKey, startMinute: 600, endMinute: 1500 }],
      }),
    ).rejects.toMatchObject({
      details: expect.objectContaining({ errorKey: 'SHIFT_INVALID_ARGUMENT' }),
    });

    await expect(
      callSubmit(uid, {
        clientNonce: 'n-month',
        shifts: [{ dateKey: '2020-01-01', startMinute: 600, endMinute: 720 }],
      }),
    ).rejects.toMatchObject({
      details: expect.objectContaining({ errorKey: 'SHIFT_NOT_NEXT_MONTH' }),
    });
  });

  it('rejects closed day and outside BH', async () => {
    const store = makeStore(uid);
    const [d1, d2] = nextMonthDateKeys([1, 2]);
    const ym = getJstNextYearMonth();
    store.days.set(`${ym}/${d1}`, {
      businessHours: defaultBh({ isClosed: true }),
      pendingRequestCount: 0,
    });
    store.days.set(`${ym}/${d2}`, {
      businessHours: defaultBh({ openMinute: 600, closeMinute: 720 }),
      pendingRequestCount: 0,
    });
    makeFirestoreMock(store, uid);

    await expect(
      callSubmit(uid, {
        clientNonce: 'n-closed',
        shifts: [{ dateKey: d1, startMinute: 600, endMinute: 720 }],
      }),
    ).rejects.toMatchObject({
      details: expect.objectContaining({ errorKey: 'SHIFT_BUSINESS_DAY_CLOSED' }),
    });

    await expect(
      callSubmit(uid, {
        clientNonce: 'n-outside',
        shifts: [{ dateKey: d2, startMinute: 540, endMinute: 780 }],
      }),
    ).rejects.toMatchObject({
      details: expect.objectContaining({ errorKey: 'SHIFT_TIME_OUTSIDE_BUSINESS_HOURS' }),
    });
  });

  it('rejects missing day BH as unavailable', async () => {
    const store = makeStore(uid);
    const [d1] = nextMonthDateKeys([1]);
    const ym = getJstNextYearMonth();
    store.days.delete(`${ym}/${d1}`);
    makeFirestoreMock(store, uid);
    await expect(
      callSubmit(uid, {
        clientNonce: 'n-miss',
        shifts: [{ dateKey: d1, startMinute: 600, endMinute: 720 }],
      }),
    ).rejects.toMatchObject({
      details: expect.objectContaining({ errorKey: 'SHIFT_BUSINESS_HOURS_UNAVAILABLE' }),
    });
  });

  it('creates multiple new requests and bumps pendingRequestCount', async () => {
    const store = makeStore(uid);
    makeFirestoreMock(store, uid);
    const [d1, d2] = nextMonthDateKeys([1, 2]);
    const ym = getJstNextYearMonth();

    const result = await callSubmit(uid, {
      clientNonce: 'n-create-multi',
      shifts: [
        { dateKey: d2, startMinute: 600, endMinute: 720 },
        { dateKey: d1, startMinute: 660, endMinute: 780 },
      ],
    });

    expect(result.success).toBe(true);
    expect(result.data.reused).toBe(false);
    expect(result.data.submittedCount).toBe(2);
    expect(result.data.createdCount).toBe(2);
    expect(result.data.updatedCount).toBe(0);
    expect(result.data.yearMonth).toBe(ym);
    expect(result.data.requests.map((r: any) => r.dateKey)).toEqual([d1, d2]);
    expect(store.shiftRequests.get(`${uid}_${d1}`)?.status).toBe('pending');
    expect(store.days.get(`${ym}/${d1}`)?.pendingRequestCount).toBe(1);
    expect(store.days.get(`${ym}/${d2}`)?.pendingRequestCount).toBe(1);
  });

  it('updates existing pending and keeps original minutes + pendingCount', async () => {
    const store = makeStore(uid);
    const [d1] = nextMonthDateKeys([1]);
    const ym = getJstNextYearMonth();
    store.shiftRequests.set(`${uid}_${d1}`, {
      requestId: `${uid}_${d1}`,
      staffId: uid,
      status: 'pending',
      dateKey: d1,
      yearMonth: ym,
      startMinute: 600,
      endMinute: 720,
      originalStartMinute: 600,
      originalEndMinute: 720,
    });
    store.days.set(`${ym}/${d1}`, {
      businessHours: defaultBh(),
      pendingRequestCount: 3,
    });
    makeFirestoreMock(store, uid);

    const result = await callSubmit(uid, {
      clientNonce: 'n-upd',
      shifts: [{ dateKey: d1, startMinute: 660, endMinute: 780 }],
    });

    expect(result.data.createdCount).toBe(0);
    expect(result.data.updatedCount).toBe(1);
    const doc = store.shiftRequests.get(`${uid}_${d1}`)!;
    expect(doc.startMinute).toBe(660);
    expect(doc.endMinute).toBe(780);
    expect(doc.originalStartMinute).toBe(600);
    expect(doc.originalEndMinute).toBe(720);
    expect(store.days.get(`${ym}/${d1}`)?.pendingRequestCount).toBe(3);
  });

  it('mixed create+update succeeds atomically', async () => {
    const store = makeStore(uid);
    const [d1, d2, d3] = nextMonthDateKeys([1, 2, 3]);
    const ym = getJstNextYearMonth();
    store.shiftRequests.set(`${uid}_${d1}`, {
      requestId: `${uid}_${d1}`,
      staffId: uid,
      status: 'pending',
      dateKey: d1,
      yearMonth: ym,
      startMinute: 600,
      endMinute: 720,
      originalStartMinute: 600,
      originalEndMinute: 720,
    });
    store.days.set(`${ym}/${d1}`, { businessHours: defaultBh(), pendingRequestCount: 1 });
    store.days.set(`${ym}/${d2}`, { businessHours: defaultBh(), pendingRequestCount: 0 });
    store.days.set(`${ym}/${d3}`, { businessHours: defaultBh(), pendingRequestCount: 0 });
    makeFirestoreMock(store, uid);

    const result = await callSubmit(uid, {
      clientNonce: 'n-mixed',
      shifts: [
        { dateKey: d1, startMinute: 660, endMinute: 780 },
        { dateKey: d2, startMinute: 600, endMinute: 720 },
        { dateKey: d3, startMinute: 600, endMinute: 840 },
      ],
    });

    expect(result.data.createdCount).toBe(2);
    expect(result.data.updatedCount).toBe(1);
    expect(store.days.get(`${ym}/${d1}`)?.pendingRequestCount).toBe(1);
    expect(store.days.get(`${ym}/${d2}`)?.pendingRequestCount).toBe(1);
    expect(store.days.get(`${ym}/${d3}`)?.pendingRequestCount).toBe(1);
  });

  it('rolls back all when one existing status is not editable', async () => {
    const store = makeStore(uid);
    const [d1, d2] = nextMonthDateKeys([1, 2]);
    const ym = getJstNextYearMonth();
    store.shiftRequests.set(`${uid}_${d2}`, {
      requestId: `${uid}_${d2}`,
      staffId: uid,
      status: 'interim_confirmed',
      dateKey: d2,
      yearMonth: ym,
      startMinute: 600,
      endMinute: 720,
    });
    store.days.set(`${ym}/${d1}`, { businessHours: defaultBh(), pendingRequestCount: 0 });
    store.days.set(`${ym}/${d2}`, { businessHours: defaultBh(), pendingRequestCount: 1 });
    makeFirestoreMock(store, uid);

    await expect(
      callSubmit(uid, {
        clientNonce: 'n-rollback',
        shifts: [
          { dateKey: d1, startMinute: 600, endMinute: 720 },
          { dateKey: d2, startMinute: 660, endMinute: 780 },
        ],
      }),
    ).rejects.toMatchObject({
      details: expect.objectContaining({ errorKey: 'SHIFT_REQUEST_ALREADY_CONFIRMED' }),
    });

    expect(store.shiftRequests.has(`${uid}_${d1}`)).toBe(false);
    expect(store.days.get(`${ym}/${d1}`)?.pendingRequestCount).toBe(0);
    expect(store.mutationRequests.size).toBe(0);
  });

  it.each(['interim_confirmed', 'final_confirmed', 'confirmed', 'declined', 'weird'])(
    'rejects non-editable status %s',
    async (status) => {
      const store = makeStore(uid);
      const [d1] = nextMonthDateKeys([1]);
      const ym = getJstNextYearMonth();
      store.shiftRequests.set(`${uid}_${d1}`, {
        requestId: `${uid}_${d1}`,
        staffId: uid,
        status,
        dateKey: d1,
        yearMonth: ym,
        startMinute: 600,
        endMinute: 720,
      });
      makeFirestoreMock(store, uid);

      try {
        await callSubmit(uid, {
          clientNonce: `n-status-${status}`,
          shifts: [{ dateKey: d1, startMinute: 660, endMinute: 780 }],
        });
        fail('expected reject');
      } catch (e) {
        const key = errKey(e);
        expect(
          key === 'SHIFT_REQUEST_ALREADY_CONFIRMED' || key === 'SHIFT_REQUEST_NOT_EDITABLE',
        ).toBe(true);
      }
      expect(store.shiftRequests.get(`${uid}_${d1}`)?.startMinute).toBe(600);
    },
  );

  it('same nonce same payload → reused (no second write)', async () => {
    const store = makeStore(uid);
    makeFirestoreMock(store, uid);
    const [d1] = nextMonthDateKeys([1]);
    const ym = getJstNextYearMonth();
    const payload = {
      clientNonce: 'n-reuse',
      shifts: [{ dateKey: d1, startMinute: 600, endMinute: 720 }],
    };

    const first = await callSubmit(uid, payload);
    expect(first.data.reused).toBe(false);
    const updatedAt1 = store.shiftRequests.get(`${uid}_${d1}`)?.updatedAt;
    const count1 = store.days.get(`${ym}/${d1}`)?.pendingRequestCount;

    store.shiftRequests.get(`${uid}_${d1}`)!.startMinute = 999; // would be overwritten if rewrite

    const second = await callSubmit(uid, payload);
    expect(second.data.reused).toBe(true);
    expect(second.data.submittedCount).toBe(1);
    expect(store.shiftRequests.get(`${uid}_${d1}`)?.startMinute).toBe(999);
    expect(store.days.get(`${ym}/${d1}`)?.pendingRequestCount).toBe(count1);
    expect(store.shiftRequests.get(`${uid}_${d1}`)?.updatedAt).toBe(updatedAt1);
  });

  it('same nonce reordered payload → reused', async () => {
    const store = makeStore(uid);
    makeFirestoreMock(store, uid);
    const [d1, d2] = nextMonthDateKeys([1, 2]);

    await callSubmit(uid, {
      clientNonce: 'n-reorder',
      shifts: [
        { dateKey: d1, startMinute: 600, endMinute: 720 },
        { dateKey: d2, startMinute: 660, endMinute: 780 },
      ],
    });

    const second = await callSubmit(uid, {
      clientNonce: 'n-reorder',
      shifts: [
        { dateKey: d2, startMinute: 660, endMinute: 780 },
        { dateKey: d1, startMinute: 600, endMinute: 720 },
      ],
    });
    expect(second.data.reused).toBe(true);
  });

  it('same nonce different payload → conflict', async () => {
    const store = makeStore(uid);
    makeFirestoreMock(store, uid);
    const [d1, d2] = nextMonthDateKeys([1, 2]);

    await callSubmit(uid, {
      clientNonce: 'n-conflict',
      shifts: [{ dateKey: d1, startMinute: 600, endMinute: 720 }],
    });

    await expect(
      callSubmit(uid, {
        clientNonce: 'n-conflict',
        shifts: [{ dateKey: d1, startMinute: 660, endMinute: 780 }],
      }),
    ).rejects.toMatchObject({
      details: expect.objectContaining({ errorKey: 'SHIFT_SUBMIT_NONCE_CONFLICT' }),
    });

    await expect(
      callSubmit(uid, {
        clientNonce: 'n-conflict',
        shifts: [{ dateKey: d2, startMinute: 600, endMinute: 720 }],
      }),
    ).rejects.toMatchObject({
      details: expect.objectContaining({ errorKey: 'SHIFT_SUBMIT_NONCE_CONFLICT' }),
    });
  });

  it('period② without notification → restricted; insufficient required', async () => {
    const store = makeStore(uid);
    makeFirestoreMock(store, uid);
    const [d1] = nextMonthDateKeys([1]);
    (isInShiftSchedulingPeriod as jest.Mock).mockReturnValue(true);
    (isInsufficientDaysNotificationSent as jest.Mock).mockResolvedValue(false);

    await expect(
      callSubmit(uid, {
        clientNonce: 'n-p2a',
        shifts: [{ dateKey: d1, startMinute: 600, endMinute: 720 }],
      }),
    ).rejects.toMatchObject({
      details: expect.objectContaining({ errorKey: 'SHIFT_SCHEDULING_PERIOD_RESTRICTED' }),
    });

    (isInsufficientDaysNotificationSent as jest.Mock).mockResolvedValue(true);
    (isInsufficientDayOrTimeSlot as jest.Mock).mockResolvedValue(false);
    await expect(
      callSubmit(uid, {
        clientNonce: 'n-p2b',
        shifts: [{ dateKey: d1, startMinute: 600, endMinute: 720 }],
      }),
    ).rejects.toMatchObject({
      details: expect.objectContaining({ errorKey: 'SHIFT_DATE_NOT_INSUFFICIENT' }),
    });
  });

  it('month finalized → SHIFT_MONTH_FINALIZED', async () => {
    const store = makeStore(uid);
    const ym = getJstNextYearMonth();
    store.months.set(ym, { allDaysFinalized: true });
    makeFirestoreMock(store, uid);
    const [d1] = nextMonthDateKeys([1]);
    await expect(
      callSubmit(uid, {
        clientNonce: 'n-fin',
        shifts: [{ dateKey: d1, startMinute: 600, endMinute: 720 }],
      }),
    ).rejects.toMatchObject({
      details: expect.objectContaining({ errorKey: 'SHIFT_MONTH_FINALIZED' }),
    });
  });
});

describe('getShifts (L6-A)', () => {
  const uid = 'staff-uid-get';

  afterEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
    (isInsufficientDaysNotificationSent as jest.Mock).mockResolvedValue(false);
  });

  it('rejects unauthenticated', async () => {
    await expect(callGet(undefined)).rejects.toMatchObject({
      details: expect.objectContaining({ errorKey: 'SHIFT_UNAUTHENTICATED' }),
    });
  });

  it('rejects client userId', async () => {
    const store = makeStore(uid);
    makeFirestoreMock(store, uid);
    await expect(callGet(uid, { userId: uid })).rejects.toMatchObject({
      details: expect.objectContaining({ errorKey: 'SHIFT_INVALID_ARGUMENT' }),
    });
  });

  it('returns own shifts with strict shape; normal empty', async () => {
    const store = makeStore(uid);
    const ym = getJstNextYearMonth();
    const [d1] = nextMonthDateKeys([1]);
    store.days.set(`${ym}/${d1}`, {
      businessHours: defaultBh(),
      pendingRequestCount: 0,
      assignments: [
        {
          staffId: uid,
          startMinute: 600,
          endMinute: 720,
          sourceRequestId: `${uid}_${d1}`,
        },
        {
          staffId: 'other',
          startMinute: 600,
          endMinute: 720,
          sourceRequestId: 'other_x',
        },
      ],
    });
    store.shiftRequests.set(`${uid}_${d1}`, {
      staffId: uid,
      status: 'pending',
      dateKey: d1,
      startMinute: 660,
      endMinute: 780,
    });
    // pending hidden when assignment already same? different times → both
    // notification not sent → pending shown; but assignment exists for same day different time
    makeFirestoreMock(store, uid);

    const result = await callGet(uid);
    expect(result.success).toBe(true);
    expect(result.data.count).toBe(result.data.shifts.length);
    expect(result.data.shifts.every((s: any) => s.dateKey && typeof s.startMinute === 'number')).toBe(
      true,
    );
    expect(result.data.shifts.some((s: any) => s.source === 'assignment' && s.confirmed === true)).toBe(
      true,
    );
    expect(result.data.shifts.every((s: any) => s.staffId === undefined)).toBe(true);

    // empty case
    const emptyStore = makeStore(uid);
    emptyStore.days.clear();
    makeFirestoreMock(emptyStore, uid);
    const empty = await callGet(uid);
    expect(empty.success).toBe(true);
    expect(empty.data.shifts).toEqual([]);
    expect(empty.data.count).toBe(0);
  });

  it('rejects retired', async () => {
    const store = makeStore(uid);
    store.staff = { uid, status: 'retired' };
    makeFirestoreMock(store, uid);
    await expect(callGet(uid)).rejects.toMatchObject({
      details: expect.objectContaining({ errorKey: 'STAFF_RETIRED' }),
    });
  });
});

describe('CLN-F2 confirmShiftRequest removed (L6-A)', () => {
  it('production source and staff LIFF caller are gone', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const fs = require('fs');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const path = require('path');
    const callablePath = path.join(
      __dirname,
      '../../src/domains/staff/callables/confirmShiftRequest.ts',
    );
    expect(fs.existsSync(callablePath)).toBe(false);

    const staffIndex = fs.readFileSync(
      path.join(__dirname, '../../src/domains/staff/index.ts'),
      'utf8',
    );
    expect(staffIndex).not.toMatch(/confirmShiftRequest/);

    const staffHtml = fs.readFileSync(
      path.join(__dirname, '../../../public/staff/index.html'),
      'utf8',
    );
    expect(staffHtml).not.toMatch(/confirmShiftRequest/);
    expect(staffHtml).not.toMatch(/#shift\?requestId/);
    expect(staffHtml).not.toMatch(/urlParams\.get\(['"]requestId['"]\)/);
  });
});
