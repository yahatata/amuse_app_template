/**
 * Phase 4-3: サイドゲーム参加・chip 預入/引出の移行済みガード
 */
import { a7StoreConfigDocument } from '../helpers/a7StoreConfig';
import { __setMockConfig, __resetMockConfig } from '../helpers/mockStoreConfig';

jest.mock('../../src/domains/sideGame/lib/sideGameOperationPermission', () => ({
  assertSideGameOperationPermission: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../src/domains/bills/repos/getActiveBillByUser', () => ({
  getActiveBillByUser: jest.fn(),
}));

jest.mock('../../src/domains/bills/repos/appendSideGameChip', () => ({
  appendSideGameChip: jest.fn(),
}));

jest.mock('../../src/domains/bills/repos/updatePlace', () => ({
  updatePlace: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../src/domains/user/services/logUtils', () => ({
  addLogEntry: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../src/shared/logging/logOpsError', () => ({
  logOpsError: jest.fn(),
  logOpsSuccess: jest.fn(),
}));

import { getFirestore } from 'firebase-admin/firestore';
import { getActiveBillByUser } from '../../src/domains/bills/repos/getActiveBillByUser';
import { appendSideGameChip } from '../../src/domains/bills/repos/appendSideGameChip';
import { updatePlace } from '../../src/domains/bills/repos/updatePlace';
import { depositChip } from '../../src/domains/sideGame/callables/depositChip';
import { withdrawChip } from '../../src/domains/sideGame/callables/withdrawChip';
import { registerForSideGame } from '../../src/domains/sideGame/callables/registerForSideGame';

describe('Phase 4-3 migrated sideGame/chip guards', () => {
  const callerUid = 'admin-device';
  let users: Record<string, Record<string, unknown>>;
  let sideGameUpdate: jest.Mock;
  let userUpdate: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
    __setMockConfig(a7StoreConfigDocument());
    users = {};
    sideGameUpdate = jest.fn().mockResolvedValue(undefined);
    userUpdate = jest.fn().mockResolvedValue(undefined);

    (getActiveBillByUser as jest.Mock).mockResolvedValue({
      billId: 'bill-1',
      billRef: {},
      billData: {},
    });
    (appendSideGameChip as jest.Mock).mockResolvedValue({
      success: true,
      chipId: 'chip-1',
      diagnostics: { reused: false },
    });

    const db = getFirestore();
    jest.spyOn(db, 'collection').mockImplementation((name: string) => {
      if (name === 'users') {
        return {
          doc: (uid: string) => ({
            get: async () => ({
              exists: users[uid] != null,
              data: () => (users[uid] ? { ...users[uid] } : undefined),
            }),
            update: userUpdate,
            collection: () => ({
              doc: () => ({
                get: async () => ({ exists: false, data: () => undefined }),
              }),
            }),
          }),
        } as any;
      }
      if (name === 'activeStays') {
        return {
          doc: () => ({
            get: async () => ({
              exists: true,
              data: () => ({ billId: 'bill-1', pokerName: 'P', isActive: true }),
            }),
          }),
        } as any;
      }
      if (name === 'sideGame') {
        return {
          doc: () => ({
            get: async () => ({ exists: true, data: () => ({ seats: {} }) }),
            update: sideGameUpdate,
          }),
        } as any;
      }
      throw new Error(`unexpected collection: ${name}`);
    });

    jest.spyOn(db, 'runTransaction').mockImplementation(async (fn: any) => {
      return fn({
        get: async (ref: any) => {
          if (ref && typeof ref.get === 'function') {
            return ref.get();
          }
          return { exists: false, data: () => undefined };
        },
        set: jest.fn(),
        update: (ref: any, data: Record<string, unknown>) => {
          if (ref && typeof ref.update === 'function') {
            return ref.update(data);
          }
          userUpdate(data);
        },
      });
    });
  });

  afterEach(() => {
    __resetMockConfig();
  });

  it('depositChip rejects migrated user before balance update', async () => {
    users['u1'] = { userType: 'store_managed', isMigrated: true, sideGameChip: 10 };
    await expect(
      (depositChip as any).run({
        auth: { uid: callerUid, token: {} },
        data: { userId: 'u1', amount: 5, clientNonce: 'n1' },
      }),
    ).rejects.toMatchObject({
      details: expect.objectContaining({ errorKey: 'USER_MIGRATED' }),
    });
    expect(appendSideGameChip).not.toHaveBeenCalled();
    expect(userUpdate).not.toHaveBeenCalled();
  });

  it('withdrawChip rejects migrated user before balance update', async () => {
    users['u1'] = { userType: 'store_managed', isMigrated: true, sideGameChip: 10 };
    await expect(
      (withdrawChip as any).run({
        auth: { uid: callerUid, token: {} },
        data: { userId: 'u1', amount: 5, clientNonce: 'n1' },
      }),
    ).rejects.toMatchObject({
      details: expect.objectContaining({ errorKey: 'USER_MIGRATED' }),
    });
    expect(appendSideGameChip).not.toHaveBeenCalled();
    expect(userUpdate).not.toHaveBeenCalled();
  });

  it('registerForSideGame rejects migrated user before seat update', async () => {
    users['u1'] = { userType: 'store_managed', isMigrated: true };
    await expect(
      (registerForSideGame as any).run({
        auth: { uid: callerUid, token: {} },
        data: { tableId: 't1', seatNumber: 1, userId: 'u1' },
      }),
    ).rejects.toMatchObject({
      details: expect.objectContaining({ errorKey: 'USER_MIGRATED' }),
    });
    expect(sideGameUpdate).not.toHaveBeenCalled();
    expect(updatePlace).not.toHaveBeenCalled();
  });

  it('depositChip allows non-migrated line user past guard', async () => {
    users['u1'] = { userType: 'line', sideGameChip: 10 };
    const result = await (depositChip as any).run({
      auth: { uid: callerUid, token: {} },
      data: { userId: 'u1', amount: 5, clientNonce: 'n2' },
    });
    expect(result.success).toBe(true);
    expect(appendSideGameChip).toHaveBeenCalled();
    expect(userUpdate).toHaveBeenCalled();
  });
});
