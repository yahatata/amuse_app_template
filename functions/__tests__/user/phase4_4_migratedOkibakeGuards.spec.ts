/**
 * Phase 4-4: 置きバケ新規紐付けの移行済みガード
 */
jest.mock('../../src/shared/devices', () => ({
  getCallerDeviceByUid: jest.fn(),
  hasRequiredOption: jest.fn(),
  isActive: jest.fn(),
}));

jest.mock('../../src/shared/logging/logOpsError', () => ({
  logOpsError: jest.fn(),
  logOpsSuccess: jest.fn(),
}));

jest.mock('../../src/domains/tournament_activeTournament/lib/assertTournamentAllowsMutation', () => ({
  assertTournamentAllowsMutation: jest.fn(),
}));

jest.mock('../../src/domains/tournament_activeTournament/lib/okibakeTableDevicePermission', () => ({
  assertOkibakeTournamentOperationPermission: jest.fn(),
  assertTableDeviceCanAccessOkibakeEntry: jest.fn(),
}));

import * as admin from 'firebase-admin';
import { getCallerDeviceByUid, hasRequiredOption, isActive } from '../../src/shared/devices';
import { createOkibakeTemporaryEntry } from '../../src/domains/tournament_activeTournament/callables/createOkibakeTemporaryEntry';
import { updateOkibakeTemporaryEntryLinkedUser } from '../../src/domains/tournament_activeTournament/callables/updateOkibakeTemporaryEntryLinkedUser';
import { linkOkibakeTemporaryEntryToBill } from '../../src/domains/tournament_activeTournament/callables/linkOkibakeTemporaryEntryToBill';

describe('Phase 4-4 migrated okibake guards', () => {
  const adminUid = 'admin-device-uid';
  let users: Record<string, Record<string, unknown>>;
  let runTransaction: jest.Mock;

  function mockDb(db: FirebaseFirestore.Firestore) {
    jest.spyOn(db, 'collection').mockImplementation((name: string) => {
      if (name === 'users') {
        return {
          doc: (uid: string) => ({
            get: async () => ({
              exists: users[uid] != null,
              data: () => (users[uid] ? {...users[uid]} : undefined),
            }),
          }),
        } as any;
      }
      if (name === 'scheduledTournaments') {
        return {
          doc: () => ({
            get: async () => ({
              exists: true,
              data: () => ({status: 'running'}),
            }),
            collection: () => ({
              doc: () => ({
                get: async () => ({
                  exists: true,
                  data: () => ({
                    entryStatus: 'registered',
                    billLinkStatus: 'unlinked',
                    assignedTableId: null,
                  }),
                }),
              }),
            }),
          }),
        } as any;
      }
      if (name === 'operationLogs') {
        return {
          doc: () => ({
            get: async () => ({exists: false, data: () => undefined}),
          }),
        } as any;
      }
      if (name === 'activeStays' || name === 'bills') {
        return {
          doc: () => ({
            get: async () => ({exists: true, data: () => ({})}),
          }),
        } as any;
      }
      throw new Error(`unexpected collection: ${name}`);
    });

    runTransaction = jest.fn(async () => {
      throw new Error('runTransaction should not be reached for migrated guard');
    });
    jest.spyOn(db, 'runTransaction').mockImplementation(runTransaction as any);
  }

  beforeEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
    users = {};
    (getCallerDeviceByUid as jest.Mock).mockResolvedValue({
      id: 'device-1',
      role: 'admin',
      status: 'active',
      name: 'Admin',
    });
    (isActive as jest.Mock).mockReturnValue(true);
    (hasRequiredOption as jest.Mock).mockReturnValue(true);
    mockDb(admin.firestore());
  });

  it('createOkibakeTemporaryEntry rejects migrated linkedUserId before tx', async () => {
    users['u1'] = {userType: 'store_managed', isMigrated: true};
    await expect(
      (createOkibakeTemporaryEntry as any).run({
        auth: {uid: adminUid, token: {}},
        data: {
          operationId: 'op1',
          tournamentId: 't1',
          addonIntent: 'unknown',
          linkedUserId: 'u1',
          linkedUserPokerName: 'Migrated',
        },
      })
    ).rejects.toMatchObject({
      details: expect.objectContaining({errorKey: 'USER_MIGRATED'}),
    });
    expect(runTransaction).not.toHaveBeenCalled();
  });

  it('createOkibakeTemporaryEntry without linkedUserId skips user guard', async () => {
    runTransaction.mockResolvedValue({
      kind: 'create',
      okibakeEntryId: 'e1',
      temporaryDisplayName: 'オキバケ1',
    });
    const res = await (createOkibakeTemporaryEntry as any).run({
      auth: {uid: adminUid, token: {}},
      data: {
        operationId: 'op2',
        tournamentId: 't1',
        addonIntent: 'no',
      },
    });
    expect(res.success).toBe(true);
    expect(runTransaction).toHaveBeenCalled();
  });

  it('updateOkibakeTemporaryEntryLinkedUser rejects migrated linkedUserId before tx', async () => {
    users['u1'] = {userType: 'store_managed', isMigrated: true};
    await expect(
      (updateOkibakeTemporaryEntryLinkedUser as any).run({
        auth: {uid: adminUid, token: {}},
        data: {
          tournamentId: 't1',
          okibakeEntryId: 'e1',
          linkedUserId: 'u1',
          operationId: 'op3',
        },
      })
    ).rejects.toMatchObject({
      details: expect.objectContaining({errorKey: 'USER_MIGRATED'}),
    });
    expect(runTransaction).not.toHaveBeenCalled();
  });

  it('linkOkibakeTemporaryEntryToBill rejects migrated userId before tx', async () => {
    users['u1'] = {userType: 'store_managed', isMigrated: true};
    await expect(
      (linkOkibakeTemporaryEntryToBill as any).run({
        auth: {uid: adminUid, token: {}},
        data: {
          tournamentId: 't1',
          okibakeEntryId: 'e1',
          userId: 'u1',
          billId: 'b1',
          operationId: 'op4',
        },
      })
    ).rejects.toMatchObject({
      details: expect.objectContaining({errorKey: 'USER_MIGRATED'}),
    });
    expect(runTransaction).not.toHaveBeenCalled();
  });

  it('updateOkibakeTemporaryEntryLinkedUser allows non-migrated line user past guard', async () => {
    users['u1'] = {userType: 'line'};
    runTransaction.mockResolvedValue({
      kind: 'success',
      linkedUserPokerName: 'Line User',
    });
    const res = await (updateOkibakeTemporaryEntryLinkedUser as any).run({
      auth: {uid: adminUid, token: {}},
      data: {
        tournamentId: 't1',
        okibakeEntryId: 'e1',
        linkedUserId: 'u1',
        operationId: 'op5',
      },
    });
    expect(res.success).toBe(true);
    expect(runTransaction).toHaveBeenCalled();
  });
});
