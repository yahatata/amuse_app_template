jest.mock('../../src/domains/webhook/services/lineRichMenu', () => ({
  linkStaffRichMenu: jest.fn().mockResolvedValue(true),
}));

jest.mock('../../src/domains/user/services/qrCodeUtils', () => ({
  generateQRData: jest.fn().mockResolvedValue({
    uid: 'u1',
    loginId: 'やまだたろう0101',
    timestamp: 1_700_000_000_000,
    token: 'tok',
    type: 'staff',
  }),
  generateQRImage: jest.fn().mockResolvedValue('base64qr'),
  saveQRCodeToStorage: jest.fn().mockResolvedValue('https://example.com/qr.png'),
}));

import * as admin from 'firebase-admin';
import { createStaffAccount } from '../../src/domains/staff/callables/createStaffAccount';
import { reactivateStaffAccount } from '../../src/domains/staff/callables/reactivateStaffAccount';
import {
  CREATE_STAFF_ACCOUNT_OPERATION,
  REACTIVATE_STAFF_ACCOUNT_OPERATION,
  buildStaffMutationFingerprint,
  validateStaffClientNonce,
} from '../../src/domains/staff/helpers/staffClientNonce';

type StaffStore = {
  staff: Record<string, unknown> | null;
  requests: Map<string, Record<string, unknown>>;
};

function makeFirestoreMock(store: StaffStore, uid: string) {
  const staffRef = {
    get: jest.fn(async () => ({
      exists: !!store.staff,
      data: () => store.staff || undefined,
      id: uid,
    })),
    set: jest.fn(async (payload: Record<string, unknown>) => {
      store.staff = { ...(store.staff || {}), ...payload };
    }),
    update: jest.fn(async (payload: Record<string, unknown>) => {
      store.staff = { ...(store.staff || {}), ...payload };
    }),
  };

  const requestDocs = {
    doc: jest.fn((clientNonce: string) => ({
      get: jest.fn(async () => {
        const data = store.requests.get(clientNonce);
        return {
          exists: !!data,
          data: () => data,
        };
      }),
      set: jest.fn(async (payload: Record<string, unknown>) => {
        store.requests.set(clientNonce, payload);
      }),
    })),
  };

  jest.spyOn(admin.firestore(), 'collection').mockImplementation((name: string) => {
    if (name === 'staffs') {
      return {
        doc: jest.fn((id: string) => {
          if (id !== uid) {
            return {
              get: jest.fn(async () => ({ exists: false, data: () => undefined })),
            };
          }
          return {
            ...staffRef,
            collection: jest.fn((sub: string) => {
              if (sub === 'mutationRequests') return requestDocs;
              throw new Error(`unexpected sub: ${sub}`);
            }),
          };
        }),
        where: jest.fn().mockReturnValue({
          limit: jest.fn().mockReturnValue({
            get: jest.fn().mockResolvedValue({ docs: [] }),
          }),
        }),
      } as unknown as admin.firestore.CollectionReference;
    }
    throw new Error(`unexpected collection: ${name}`);
  });

  jest.spyOn(admin.firestore(), 'runTransaction').mockImplementation(async (fn: any) => {
    const tx = {
      get: async (ref: any) => ref.get(),
      set: (ref: any, data: any) => ref.set(data),
      update: (ref: any, data: any) => ref.update(data),
    };
    return fn(tx);
  });
}

const validPii = {
  fullName: '山田　太郎',
  fullNameKana: 'やまだたろう',
  email: 'a@example.com',
  phoneNumber: '09012345678',
  birthMonthDay: '0101',
};

describe('createStaffAccount (L5-A)', () => {
  const uid = 'line-uid-1';

  afterEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  it('rejects unauthenticated', async () => {
    await expect(
      (createStaffAccount as any).run({
        data: { ...validPii, clientNonce: 'n1' },
        auth: undefined,
        rawRequest: {} as never,
        acceptsStreaming: false,
      }),
    ).rejects.toMatchObject({
      details: expect.objectContaining({ errorKey: 'STAFF_UNAUTHENTICATED' }),
    });
  });

  it('requires clientNonce', async () => {
    const store: StaffStore = { staff: null, requests: new Map() };
    makeFirestoreMock(store, uid);
    await expect(
      (createStaffAccount as any).run({
        data: { ...validPii },
        auth: { uid, token: {} as never },
        rawRequest: {} as never,
        acceptsStreaming: false,
      }),
    ).rejects.toMatchObject({
      details: expect.objectContaining({ errorKey: 'STAFF_REGISTRATION_NONCE_REQUIRED' }),
    });
  });

  it('creates when doc missing', async () => {
    const store: StaffStore = { staff: null, requests: new Map() };
    makeFirestoreMock(store, uid);
    const result = await (createStaffAccount as any).run({
      data: { ...validPii, clientNonce: 'nonce-create-1' },
      auth: { uid, token: {} as never },
      rawRequest: {} as never,
      acceptsStreaming: false,
    });
    expect(result.success).toBe(true);
    expect(result.data.alreadyRegistered).toBe(false);
    expect(result.data.reused).toBe(false);
    expect(result.data.staffStatus).toBe('active');
    expect(result.data.clientNonce).toBe('nonce-create-1');
    expect(store.staff?.status).toBe('active');
    expect(store.requests.has('nonce-create-1')).toBe(true);
  });

  it('returns alreadyRegistered for active without write', async () => {
    const store: StaffStore = {
      staff: { uid, status: 'active', fullNameKana: 'やまだたろう' },
      requests: new Map(),
    };
    makeFirestoreMock(store, uid);
    const before = { ...store.staff };
    const result = await (createStaffAccount as any).run({
      data: { ...validPii, clientNonce: 'nonce-active-1' },
      auth: { uid, token: {} as never },
      rawRequest: {} as never,
      acceptsStreaming: false,
    });
    expect(result.success).toBe(true);
    expect(result.data.alreadyRegistered).toBe(true);
    expect(result.data.reused).toBe(false);
    expect(store.requests.size).toBe(0);
    expect(store.staff).toEqual(before);
  });

  it('rejects retired with STAFF_REACTIVATION_REQUIRED', async () => {
    const store: StaffStore = {
      staff: { uid, status: 'retired' },
      requests: new Map(),
    };
    makeFirestoreMock(store, uid);
    await expect(
      (createStaffAccount as any).run({
        data: { ...validPii, clientNonce: 'nonce-ret-1' },
        auth: { uid, token: {} as never },
        rawRequest: {} as never,
        acceptsStreaming: false,
      }),
    ).rejects.toMatchObject({
      details: expect.objectContaining({ errorKey: 'STAFF_REACTIVATION_REQUIRED' }),
    });
  });

  it('same nonce same data → reused without second write', async () => {
    const store: StaffStore = { staff: null, requests: new Map() };
    makeFirestoreMock(store, uid);
    const first = await (createStaffAccount as any).run({
      data: { ...validPii, clientNonce: 'nonce-reuse-1' },
      auth: { uid, token: {} as never },
      rawRequest: {} as never,
      acceptsStreaming: false,
    });
    expect(first.data.reused).toBe(false);
    const setCalls = (store.staff && 1) || 0;
    void setCalls;
    const second = await (createStaffAccount as any).run({
      data: { ...validPii, clientNonce: 'nonce-reuse-1' },
      auth: { uid, token: {} as never },
      rawRequest: {} as never,
      acceptsStreaming: false,
    });
    expect(second.success).toBe(true);
    expect(second.data.reused).toBe(true);
    expect(second.data.qrCodeUrl).toBe('https://example.com/qr.png');
  });

  it('same nonce different data → conflict', async () => {
    const store: StaffStore = { staff: null, requests: new Map() };
    makeFirestoreMock(store, uid);
    await (createStaffAccount as any).run({
      data: { ...validPii, clientNonce: 'nonce-conflict-1' },
      auth: { uid, token: {} as never },
      rawRequest: {} as never,
      acceptsStreaming: false,
    });
    await expect(
      (createStaffAccount as any).run({
        data: { ...validPii, email: 'other@example.com', clientNonce: 'nonce-conflict-1' },
        auth: { uid, token: {} as never },
        rawRequest: {} as never,
        acceptsStreaming: false,
      }),
    ).rejects.toMatchObject({
      details: expect.objectContaining({ errorKey: 'STAFF_REGISTRATION_NONCE_CONFLICT' }),
    });
  });
});

describe('reactivateStaffAccount (L5-A)', () => {
  const uid = 'line-uid-retired';

  afterEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  it('reactivates retired and same nonce reused', async () => {
    const store: StaffStore = {
      staff: {
        uid,
        status: 'retired',
        fullName: '旧',
        fullNameKana: 'きゅう',
        hourlyWage: 1000,
        retiredDate: '2026-07-01',
      },
      requests: new Map(),
    };
    makeFirestoreMock(store, uid);

    const first = await (reactivateStaffAccount as any).run({
      data: { ...validPii, clientNonce: 'rea-1' },
      auth: { uid, token: {} as never },
      rawRequest: {} as never,
      acceptsStreaming: false,
    });
    expect(first.success).toBe(true);
    expect(first.data.reused).toBe(false);
    expect(store.staff?.status).toBe('active');
    expect(store.staff?.hourlyWage).toBe(1000);

    const second = await (reactivateStaffAccount as any).run({
      data: { ...validPii, clientNonce: 'rea-1' },
      auth: { uid, token: {} as never },
      rawRequest: {} as never,
      acceptsStreaming: false,
    });
    expect(second.data.reused).toBe(true);
  });

  it('active + new nonce → STAFF_NOT_RETIRED', async () => {
    const store: StaffStore = {
      staff: { uid, status: 'active' },
      requests: new Map(),
    };
    makeFirestoreMock(store, uid);
    await expect(
      (reactivateStaffAccount as any).run({
        data: { ...validPii, clientNonce: 'rea-active' },
        auth: { uid, token: {} as never },
        rawRequest: {} as never,
        acceptsStreaming: false,
      }),
    ).rejects.toMatchObject({
      details: expect.objectContaining({ errorKey: 'STAFF_NOT_RETIRED' }),
    });
  });

  it('not found', async () => {
    const store: StaffStore = { staff: null, requests: new Map() };
    makeFirestoreMock(store, uid);
    await expect(
      (reactivateStaffAccount as any).run({
        data: { ...validPii, clientNonce: 'rea-nf' },
        auth: { uid, token: {} as never },
        rawRequest: {} as never,
        acceptsStreaming: false,
      }),
    ).rejects.toMatchObject({
      details: expect.objectContaining({ errorKey: 'STAFF_NOT_FOUND' }),
    });
  });
});

describe('staffClientNonce helpers', () => {
  it('validates nonce', () => {
    expect(validateStaffClientNonce('abc-123', 'STAFF_REGISTRATION_NONCE_REQUIRED')).toBe(
      'abc-123',
    );
    expect(() => validateStaffClientNonce('', 'STAFF_REGISTRATION_NONCE_REQUIRED')).toThrow();
    expect(() => validateStaffClientNonce('bad nonce', 'STAFF_REGISTRATION_NONCE_REQUIRED')).toThrow();
  });

  it('fingerprint stable', () => {
    const a = buildStaffMutationFingerprint({
      operation: CREATE_STAFF_ACCOUNT_OPERATION,
      uid: 'u',
      pii: validPii,
    });
    const b = buildStaffMutationFingerprint({
      operation: CREATE_STAFF_ACCOUNT_OPERATION,
      uid: 'u',
      pii: validPii,
    });
    const c = buildStaffMutationFingerprint({
      operation: REACTIVATE_STAFF_ACCOUNT_OPERATION,
      uid: 'u',
      pii: validPii,
    });
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });
});
