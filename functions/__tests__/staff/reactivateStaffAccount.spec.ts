jest.mock('../../src/domains/webhook/services/lineRichMenu', () => ({
  linkStaffRichMenu: jest.fn().mockResolvedValue(true),
}));

jest.mock('../../src/domains/user/services/qrCodeUtils', () => ({
  generateQRData: jest.fn().mockResolvedValue({ timestamp: Date.now(), loginId: 'test' }),
  generateQRImage: jest.fn().mockResolvedValue('base64qr'),
  saveQRCodeToStorage: jest.fn().mockResolvedValue('https://example.com/qr.png'),
}));

import * as admin from 'firebase-admin';
import { reactivateStaffAccount } from '../../src/domains/staff/callables/reactivateStaffAccount';

describe('reactivateStaffAccount', () => {
  const uid = 'line-user-retired';
  let staffData: Record<string, unknown>;
  let duplicateKana = false;

  beforeEach(() => {
    jest.clearAllMocks();
    duplicateKana = false;
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
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('reactivates retired staff to active', async () => {
    const result = await (reactivateStaffAccount as any).run({
      data: {
        fullName: '山田太郎',
        fullNameKana: 'やまだたろう',
        email: 'new@example.com',
        phoneNumber: '09012345678',
        birthMonthDay: '0101',
      },
      auth: { uid, token: {} as never },
      rawRequest: {} as never,
      acceptsStreaming: false,
    });

    expect(result.success).toBe(true);
    expect(staffData.status).toBe('active');
    expect(staffData.email).toBe('new@example.com');
    expect(staffData.hourlyWage).toBe(1000);
  });

  it('rejects when staff is not retired', async () => {
    staffData.status = 'active';
    await expect(
      (reactivateStaffAccount as any).run({
        data: {
          fullName: '山田太郎',
          fullNameKana: 'やまだたろう',
          email: 'new@example.com',
          phoneNumber: '09012345678',
          birthMonthDay: '0101',
        },
        auth: { uid, token: {} as never },
        rawRequest: {} as never,
        acceptsStreaming: false,
      })
    ).rejects.toMatchObject({
      details: expect.objectContaining({ errorKey: 'STAFF_NOT_RETIRED' }),
    });
  });
});
