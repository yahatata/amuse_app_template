jest.mock('../../src/domains/user/services/qrCodeUtils', () => ({
  generateQRData: jest.fn().mockImplementation(async (uid: string, loginId: string, type: string) => ({
    uid,
    loginId,
    timestamp: 1_700_000_000_000,
    token: 'secure-token',
    type,
  })),
  generateQRImage: jest.fn().mockResolvedValue('data:image/png;base64,AAA'),
  saveQRCodeToStorage: jest.fn().mockResolvedValue('https://example.com/qr.png'),
}));

import * as admin from 'firebase-admin';
import { generateQRCode } from '../../src/domains/user/callables/generateQRCode';

describe('generateQRCode (L5-A)', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  function mockDocs(params: {
    staff?: Record<string, unknown> | null;
    user?: Record<string, unknown> | null;
  }) {
    jest.spyOn(admin.firestore(), 'collection').mockImplementation((name: string) => {
      return {
        doc: jest.fn((id: string) => ({
          get: jest.fn(async (): Promise<{
            exists: boolean;
            data: () => Record<string, unknown> | undefined;
            get: (field: string) => unknown;
          }> => {
            if (name === 'staffs') {
              const data = params.staff;
              return {
                exists: !!data,
                data: () => data || undefined,
                get: () => undefined,
              };
            }
            if (name === 'users') {
              const data = params.user;
              return {
                exists: !!data,
                data: () => data || undefined,
                get: () => undefined,
              };
            }
            return { exists: false, data: () => undefined, get: () => undefined };
          }),
          id,
        })),
      } as unknown as admin.firestore.CollectionReference;
    });

    jest.spyOn(admin.firestore(), 'runTransaction').mockImplementation(async (fn: any) => {
      const snap = {
        get: (field: string) => (field === 'qrExpiresAtMs' ? 0 : undefined),
      };
      const tx = {
        get: async () => snap,
        update: jest.fn(),
      };
      return fn(tx);
    });
  }

  it('rejects unauthenticated', async () => {
    await expect(
      (generateQRCode as any).run({
        data: { type: 'user' },
        auth: undefined,
        rawRequest: {} as never,
        acceptsStreaming: false,
      }),
    ).rejects.toMatchObject({
      details: expect.objectContaining({ errorKey: 'QR_UNAUTHENTICATED' }),
    });
  });

  it('rejects invalid type', async () => {
    await expect(
      (generateQRCode as any).run({
        data: { type: 'admin' },
        auth: { uid: 'u1', token: {} as never },
        rawRequest: {} as never,
        acceptsStreaming: false,
      }),
    ).rejects.toMatchObject({
      details: expect.objectContaining({ errorKey: 'QR_INVALID_TYPE' }),
    });
  });

  it('user success keeps L2 fields and adds success', async () => {
    mockDocs({
      user: { loginId: 'login1' },
      staff: null,
    });
    const result = await (generateQRCode as any).run({
      data: { type: 'user' },
      auth: { uid: 'user-1', token: {} as never },
      rawRequest: {} as never,
      acceptsStreaming: false,
    });
    expect(result.success).toBe(true);
    expect(typeof result.qrCode).toBe('string');
    expect(typeof result.qrCodeUrl).toBe('string');
    expect(typeof result.expiresAt).toBe('number');
    expect(result.expiresAtMs).toBe(result.expiresAt);
    expect(result.type).toBe('user');
    expect(result.data.type).toBe('user');
    expect(result.data.uid).toBe('user-1');
  });

  it('staff retired rejected', async () => {
    mockDocs({
      staff: { loginId: 's1', status: 'retired' },
    });
    // assertActiveStaff will read again via admin - our mock returns retired
    // Need assertActiveStaff to work - it calls collection staffs doc get
    await expect(
      (generateQRCode as any).run({
        data: { type: 'staff' },
        auth: { uid: 'staff-1', token: {} as never },
        rawRequest: {} as never,
        acceptsStreaming: false,
      }),
    ).rejects.toMatchObject({
      details: expect.objectContaining({ errorKey: 'STAFF_RETIRED' }),
    });
  });

  it('staff active success', async () => {
    mockDocs({
      staff: { loginId: 's1', status: 'active' },
    });
    const result = await (generateQRCode as any).run({
      data: { type: 'staff' },
      auth: { uid: 'staff-1', token: {} as never },
      rawRequest: {} as never,
      acceptsStreaming: false,
    });
    expect(result.success).toBe(true);
    expect(result.type).toBe('staff');
    expect(result.data.type).toBe('staff');
    expect(result.data.uid).toBe('staff-1');
  });

  it('staff not found', async () => {
    mockDocs({ staff: null });
    await expect(
      (generateQRCode as any).run({
        data: { type: 'staff' },
        auth: { uid: 'missing', token: {} as never },
        rawRequest: {} as never,
        acceptsStreaming: false,
      }),
    ).rejects.toMatchObject({
      details: expect.objectContaining({ errorKey: 'STAFF_NOT_FOUND' }),
    });
  });
});
