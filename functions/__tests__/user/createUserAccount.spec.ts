jest.mock('../../src/domains/user/services/logUtils', () => ({
  initializeUserLogs: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../src/shared/logging/logOpsError', () => ({
  logOpsError: jest.fn(),
  logOpsSuccess: jest.fn(),
}));

jest.mock('../../src/domains/user/services/qrCodeUtils', () => ({
  generateQRData: jest.fn().mockResolvedValue({timestamp: 1_700_000_000_000}),
  generateQRImage: jest.fn().mockResolvedValue('qr-image-base64'),
  saveQRCodeToStorage: jest.fn().mockResolvedValue('https://example.com/qr.png'),
}));

import * as admin from 'firebase-admin';
import { createUserAccount } from '../../src/domains/user/callables/createUserAccount';

describe('createUserAccount (A-6 Phase 1)', () => {
  const uid = 'line-user-uid-001';
  let setPayload: Record<string, unknown> | null = null;
  let pokerNameQueryEmpty = true;

  beforeEach(() => {
    jest.clearAllMocks();
    setPayload = null;
    pokerNameQueryEmpty = true;

    jest.spyOn(admin.firestore(), 'collection').mockImplementation((name: string) => {
      if (name !== 'users') {
        throw new Error(`unexpected collection: ${name}`);
      }
      return {
        doc: jest.fn().mockReturnValue({
          get: jest.fn().mockResolvedValue({exists: false}),
          set: jest.fn().mockImplementation(async (payload: Record<string, unknown>) => {
            setPayload = payload;
          }),
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

  function callCreate(overrides: Record<string, unknown> = {}) {
    return (createUserAccount as any).run({
      data: {
        pokerName: 'LinePoker',
        email: 'line@example.com',
        pin: '1234',
        birthMonth: '01',
        birthDay: '15',
        ...overrides,
      },
      auth: {uid, token: {} as never},
      rawRequest: {} as never,
      acceptsStreaming: false,
    });
  }

  it('saves userType: line and does not save isMigrated', async () => {
    const result = await callCreate();
    expect(result.success).toBe(true);
    expect(setPayload?.userType).toBe('line');
    expect(setPayload).not.toHaveProperty('isMigrated');
    expect(setPayload).not.toHaveProperty('migratedToUserId');
    expect(setPayload).not.toHaveProperty('migratedAt');
  });

  it('rejects duplicate pokerName', async () => {
    pokerNameQueryEmpty = false;
    await expect(callCreate()).rejects.toMatchObject({
      code: 'already-exists',
    });
  });
});
