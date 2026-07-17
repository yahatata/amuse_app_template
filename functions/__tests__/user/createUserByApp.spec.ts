jest.mock('../../src/shared/devices', () => ({
  getCallerDeviceByUid: jest.fn(),
  isActive: jest.fn(),
}));

jest.mock('../../src/domains/user/services/logUtils', () => ({
  initializeUserLogs: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('qrcode', () => ({
  toBuffer: jest.fn().mockResolvedValue(Buffer.from('qr')),
}));

import * as admin from 'firebase-admin';
import { getCallerDeviceByUid, isActive } from '../../src/shared/devices';
import { createUserByApp } from '../../src/domains/user/callables/createUserByApp';

describe('createUserByApp (A-6 Phase 1)', () => {
  const adminUid = 'admin-device-uid';
  const createdUid = 'store-user-uid-001';
  let setPayload: Record<string, unknown> | null = null;
  let pokerNameQueryEmpty = true;

  beforeEach(() => {
    jest.clearAllMocks();
    setPayload = null;
    pokerNameQueryEmpty = true;

    (getCallerDeviceByUid as jest.Mock).mockResolvedValue({
      id: 'device-1',
      role: 'admin',
      status: 'active',
    });
    (isActive as jest.Mock).mockReturnValue(true);

    jest.spyOn(admin.auth(), 'createUser').mockResolvedValue({
      uid: createdUid,
    } as admin.auth.UserRecord);

    jest.spyOn(admin.storage(), 'bucket').mockReturnValue({
      file: jest.fn().mockReturnValue({
        save: jest.fn().mockResolvedValue(undefined),
        getSignedUrl: jest.fn().mockResolvedValue(['https://example.com/qr.png']),
      }),
    } as unknown as ReturnType<admin.storage.Storage['bucket']>);

    jest.spyOn(admin.firestore(), 'collection').mockImplementation((name: string) => {
      if (name !== 'users') {
        throw new Error(`unexpected collection: ${name}`);
      }
      return {
        doc: jest.fn().mockReturnValue({
          set: jest.fn().mockImplementation(async (payload: Record<string, unknown>) => {
            setPayload = payload;
          }),
          update: jest.fn().mockResolvedValue(undefined),
        }),
        where: jest.fn().mockReturnValue({
          limit: jest.fn().mockReturnValue({
            get: jest.fn().mockResolvedValue({empty: pokerNameQueryEmpty}),
          }),
        }),
      } as unknown as admin.firestore.CollectionReference;
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  function callCreate(options: {
    auth?: {uid: string} | null;
    data?: Record<string, unknown>;
  } = {}) {
    const auth =
      options.auth === null
        ? undefined
        : {uid: options.auth?.uid ?? adminUid, token: {} as never};
    return (createUserByApp as any).run({
      data: {
        pokerName: 'StorePoker',
        email: 'store@example.com',
        pin: '5678',
        birthMonthDay: '0315',
        ...options.data,
      },
      auth,
      rawRequest: {} as never,
      acceptsStreaming: false,
    });
  }

  it('rejects when auth is missing with UNAUTHENTICATED', async () => {
    await expect(callCreate({auth: null})).rejects.toMatchObject({
      code: 'unauthenticated',
      details: expect.objectContaining({errorKey: 'UNAUTHENTICATED'}),
    });
  });

  it('rejects when device is missing with PERMISSION_DENIED', async () => {
    (getCallerDeviceByUid as jest.Mock).mockResolvedValue(null);

    await expect(callCreate()).rejects.toMatchObject({
      code: 'permission-denied',
      details: expect.objectContaining({errorKey: 'PERMISSION_DENIED'}),
    });
  });

  it('rejects when device is inactive/archived with PERMISSION_DENIED', async () => {
    (getCallerDeviceByUid as jest.Mock).mockResolvedValue({
      id: 'device-1',
      role: 'admin',
      status: 'archived',
    });
    (isActive as jest.Mock).mockReturnValue(false);

    await expect(callCreate()).rejects.toMatchObject({
      code: 'permission-denied',
      details: expect.objectContaining({errorKey: 'PERMISSION_DENIED'}),
    });
  });

  it('rejects when device role is not admin with PERMISSION_DENIED', async () => {
    (getCallerDeviceByUid as jest.Mock).mockResolvedValue({
      id: 'device-1',
      role: 'terminal',
      status: 'active',
    });

    await expect(callCreate()).rejects.toMatchObject({
      code: 'permission-denied',
      details: expect.objectContaining({errorKey: 'PERMISSION_DENIED'}),
    });
  });

  it('saves userType: store_managed and isMigrated: false for active admin', async () => {
    const result = await callCreate();
    expect(result.success).toBe(true);
    expect(result.uid).toBe(createdUid);
    expect(setPayload?.userType).toBe('store_managed');
    expect(setPayload?.isMigrated).toBe(false);
  });

  it('rejects duplicate pokerName', async () => {
    pokerNameQueryEmpty = false;
    await expect(callCreate()).rejects.toMatchObject({
      code: 'already-exists',
    });
  });
});
