jest.mock('../../src/domains/webhook/services/lineRichMenu', () => ({
  linkStaffRichMenu: jest.fn().mockResolvedValue(true),
}));

jest.mock('../../src/domains/user/services/qrCodeUtils', () => ({
  generateQRData: jest.fn().mockResolvedValue({
    uid: 'line-user-retired',
    loginId: 'やまだたろう0101',
    timestamp: 1_700_000_000_000,
    token: 'tok',
    type: 'staff',
  }),
  generateQRImage: jest.fn().mockResolvedValue('base64qr'),
  saveQRCodeToStorage: jest.fn().mockResolvedValue('https://example.com/qr.png'),
}));

import * as admin from 'firebase-admin';
import { reactivateStaffAccount } from '../../src/domains/staff/callables/reactivateStaffAccount';

describe('reactivateStaffAccount', () => {
  const uid = 'line-user-retired';
  let staffData: Record<string, unknown>;
  let duplicateKana = false;
  const requests = new Map<string, Record<string, unknown>>();

  beforeEach(() => {
    jest.clearAllMocks();
    duplicateKana = false;
    requests.clear();
    staffData = {
      uid,
      status: 'retired',
      fullName: '旧名前',
      fullNameKana: 'きゅうなまえ',
      retiredDate: '2026-07-01',
      hourlyWage: 1000,
    };

    jest.spyOn(admin.firestore(), 'collection').mockImplementation((name: string) => {
      if (name === 'staffs') {
        return {
          doc: jest.fn().mockReturnValue({
            get: jest.fn().mockResolvedValue({
              exists: true,
              data: () => staffData,
            }),
            update: jest.fn().mockImplementation(async (payload: Record<string, unknown>) => {
              Object.assign(staffData, payload);
            }),
            set: jest.fn().mockImplementation(async (payload: Record<string, unknown>) => {
              Object.assign(staffData, payload);
            }),
            collection: jest.fn((sub: string) => {
              if (sub !== 'mutationRequests') throw new Error(sub);
              return {
                doc: jest.fn((nonce: string) => ({
                  get: jest.fn(async () => {
                    const data = requests.get(nonce);
                    return { exists: !!data, data: () => data };
                  }),
                  set: jest.fn(async (payload: Record<string, unknown>) => {
                    requests.set(nonce, payload);
                  }),
                })),
              };
            }),
          }),
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockReturnValue({
              get: jest.fn().mockResolvedValue({
                docs: duplicateKana
                  ? [{ id: 'other-user', data: () => ({ fullNameKana: 'やまだたろう' }) }]
                  : [],
              }),
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
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const pii = {
    fullName: '山田太郎',
    fullNameKana: 'やまだたろう',
    email: 'new@example.com',
    phoneNumber: '09012345678',
    birthMonthDay: '0101',
    clientNonce: 'rea-legacy-1',
  };

  it('reactivates retired staff to active', async () => {
    const result = await (reactivateStaffAccount as any).run({
      data: pii,
      auth: { uid, token: {} as never },
      rawRequest: {} as never,
      acceptsStreaming: false,
    });

    expect(result.success).toBe(true);
    expect(result.data.staffStatus).toBe('active');
    expect(staffData.status).toBe('active');
    expect(staffData.email).toBe('new@example.com');
    expect(staffData.hourlyWage).toBe(1000);
  });

  it('rejects when staff is not retired', async () => {
    staffData.status = 'active';
    await expect(
      (reactivateStaffAccount as any).run({
        data: { ...pii, clientNonce: 'rea-legacy-2' },
        auth: { uid, token: {} as never },
        rawRequest: {} as never,
        acceptsStreaming: false,
      }),
    ).rejects.toMatchObject({
      details: expect.objectContaining({ errorKey: 'STAFF_NOT_RETIRED' }),
    });
  });
});
