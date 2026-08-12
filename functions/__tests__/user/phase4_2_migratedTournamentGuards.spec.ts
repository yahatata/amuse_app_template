/**
 * Phase 4-2: トーナメント新規参加・着席・順位付与の移行済みガード
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

jest.mock('../../src/domains/logs/lib/operationLog', () => ({
  writeSingleOperationLog: jest.fn().mockResolvedValue(undefined),
  toErrorSummary: jest.fn().mockReturnValue('err'),
}));

jest.mock('../../src/domains/tournament_activeTournament/lib/assertTournamentAllowsMutation', () => ({
  assertTournamentAllowsMutation: jest.fn(),
}));

import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { getCallerDeviceByUid, hasRequiredOption, isActive } from '../../src/shared/devices';
import { registerParticipants } from '../../src/domains/tournament_activeTournament/callables/registerParticipants';
import { assignSeatToPlayer } from '../../src/domains/tournament_activeTournament/callables/assignSeatToPlayer';
import { setRankingData } from '../../src/domains/tournament_activeTournament/callables/setRankingData';
import { registerForTournament } from '../../src/domains/tournament_activeTournament/callables/registerForTournament';

describe('Phase 4-2 migrated tournament guards', () => {
  const adminUid = 'admin-device-uid';
  let users: Record<string, Record<string, unknown>>;
  let runTransactionCalled: boolean;
  let mainViewUpdate: jest.Mock;

  function mockDbCollection(db: FirebaseFirestore.Firestore) {
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
              data: () => ({status: 'running', SetedRanking: false, snapshot: {name: 't'}}),
            }),
            update: jest.fn(),
            collection: () => ({
              doc: () => ({
                get: async () => ({
                  exists: true,
                  data: () => ({prizeReceiverCount: 1, '1stPrize': 1000}),
                }),
                update: mainViewUpdate,
              }),
            }),
          }),
        } as any;
      }
      throw new Error(`unexpected collection: ${name}`);
    });

    jest.spyOn(db, 'runTransaction').mockImplementation(async (fn: any) => {
      runTransactionCalled = true;
      return fn({
        get: async () => ({exists: false, data: () => undefined}),
        set: jest.fn(),
        update: jest.fn(),
      });
    });
  }

  beforeEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
    users = {};
    runTransactionCalled = false;
    mainViewUpdate = jest.fn();

    (getCallerDeviceByUid as jest.Mock).mockResolvedValue({
      id: 'device-1',
      role: 'admin',
      status: 'active',
      name: 'Admin',
    });
    (isActive as jest.Mock).mockReturnValue(true);
    (hasRequiredOption as jest.Mock).mockReturnValue(true);

    mockDbCollection(admin.firestore());
    mockDbCollection(getFirestore());
  });

  it('registerParticipants rejects when any user is migrated (before tx)', async () => {
    users['u-ok'] = {userType: 'line'};
    users['u-migrated'] = {userType: 'store_managed', isMigrated: true};

    await expect(
      (registerParticipants as any).run({
        auth: {uid: adminUid, token: {}},
        data: {
          tournamentId: 't1',
          userIds: ['u-ok', 'u-migrated'],
        },
      })
    ).rejects.toMatchObject({
      details: expect.objectContaining({errorKey: 'USER_MIGRATED'}),
    });
    expect(runTransactionCalled).toBe(false);
  });

  it('assignSeatToPlayer rejects migrated user before seat update', async () => {
    users['u-migrated'] = {userType: 'store_managed', isMigrated: true};

    await expect(
      (assignSeatToPlayer as any).run({
        auth: {uid: adminUid, token: {}},
        data: {
          operationId: 'op-1',
          tournamentId: 't1',
          userId: 'u-migrated',
          tableId: 'table-1',
          seatNumber: 1,
        },
      })
    ).rejects.toMatchObject({
      details: expect.objectContaining({errorKey: 'USER_MIGRATED'}),
    });
    expect(runTransactionCalled).toBe(false);
  });

  it('setRankingData rejects migrated prize uid before mainView update', async () => {
    users['u-migrated'] = {userType: 'store_managed', isMigrated: true};

    await expect(
      (setRankingData as any).run({
        auth: {uid: adminUid, token: {}},
        data: {
          tournamentId: 't1',
          grantIdempotencyKey: 't1:v1',
          rankingData: {
            '1stPlayerUid': 'u-migrated',
            '1stPlayerName': 'X',
          },
        },
      })
    ).rejects.toMatchObject({
      details: expect.objectContaining({errorKey: 'USER_MIGRATED'}),
    });
    expect(mainViewUpdate).not.toHaveBeenCalled();
  });

  it('registerForTournament rejects migrated auth user', async () => {
    users[adminUid] = {userType: 'store_managed', isMigrated: true};
    await expect(
      (registerForTournament as any).run({
        auth: {uid: adminUid, token: {}},
        data: {tournamentId: 't1', clientNonce: 'nonce_migrated_guard'},
      })
    ).rejects.toMatchObject({
      details: expect.objectContaining({errorKey: 'USER_MIGRATED'}),
    });
  });

  it('registerParticipants allows non-migrated users past the guard', async () => {
    users['u-ok'] = {userType: 'line'};
    let thrown: any;
    try {
      await (registerParticipants as any).run({
        auth: {uid: adminUid, token: {}},
        data: {
          tournamentId: 't1',
          userIds: ['u-ok'],
        },
      });
    } catch (e) {
      thrown = e;
    }
    expect(thrown?.details?.errorKey).not.toBe('USER_MIGRATED');
  });
});
