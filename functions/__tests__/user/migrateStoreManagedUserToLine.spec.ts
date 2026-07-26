jest.mock('../../src/shared/devices', () => ({
  getCallerDeviceByUid: jest.fn(),
  isActive: jest.fn(),
}));

jest.mock('../../src/shared/logging/logOpsError', () => ({
  logOpsError: jest.fn(),
  logOpsSuccess: jest.fn(),
}));

jest.mock('../../src/domains/user/helpers/assertUserFreeForMigration', () => ({
  assertUserFreeForMigration: jest.fn().mockResolvedValue(undefined),
}));

import * as admin from 'firebase-admin';
import { getCallerDeviceByUid, isActive } from '../../src/shared/devices';
import { assertUserFreeForMigration } from '../../src/domains/user/helpers/assertUserFreeForMigration';
import { migrateStoreManagedUserToLine } from '../../src/domains/user/callables/migrateStoreManagedUserToLine';
import { a7StoreConfigDocument } from '../helpers/a7StoreConfig';
import { __setMockConfig, __resetMockConfig } from '../helpers/mockStoreConfig';

type UserState = Record<string, unknown>;

describe('migrateStoreManagedUserToLine (A-6 / A-7 Phase 5)', () => {
  const adminUid = 'admin-device-uid';
  const sourceUserId = 'store-user-001';
  const targetUserId = 'line-user-001';

  let sourceData: UserState | null;
  let targetData: UserState | null;
  let migrationLogs: Record<string, Record<string, unknown>>;
  let idempotencyDocs: Record<string, Record<string, unknown>>;
  let failOnLogSet = false;
  let nextMigrationId = 'mig-line-001';
  let activeStays: Record<string, Record<string, unknown> | null>;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
    __setMockConfig(a7StoreConfigDocument());
    (assertUserFreeForMigration as jest.Mock).mockResolvedValue(undefined);

    sourceData = {
      uid: sourceUserId,
      userType: 'store_managed',
      isMigrated: false,
      pointA: 100,
      pointB: 200,
      pointC: 333,
      sideGameChip: 300,
      initialBalanceSetAt: admin.firestore.Timestamp.fromDate(
        new Date('2026-01-01T00:00:00.000Z')
      ),
    };
    targetData = {
      uid: targetUserId,
      userType: 'line',
      pointA: 1,
      pointB: 2,
      pointC: 3,
      sideGameChip: 3,
      initialBalanceSetAt: admin.firestore.Timestamp.fromDate(
        new Date('2026-02-01T00:00:00.000Z')
      ),
    };
    migrationLogs = {};
    idempotencyDocs = {};
    failOnLogSet = false;
    nextMigrationId = 'mig-line-001';
    activeStays = {
      [sourceUserId]: null,
      [targetUserId]: null,
    };

    (getCallerDeviceByUid as jest.Mock).mockResolvedValue({
      id: 'device-1',
      role: 'admin',
      status: 'active',
    });
    (isActive as jest.Mock).mockReturnValue(true);

    const db = admin.firestore();
    jest.spyOn(db, 'collection').mockImplementation((name: string) => {
      if (name === 'activeStays') {
        return {
          doc: (uid: string) => ({
            __kind: 'activeStay',
            __id: uid,
            id: uid,
            get: async () => ({
              exists: activeStays[uid] != null,
              data: () => activeStays[uid] ?? undefined,
            }),
          }),
        } as unknown as admin.firestore.CollectionReference;
      }
      if (name === 'users') {
        return {
          doc: (userId: string) => makeUserDocRef(userId),
        } as unknown as admin.firestore.CollectionReference;
      }
      throw new Error(`unexpected collection: ${name}`);
    });

    jest.spyOn(db, 'runTransaction').mockImplementation(async (updateFunction: any) => {
      const pending: Array<() => void> = [];
      const tx = {
        get: async (ref: any) => {
          if (ref.__kind === 'user') {
            const data = ref.__id === sourceUserId ? sourceData : targetData;
            return {
              exists: data !== null,
              data: () => (data ? {...data} : undefined),
            };
          }
          if (ref.__kind === 'activeStay') {
            const data = activeStays[ref.__id];
            return {
              exists: data != null,
              data: () => data ?? undefined,
            };
          }
          if (ref.__kind === 'idempotency') {
            const data = idempotencyDocs[ref.__id];
            return {
              exists: !!data,
              data: () => (data ? {...data} : undefined),
            };
          }
          throw new Error(`unexpected get ${ref.__kind}`);
        },
        update: (ref: any, data: Record<string, unknown>) => {
          pending.push(() => {
            if (ref.__id === sourceUserId) {
              if (!sourceData) throw new Error('no source');
              Object.assign(sourceData, data);
              if (data.migratedAt) {
                sourceData.migratedAt = admin.firestore.Timestamp.fromDate(
                  new Date('2026-07-15T12:00:00.000Z')
                );
              }
            } else if (ref.__id === targetUserId) {
              if (!targetData) throw new Error('no target');
              Object.assign(targetData, data);
            }
          });
        },
        set: (ref: any, data: Record<string, unknown>) => {
          if (ref.__kind === 'log') {
            if (failOnLogSet) throw new Error('forced log failure');
            pending.push(() => {
              const resolved = {...data};
              if (resolved.createdAt) {
                resolved.createdAt = admin.firestore.Timestamp.fromDate(
                  new Date('2026-07-15T12:00:00.000Z')
                );
              }
              migrationLogs[ref.__id] = resolved;
            });
            return;
          }
          if (ref.__kind === 'idempotency') {
            pending.push(() => {
              idempotencyDocs[ref.__id] = {...data};
            });
            return;
          }
          throw new Error(`unexpected set ${ref.__kind}`);
        },
      };
      const result = await updateFunction(tx);
      for (const apply of pending) apply();
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
      id: userId,
      get: async () => {
        const data = userId === sourceUserId ? sourceData : targetData;
        return {
          exists: data !== null,
          data: () => (data ? {...data} : undefined),
        };
      },
      collection: (sub: string) => {
        if (sub === 'balanceMigrationLogs') {
          return {
            doc: (id?: string) => {
              const migrationId = id ?? nextMigrationId;
              return {
                __kind: 'log',
                __id: migrationId,
                id: migrationId,
              };
            },
            where: () => ({
              where: () => ({
                limit: () => ({
                  get: async () => {
                    const docs = Object.entries(migrationLogs)
                      .filter(([, v]) =>
                        v.migrationType === 'store_managed_to_line' &&
                        v.sourceUserId === sourceUserId
                      )
                      .map(([id, data]) => ({id, data: () => data}));
                    return {empty: docs.length === 0, docs};
                  },
                }),
              }),
            }),
          };
        }
        if (sub === 'balanceMigrationIdempotency') {
          return {
            doc: (id: string) => ({
              __kind: 'idempotency',
              __id: id,
              id,
            }),
          };
        }
        throw new Error(`unexpected sub ${sub}`);
      },
    };
  }

  function callMigrate(
    overrides: Record<string, unknown> = {},
    auth: {uid: string} | null = {uid: adminUid}
  ) {
    return (migrateStoreManagedUserToLine as any).run({
      data: {
        sourceUserId,
        targetUserId,
        confirmSamePerson: true,
        confirmOverwrite: true,
        ...overrides,
      },
      auth: auth ? {uid: auth.uid, token: {} as never} : undefined,
      rawRequest: {} as never,
      acceptsStreaming: false,
    });
  }

  const fullSourceBalances = {
    pointA: 100,
    pointB: 200,
    pointC: 333,
    pointD: 0,
    pointE: 0,
    sideGameChip: 300,
  };

  it('migrates balances from source to target and marks source migrated', async () => {
    const targetInitialAt = targetData!.initialBalanceSetAt;
    const result = await callMigrate({note: ' メモ '});
    expect(result.success).toBe(true);
    expect(result.balances).toEqual(fullSourceBalances);
    expect(targetData?.pointA).toBe(100);
    expect(targetData?.pointB).toBe(200);
    expect(targetData?.pointC).toBe(333);
    expect(targetData?.sideGameChip).toBe(300);
    expect(targetData?.initialBalanceSetAt).toEqual(targetInitialAt);
    expect(targetData).not.toHaveProperty('migratedFromUserId');
    expect(sourceData?.pointA).toBe(100);
    expect(sourceData?.isMigrated).toBe(true);
    expect(sourceData?.migratedToUserId).toBe(targetUserId);
    expect(sourceData?.migratedAt).toBeInstanceOf(admin.firestore.Timestamp);

    const log = migrationLogs[result.migrationId];
    expect(log.migrationType).toBe('store_managed_to_line');
    expect(log.sourceUserId).toBe(sourceUserId);
    expect(log.balances).toEqual(fullSourceBalances);
    expect(log.note).toBe('メモ');
    expect(log).not.toHaveProperty('createdByUid');
  });

  it('allows target zero balances and omits empty note', async () => {
    targetData!.pointA = 0;
    targetData!.pointB = 0;
    targetData!.sideGameChip = 0;
    const result = await callMigrate({note: '   '});
    expect(result.success).toBe(true);
    expect(migrationLogs[result.migrationId]).not.toHaveProperty('note');
  });

  it('reuses when source already migrated to same target', async () => {
    sourceData!.isMigrated = true;
    sourceData!.migratedToUserId = targetUserId;
    sourceData!.migratedAt = admin.firestore.Timestamp.fromDate(
      new Date('2026-07-01T00:00:00.000Z')
    );
    migrationLogs['existing-mig'] = {
      migrationType: 'store_managed_to_line',
      sourceUserId,
      balances: {pointA: 100, pointB: 200, sideGameChip: 300},
    };
    const result = await callMigrate();
    expect(result.reused).toBe(true);
    expect(result.migrationId).toBe('existing-mig');
    expect(Object.keys(migrationLogs)).toHaveLength(1);
  });

  it('rejects different target after migration', async () => {
    sourceData!.isMigrated = true;
    sourceData!.migratedToUserId = 'other-line';
    await expect(callMigrate()).rejects.toMatchObject({
      details: expect.objectContaining({errorKey: 'USER_ALREADY_MIGRATED'}),
    });
  });

  it('rejects unauthenticated', async () => {
    await expect(callMigrate({}, null)).rejects.toMatchObject({
      details: expect.objectContaining({errorKey: 'UNAUTHENTICATED'}),
    });
  });

  it('rejects non-admin', async () => {
    (getCallerDeviceByUid as jest.Mock).mockResolvedValue({
      role: 'terminal',
      status: 'active',
    });
    await expect(callMigrate()).rejects.toMatchObject({
      details: expect.objectContaining({errorKey: 'PERMISSION_DENIED'}),
    });
  });

  it('rejects inactive device', async () => {
    (isActive as jest.Mock).mockReturnValue(false);
    await expect(callMigrate()).rejects.toMatchObject({
      details: expect.objectContaining({errorKey: 'PERMISSION_DENIED'}),
    });
  });

  it('rejects missing source/target', async () => {
    sourceData = null;
    await expect(callMigrate()).rejects.toMatchObject({
      details: expect.objectContaining({errorKey: 'SOURCE_USER_NOT_FOUND'}),
    });
    sourceData = {
      uid: sourceUserId,
      userType: 'store_managed',
      isMigrated: false,
      pointA: 1,
      pointB: 0,
      sideGameChip: 0,
    };
    targetData = null;
    await expect(callMigrate()).rejects.toMatchObject({
      details: expect.objectContaining({errorKey: 'TARGET_USER_NOT_FOUND'}),
    });
  });

  it('rejects invalid source/target types', async () => {
    delete sourceData!.userType;
    await expect(callMigrate()).rejects.toMatchObject({
      details: expect.objectContaining({errorKey: 'INVALID_USER_TYPE'}),
    });
    sourceData!.userType = 'line';
    await expect(callMigrate()).rejects.toMatchObject({
      details: expect.objectContaining({errorKey: 'SOURCE_USER_NOT_STORE_MANAGED'}),
    });
    sourceData!.userType = 'store_managed';
    delete sourceData!.isMigrated;
    await expect(callMigrate()).rejects.toMatchObject({
      details: expect.objectContaining({errorKey: 'INVALID_USER_TYPE'}),
    });
    sourceData!.isMigrated = false;
    targetData!.userType = 'store_managed';
    await expect(callMigrate()).rejects.toMatchObject({
      details: expect.objectContaining({errorKey: 'TARGET_USER_NOT_LINE'}),
    });
    targetData!.userType = undefined;
    delete targetData!.userType;
    await expect(callMigrate()).rejects.toMatchObject({
      details: expect.objectContaining({errorKey: 'INVALID_USER_TYPE'}),
    });
  });

  it('rejects same ids and missing confirm flags', async () => {
    await expect(callMigrate({targetUserId: sourceUserId})).rejects.toMatchObject({
      details: expect.objectContaining({errorKey: 'INVALID_ARGUMENT'}),
    });
    await expect(callMigrate({confirmSamePerson: false})).rejects.toMatchObject({
      details: expect.objectContaining({errorKey: 'CONFIRMATION_REQUIRED'}),
    });
    await expect(callMigrate({confirmOverwrite: false})).rejects.toMatchObject({
      details: expect.objectContaining({errorKey: 'CONFIRMATION_REQUIRED'}),
    });
  });

  it('rejects note longer than 200', async () => {
    await expect(callMigrate({note: 'あ'.repeat(201)})).rejects.toMatchObject({
      details: expect.objectContaining({errorKey: 'INVALID_ARGUMENT'}),
    });
  });

  it('does not partially update when log write fails', async () => {
    failOnLogSet = true;
    const sourceBefore = {...sourceData!};
    const targetBefore = {...targetData!};
    await expect(callMigrate()).rejects.toMatchObject({
      details: expect.objectContaining({errorKey: 'INTERNAL'}),
    });
    expect(sourceData).toEqual(sourceBefore);
    expect(targetData).toEqual(targetBefore);
    expect(Object.keys(migrationLogs)).toHaveLength(0);
  });

  it('reuses clientNonce when idempotency doc matches and source not yet migrated', async () => {
    idempotencyDocs['n1'] = {
      sourceUserId,
      targetUserId,
      migrationId: 'seeded-mig',
      balances: fullSourceBalances,
    };
    const result = await callMigrate({clientNonce: 'n1'});
    expect(result.reused).toBe(true);
    expect(result.migrationId).toBe('seeded-mig');
    expect(sourceData?.isMigrated).toBe(false);
  });

  it('rejects clientNonce conflict for different payload', async () => {
    idempotencyDocs['n1'] = {
      sourceUserId: 'other-source',
      targetUserId,
      migrationId: 'seeded-mig',
      balances: {
        pointA: 1,
        pointB: 2,
        pointC: 0,
        pointD: 0,
        pointE: 0,
        sideGameChip: 3,
      },
    };
    await expect(callMigrate({clientNonce: 'n1'})).rejects.toMatchObject({
      details: expect.objectContaining({errorKey: 'IDEMPOTENCY_CONFLICT'}),
    });
  });

  it('invokes assertUserFreeForMigration for source and target', async () => {
    await callMigrate();
    expect(assertUserFreeForMigration).toHaveBeenCalledWith(
      sourceUserId,
      expect.objectContaining({db: expect.anything()})
    );
    expect(assertUserFreeForMigration).toHaveBeenCalledWith(
      targetUserId,
      expect.objectContaining({db: expect.anything()})
    );
  });
});
