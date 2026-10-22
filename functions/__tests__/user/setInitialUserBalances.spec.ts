jest.mock('../../src/shared/devices', () => ({
  getCallerDeviceByUid: jest.fn(),
  isActive: jest.fn(),
}));

jest.mock('../../src/shared/logging/logOpsError', () => ({
  logOpsError: jest.fn(),
  logOpsSuccess: jest.fn(),
}));

import * as admin from 'firebase-admin';
import { getCallerDeviceByUid, isActive } from '../../src/shared/devices';
import { setInitialUserBalances } from '../../src/domains/user/callables/setInitialUserBalances';
import { a7StoreConfigDocument } from '../helpers/a7StoreConfig';
import { __setMockConfig, __resetMockConfig } from '../helpers/mockStoreConfig';

type UserState = Record<string, unknown>;

describe('setInitialUserBalances (A-6 / A-7 Phase 5)', () => {
  const adminUid = 'admin-device-uid';
  const targetUserId = 'user-target-001';
  let userData: UserState | null;
  let migrationLogs: Record<string, Record<string, unknown>>;
  let idempotencyDocs: Record<string, Record<string, unknown>>;
  let failOnLogSet = false;
  let nextMigrationId = 'mig-001';

  beforeEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
    __setMockConfig(a7StoreConfigDocument());
    userData = {
      uid: targetUserId,
      userType: 'line',
      pointA: 10,
      pointB: 20,
      pointC: 777,
      sideGameChip: 30,
    };
    migrationLogs = {};
    idempotencyDocs = {};
    failOnLogSet = false;
    nextMigrationId = 'mig-001';

    (getCallerDeviceByUid as jest.Mock).mockResolvedValue({
      id: 'device-1',
      role: 'admin',
      status: 'active',
    });
    (isActive as jest.Mock).mockReturnValue(true);

    const db = admin.firestore();
    jest.spyOn(db, 'collection').mockImplementation((name: string) => {
      if (name !== 'users') {
        throw new Error(`unexpected collection: ${name}`);
      }
      return {
        doc: (userId: string) => makeUserDocRef(userId),
      } as unknown as admin.firestore.CollectionReference;
    });

    jest.spyOn(db, 'runTransaction').mockImplementation(async (updateFunction: any) => {
      const pendingUpdates: Array<() => void> = [];
      const tx = {
        get: async (ref: {__path: string; __kind: string; __id: string}) => {
          if (ref.__kind === 'user') {
            return {
              exists: userData !== null,
              data: () => (userData ? {...userData} : undefined),
            };
          }
          if (ref.__kind === 'idempotency') {
            const data = idempotencyDocs[ref.__id];
            return {
              exists: !!data,
              data: () => (data ? {...data} : undefined),
            };
          }
          throw new Error(`unexpected get: ${ref.__path}`);
        },
        update: (ref: {__kind: string}, data: Record<string, unknown>) => {
          if (ref.__kind !== 'user') {
            throw new Error('unexpected update target');
          }
          pendingUpdates.push(() => {
            if (!userData) throw new Error('missing user');
            Object.assign(userData, data);
            if (data.initialBalanceSetAt) {
              userData.initialBalanceSetAt = admin.firestore.Timestamp.fromDate(
                new Date('2026-07-15T00:00:00.000Z')
              );
            }
          });
        },
        set: (ref: {__kind: string; __id: string}, data: Record<string, unknown>) => {
          if (ref.__kind === 'log') {
            if (failOnLogSet) {
              throw new Error('forced log write failure');
            }
            pendingUpdates.push(() => {
              const resolved = {...data};
              if (resolved.createdAt) {
                resolved.createdAt = admin.firestore.Timestamp.fromDate(
                  new Date('2026-07-15T00:00:00.000Z')
                );
              }
              migrationLogs[ref.__id] = resolved;
            });
            return;
          }
          if (ref.__kind === 'idempotency') {
            pendingUpdates.push(() => {
              const resolved = {...data};
              if (resolved.createdAt) {
                resolved.createdAt = admin.firestore.Timestamp.fromDate(
                  new Date('2026-07-15T00:00:00.000Z')
                );
              }
              idempotencyDocs[ref.__id] = resolved;
            });
            return;
          }
          throw new Error(`unexpected set: ${ref.__kind}`);
        },
      };

      const result = await updateFunction(tx);
      for (const apply of pendingUpdates) {
        apply();
      }
      return result;
    });
  });

  afterEach(() => {
    __resetMockConfig();
  });

  function makeUserDocRef(userId: string) {
    return {
      __kind: 'user',
      __id: userId,
      __path: `users/${userId}`,
      id: userId,
      get: async () => ({
        exists: userData !== null,
        data: () => (userData ? {...userData} : undefined),
      }),
      collection: (sub: string) => {
        if (sub === 'balanceMigrationLogs') {
          return {
            doc: (id?: string) => {
              const migrationId = id ?? nextMigrationId;
              return {
                __kind: 'log',
                __id: migrationId,
                __path: `users/${userId}/balanceMigrationLogs/${migrationId}`,
                id: migrationId,
              };
            },
          };
        }
        if (sub === 'balanceMigrationIdempotency') {
          return {
            doc: (id: string) => ({
              __kind: 'idempotency',
              __id: id,
              __path: `users/${userId}/balanceMigrationIdempotency/${id}`,
              id,
            }),
          };
        }
        throw new Error(`unexpected subcollection: ${sub}`);
      },
    };
  }

  function callSet(overrides: Record<string, unknown> = {}, auth: {uid: string} | null = {uid: adminUid}) {
    return (setInitialUserBalances as any).run({
      data: {
        targetUserId,
        balances: {pointA: 100, pointB: 200, sideGameChip: 300},
        confirmOverwrite: true,
        ...overrides,
      },
      auth: auth ? {uid: auth.uid, token: {} as never} : undefined,
      rawRequest: {} as never,
      acceptsStreaming: false,
    });
  }

  it('sets balances for LINE user and writes initial_import log without sourceUserId', async () => {
    const result = await callSet({note: '  導入時残高  '});
    expect(result.success).toBe(true);
    expect(result.balances).toEqual({
      pointA: 100,
      pointB: 200,
      pointC: 777,
      pointD: 0,
      pointE: 0,
      sideGameChip: 300,
    });
    expect(userData?.pointA).toBe(100);
    expect(userData?.pointB).toBe(200);
    expect(userData?.sideGameChip).toBe(300);
    expect(userData?.pointC).toBe(777);
    expect(userData?.initialBalanceSetAt).toBeInstanceOf(admin.firestore.Timestamp);
    expect(result.initialBalanceSetAt).toBe('2026-07-15T00:00:00.000Z');

    const log = migrationLogs[result.migrationId];
    expect(log.migrationType).toBe('initial_import');
    expect(log.balances).toEqual({
      pointA: 100,
      pointB: 200,
      pointC: 777,
      pointD: 0,
      pointE: 0,
      sideGameChip: 300,
    });
    expect(log.note).toBe('導入時残高');
    expect(log).not.toHaveProperty('sourceUserId');
    expect(log).not.toHaveProperty('createdByUid');
  });

  it('sets balances for store_managed user with isMigrated false', async () => {
    userData = {
      uid: targetUserId,
      userType: 'store_managed',
      isMigrated: false,
      pointA: 0,
      pointB: 0,
      sideGameChip: 0,
    };
    const result = await callSet({
      balances: {pointA: 0, pointB: 0, sideGameChip: 0},
    });
    expect(result.success).toBe(true);
    expect(userData.pointA).toBe(0);
    expect(userData.pointB).toBe(0);
    expect(userData.sideGameChip).toBe(0);
    expect(migrationLogs[result.migrationId]).not.toHaveProperty('note');
  });

  it('rejects unauthenticated caller', async () => {
    await expect(callSet({}, null)).rejects.toMatchObject({
      code: 'unauthenticated',
      details: expect.objectContaining({errorKey: 'UNAUTHENTICATED'}),
    });
  });

  it('rejects non-admin device', async () => {
    (getCallerDeviceByUid as jest.Mock).mockResolvedValue({
      id: 'device-1',
      role: 'terminal',
      status: 'active',
    });
    await expect(callSet()).rejects.toMatchObject({
      code: 'permission-denied',
      details: expect.objectContaining({errorKey: 'PERMISSION_DENIED'}),
    });
  });

  it('rejects missing target user', async () => {
    userData = null;
    await expect(callSet()).rejects.toMatchObject({
      code: 'not-found',
      details: expect.objectContaining({errorKey: 'TARGET_USER_NOT_FOUND'}),
    });
  });

  it('rejects missing userType', async () => {
    userData = {uid: targetUserId, pointA: 0, pointB: 0, sideGameChip: 0};
    await expect(callSet()).rejects.toMatchObject({
      details: expect.objectContaining({errorKey: 'INVALID_USER_TYPE'}),
    });
  });

  it('rejects migrated store_managed user', async () => {
    userData = {
      uid: targetUserId,
      userType: 'store_managed',
      isMigrated: true,
      pointA: 1,
      pointB: 2,
      sideGameChip: 3,
    };
    await expect(callSet()).rejects.toMatchObject({
      details: expect.objectContaining({errorKey: 'USER_MIGRATED'}),
    });
  });

  it.each([
    [{pointA: -1, pointB: 0, sideGameChip: 0}, 'negative'],
    [{pointA: 1.5, pointB: 0, sideGameChip: 0}, 'decimal'],
    [{pointA: null, pointB: 0, sideGameChip: 0}, 'null'],
    [{pointB: 0, sideGameChip: 0}, 'missing pointA'],
    [{pointA: '1', pointB: 0, sideGameChip: 0}, 'string'],
  ])('rejects invalid balances (%s)', async (balances, _label) => {
    await expect(callSet({balances})).rejects.toMatchObject({
      details: expect.objectContaining({errorKey: 'INVALID_BALANCE'}),
    });
  });

  it('does not apply partial updates when log write fails inside transaction', async () => {
    failOnLogSet = true;
    const before = {...userData!};
    await expect(callSet()).rejects.toMatchObject({
      code: 'internal',
      details: expect.objectContaining({errorKey: 'INTERNAL'}),
    });
    expect(userData).toEqual(before);
    expect(Object.keys(migrationLogs)).toHaveLength(0);
  });

  it('reuses result for same clientNonce and balances', async () => {
    const first = await callSet({clientNonce: 'nonce-1'});
    nextMigrationId = 'mig-002';
    const second = await callSet({clientNonce: 'nonce-1'});
    expect(second.reused).toBe(true);
    expect(second.migrationId).toBe(first.migrationId);
    expect(Object.keys(migrationLogs)).toHaveLength(1);
  });

  it('rejects clientNonce conflict on different balances', async () => {
    await callSet({clientNonce: 'nonce-2', balances: {pointA: 1, pointB: 2, sideGameChip: 3}});
    await expect(
      callSet({clientNonce: 'nonce-2', balances: {pointA: 9, pointB: 2, sideGameChip: 3}})
    ).rejects.toMatchObject({
      details: expect.objectContaining({errorKey: 'IDEMPOTENCY_CONFLICT'}),
    });
  });
});
