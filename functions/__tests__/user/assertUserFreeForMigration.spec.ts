import { HttpsError } from 'firebase-functions/v2/https';
import { assertUserFreeForMigration } from '../../src/domains/user/helpers/assertUserFreeForMigration';

type FakeDoc = {
  id: string;
  data: Record<string, unknown>;
};

const CURRENT_BUSINESS_DATE = '2026-07-17';

function makeDb(state: {
  activeStay?: Record<string, unknown> | null;
  user?: Record<string, unknown> | null;
  bills?: FakeDoc[];
  tournaments?: Array<{
    id: string;
    data: Record<string, unknown>;
    tablesSeat?: FakeDoc[];
  }>;
  sideGames?: FakeDoc[];
  okibake?: Array<
    FakeDoc & {
      /** parent path: scheduledTournaments/{tournamentId}/okibakeTemporaryEntries/{id} */
      tournamentId?: string | null;
      /** parent collection id。省略時 scheduledTournaments。不正 path テスト用 */
      tournamentParentCollectionId?: string;
    }
  >;
  /** storeMeta/currentBusinessDay。省略時は running + CURRENT_BUSINESS_DATE */
  currentBusinessDay?: Record<string, unknown> | null;
}) {
  const bills = state.bills ?? [];
  const tournaments = state.tournaments ?? [];
  const sideGames = state.sideGames ?? [];
  const okibake = state.okibake ?? [];
  const currentBusinessDay =
    state.currentBusinessDay === undefined
      ? {status: 'running', currentBusinessDateKey: CURRENT_BUSINESS_DATE}
      : state.currentBusinessDay;

  function tournamentDocRef(tournamentId: string) {
    return {
      id: tournamentId,
      parent: {id: 'scheduledTournaments'},
      get: async () => {
        const t = tournaments.find((x) => x.id === tournamentId);
        return {
          exists: t != null,
          data: () => t?.data,
        };
      },
      collection: (sub: string) => {
        if (sub !== 'tablesSeat') throw new Error(sub);
        const t = tournaments.find((x) => x.id === tournamentId);
        return {
          get: async () => ({
            docs: (t?.tablesSeat ?? []).map((s) => ({
              id: s.id,
              data: () => s.data,
            })),
          }),
        };
      },
    };
  }

  return {
    collection: (name: string) => {
      if (name === 'storeMeta') {
        return {
          doc: (id: string) => ({
            get: async () => {
              if (id !== 'currentBusinessDay') {
                return {exists: false, data: () => undefined};
              }
              return {
                exists: currentBusinessDay != null,
                data: () => currentBusinessDay ?? undefined,
              };
            },
          }),
        };
      }
      if (name === 'activeStays') {
        return {
          doc: (uid: string) => ({
            get: async () => ({
              exists: state.activeStay != null,
              data: () => state.activeStay ?? undefined,
            }),
            id: uid,
          }),
        };
      }
      if (name === 'users') {
        return {
          doc: () => ({
            get: async () => ({
              exists: state.user != null,
              data: () => state.user ?? undefined,
            }),
          }),
        };
      }
      if (name === 'bills') {
        return {
          where: (_f1: string, _op1: string, v1: unknown) => ({
            where: (_f2: string, op2: string, v2: unknown) => ({
              limit: () => ({
                get: async () => {
                  const matched = bills.filter((b) => {
                    if (b.data.partyUserId !== v1) return false;
                    if (op2 === 'in') {
                      return (v2 as string[]).includes(b.data.status as string);
                    }
                    return b.data.status === v2;
                  });
                  return {empty: matched.length === 0, docs: matched};
                },
              }),
            }),
          }),
        };
      }
      if (name === 'scheduledTournaments') {
        return {
          doc: (id: string) => tournamentDocRef(id),
          where: () => ({
            get: async () => ({
              docs: tournaments
                .filter((t) => {
                  const status = t.data.status as string;
                  return !['ended', 'cancelled', 'force_ended', 'canceled'].includes(status);
                })
                .map((t) => ({
                  id: t.id,
                  data: () => t.data,
                  ref: tournamentDocRef(t.id),
                })),
            }),
          }),
        };
      }
      if (name === 'sideGame') {
        return {
          get: async () => ({
            docs: sideGames.map((s) => ({
              id: s.id,
              data: () => s.data,
            })),
          }),
        };
      }
      throw new Error(`unexpected collection ${name}`);
    },
    collectionGroup: (name: string) => {
      if (name !== 'okibakeTemporaryEntries') throw new Error(name);
      return {
        where: (_f1: string, _op1: string, uid: unknown) => ({
          where: () => ({
            get: async () => ({
              docs: okibake
                .filter((o) => o.data.linkedUserId === uid)
                .map((o) => {
                  const tournamentId = o.tournamentId;
                  const parentCollectionId =
                    o.tournamentParentCollectionId ?? 'scheduledTournaments';
                  let tournamentParent: ReturnType<typeof tournamentDocRef> | null =
                    null;
                  if (tournamentId != null && tournamentId !== '') {
                    if (parentCollectionId === 'scheduledTournaments') {
                      tournamentParent = tournamentDocRef(tournamentId);
                    } else {
                      tournamentParent = {
                        ...tournamentDocRef(tournamentId),
                        parent: {id: parentCollectionId},
                      };
                    }
                  }
                  return {
                    id: o.id,
                    data: () => o.data,
                    ref: {
                      parent: {
                        parent: tournamentParent,
                      },
                    },
                  };
                }),
            }),
          }),
        }),
      };
    },
  } as any;
}

describe('assertUserFreeForMigration', () => {
  const uid = 'user-1';

  it('passes when user is free', async () => {
    await expect(
      assertUserFreeForMigration(uid, {
        db: makeDb({
          activeStay: {isActive: false},
          user: {currentTable: null, currentSeat: null},
        }),
      })
    ).resolves.toBeUndefined();
  });

  it('rejects active stay', async () => {
    await expect(
      assertUserFreeForMigration(uid, {
        db: makeDb({activeStay: {isActive: true}, user: {}}),
      })
    ).rejects.toMatchObject({details: expect.objectContaining({errorKey: 'USER_HAS_ACTIVE_STAY'})});
  });

  it('rejects unsettled bill', async () => {
    await expect(
      assertUserFreeForMigration(uid, {
        db: makeDb({
          activeStay: null,
          user: {},
          bills: [{id: 'b1', data: {partyUserId: uid, status: 'open'}}],
        }),
      })
    ).rejects.toMatchObject({
      details: expect.objectContaining({errorKey: 'USER_HAS_UNSETTLED_BILL'}),
    });
  });

  it('rejects post_settlement_pending bill', async () => {
    await expect(
      assertUserFreeForMigration(uid, {
        db: makeDb({
          activeStay: null,
          user: {},
          bills: [{id: 'b1', data: {partyUserId: uid, status: 'post_settlement_pending'}}],
        }),
      })
    ).rejects.toMatchObject({
      details: expect.objectContaining({errorKey: 'USER_HAS_POST_SETTLEMENT_PENDING'}),
    });
  });

  it('rejects currentTable', async () => {
    await expect(
      assertUserFreeForMigration(uid, {
        db: makeDb({
          activeStay: null,
          user: {currentTable: 'T1', currentSeat: null},
        }),
      })
    ).rejects.toMatchObject({
      details: expect.objectContaining({errorKey: 'USER_HAS_ACTIVE_TABLE_SEAT'}),
    });
  });

  it('rejects currentSeat', async () => {
    await expect(
      assertUserFreeForMigration(uid, {
        db: makeDb({
          activeStay: null,
          user: {currentTable: null, currentSeat: 3},
        }),
      })
    ).rejects.toMatchObject({
      details: expect.objectContaining({errorKey: 'USER_HAS_ACTIVE_TABLE_SEAT'}),
    });
  });

  it('rejects settling bill as unsettled', async () => {
    await expect(
      assertUserFreeForMigration(uid, {
        db: makeDb({
          activeStay: null,
          user: {},
          bills: [{id: 'b1', data: {partyUserId: uid, status: 'settling'}}],
        }),
      })
    ).rejects.toMatchObject({
      details: expect.objectContaining({errorKey: 'USER_HAS_UNSETTLED_BILL'}),
    });
  });

  it('rejects tournament waiting on current business date', async () => {
    await expect(
      assertUserFreeForMigration(uid, {
        db: makeDb({
          activeStay: null,
          user: {},
          tournaments: [
            {
              id: 'tour-1',
              data: {status: 'running', businessDate: CURRENT_BUSINESS_DATE},
              tablesSeat: [{id: 'waiting', data: {waiting: {[uid]: {order: 1}}}}],
            },
          ],
        }),
      })
    ).rejects.toMatchObject({
      details: expect.objectContaining({errorKey: 'USER_HAS_ACTIVE_TOURNAMENT'}),
    });
  });

  it('rejects tournament seated on current business date', async () => {
    await expect(
      assertUserFreeForMigration(uid, {
        db: makeDb({
          activeStay: null,
          user: {},
          tournaments: [
            {
              id: 'tour-1',
              data: {status: 'running', businessDate: CURRENT_BUSINESS_DATE},
              tablesSeat: [
                {id: 'waiting', data: {waiting: {}}},
                {id: 'table-1', data: {seats: {seat01UserId: uid}}},
              ],
            },
          ],
        }),
      })
    ).rejects.toMatchObject({
      details: expect.objectContaining({errorKey: 'USER_HAS_ACTIVE_TOURNAMENT'}),
    });
  });

  it('allows past-business-date tournament even if still running', async () => {
    await expect(
      assertUserFreeForMigration(uid, {
        db: makeDb({
          activeStay: null,
          user: {},
          tournaments: [
            {
              id: 'tour-old',
              data: {status: 'running', businessDate: '2026-07-01'},
              tablesSeat: [
                {id: 'table-1', data: {seats: {seat01UserId: uid}}},
              ],
            },
          ],
        }),
      })
    ).resolves.toBeUndefined();
  });

  it('allows ended tournament history', async () => {
    await expect(
      assertUserFreeForMigration(uid, {
        db: makeDb({
          activeStay: null,
          user: {},
          tournaments: [
            {
              id: 'tour-ended',
              data: {status: 'ended', businessDate: CURRENT_BUSINESS_DATE},
              tablesSeat: [{id: 'table-1', data: {seats: {seat01UserId: uid}}}],
            },
          ],
        }),
      })
    ).resolves.toBeUndefined();
  });

  it('rejects side game seat', async () => {
    await expect(
      assertUserFreeForMigration(uid, {
        db: makeDb({
          activeStay: null,
          user: {},
          sideGames: [{id: 'sg-1', data: {seats: {seat02UserId: uid}}}],
        }),
      })
    ).rejects.toMatchObject({
      details: expect.objectContaining({errorKey: 'USER_HAS_SIDE_GAME_SEAT'}),
    });
  });

  it('rejects pending okibake link', async () => {
    await expect(
      assertUserFreeForMigration(uid, {
        db: makeDb({
          activeStay: null,
          user: {},
          tournaments: [
            {
              id: 'tour-ended',
              data: {status: 'ended', businessDate: '2026-05-25'},
            },
          ],
          okibake: [
            {
              id: 'ok-1',
              tournamentId: 'tour-ended',
              data: {
                linkedUserId: uid,
                billLinkStatus: 'pending_review',
                entryStatus: 'registered',
              },
            },
          ],
        }),
      })
    ).rejects.toMatchObject({
      details: expect.objectContaining({errorKey: 'USER_HAS_PENDING_OKIBAKE_LINK'}),
    });
  });

  it('allows voided okibake link', async () => {
    await expect(
      assertUserFreeForMigration(uid, {
        db: makeDb({
          activeStay: null,
          user: {},
          tournaments: [
            {id: 'tour-running', data: {status: 'running', businessDate: CURRENT_BUSINESS_DATE}},
          ],
          okibake: [
            {
              id: 'ok-1',
              tournamentId: 'tour-running',
              data: {
                linkedUserId: uid,
                billLinkStatus: 'unlinked',
                entryStatus: 'voided',
              },
            },
          ],
        }),
      })
    ).resolves.toBeUndefined();
  });

  it('rejects unlinked okibake on running tournament', async () => {
    await expect(
      assertUserFreeForMigration(uid, {
        db: makeDb({
          activeStay: null,
          user: {},
          tournaments: [
            {id: 'tour-run', data: {status: 'running', businessDate: CURRENT_BUSINESS_DATE}},
          ],
          okibake: [
            {
              id: 'ok-1',
              tournamentId: 'tour-run',
              data: {
                linkedUserId: uid,
                billLinkStatus: 'unlinked',
                entryStatus: 'seated',
              },
            },
          ],
        }),
      })
    ).rejects.toMatchObject({
      details: expect.objectContaining({errorKey: 'USER_HAS_PENDING_OKIBAKE_LINK'}),
    });
  });

  it('allows historical unlinked okibake on ended tournament (USR-07 regression)', async () => {
    await expect(
      assertUserFreeForMigration(uid, {
        db: makeDb({
          activeStay: null,
          user: {},
          tournaments: [
            {
              id: '3Cdbl7regkoI9ODGy5t2',
              data: {status: 'ended', businessDate: '2026-05-25'},
            },
          ],
          okibake: [
            {
              id: 'lKgIVH8cxzQzBwt0Azvt',
              tournamentId: '3Cdbl7regkoI9ODGy5t2',
              data: {
                linkedUserId: uid,
                billLinkStatus: 'unlinked',
                entryStatus: 'busted',
                linkedBillId: null,
              },
            },
          ],
        }),
      })
    ).resolves.toBeUndefined();
  });

  it('allows unlinked okibake on force_ended tournament', async () => {
    await expect(
      assertUserFreeForMigration(uid, {
        db: makeDb({
          activeStay: null,
          user: {},
          tournaments: [{id: 'tour-fe', data: {status: 'force_ended'}}],
          okibake: [
            {
              id: 'ok-1',
              tournamentId: 'tour-fe',
              data: {
                linkedUserId: uid,
                billLinkStatus: 'unlinked',
                entryStatus: 'registered',
              },
            },
          ],
        }),
      })
    ).resolves.toBeUndefined();
  });

  it('allows unlinked okibake on cancelled tournament', async () => {
    await expect(
      assertUserFreeForMigration(uid, {
        db: makeDb({
          activeStay: null,
          user: {},
          tournaments: [{id: 'tour-c1', data: {status: 'cancelled'}}],
          okibake: [
            {
              id: 'ok-1',
              tournamentId: 'tour-c1',
              data: {
                linkedUserId: uid,
                billLinkStatus: 'unlinked',
                entryStatus: 'registered',
              },
            },
          ],
        }),
      })
    ).resolves.toBeUndefined();
  });

  it('allows unlinked okibake on canceled tournament', async () => {
    await expect(
      assertUserFreeForMigration(uid, {
        db: makeDb({
          activeStay: null,
          user: {},
          tournaments: [{id: 'tour-c2', data: {status: 'canceled'}}],
          okibake: [
            {
              id: 'ok-1',
              tournamentId: 'tour-c2',
              data: {
                linkedUserId: uid,
                billLinkStatus: 'unlinked',
                entryStatus: 'registered',
              },
            },
          ],
        }),
      })
    ).resolves.toBeUndefined();
  });

  it('rejects pending_review on historical ended tournament', async () => {
    await expect(
      assertUserFreeForMigration(uid, {
        db: makeDb({
          activeStay: null,
          user: {},
          tournaments: [
            {
              id: 'tour-old-ended',
              data: {status: 'ended', businessDate: '2026-01-01'},
            },
          ],
          okibake: [
            {
              id: 'ok-pr',
              tournamentId: 'tour-old-ended',
              data: {
                linkedUserId: uid,
                billLinkStatus: 'pending_review',
                entryStatus: 'busted',
              },
            },
          ],
        }),
      })
    ).rejects.toMatchObject({
      details: expect.objectContaining({errorKey: 'USER_HAS_PENDING_OKIBAKE_LINK'}),
    });
  });

  it('rejects unlinked okibake when parent tournament is missing', async () => {
    await expect(
      assertUserFreeForMigration(uid, {
        db: makeDb({
          activeStay: null,
          user: {},
          tournaments: [],
          okibake: [
            {
              id: 'ok-1',
              tournamentId: 'tour-gone',
              data: {
                linkedUserId: uid,
                billLinkStatus: 'unlinked',
                entryStatus: 'registered',
              },
            },
          ],
        }),
      })
    ).rejects.toMatchObject({
      details: expect.objectContaining({errorKey: 'USER_HAS_PENDING_OKIBAKE_LINK'}),
    });
  });

  it('rejects unlinked okibake when parent tournament path is missing', async () => {
    await expect(
      assertUserFreeForMigration(uid, {
        db: makeDb({
          activeStay: null,
          user: {},
          okibake: [
            {
              id: 'ok-1',
              tournamentId: null,
              data: {
                linkedUserId: uid,
                billLinkStatus: 'unlinked',
                entryStatus: 'registered',
              },
            },
          ],
        }),
      })
    ).rejects.toMatchObject({
      details: expect.objectContaining({errorKey: 'USER_HAS_PENDING_OKIBAKE_LINK'}),
    });
  });

  it('rejects unlinked okibake when parent status is missing', async () => {
    await expect(
      assertUserFreeForMigration(uid, {
        db: makeDb({
          activeStay: null,
          user: {},
          tournaments: [{id: 'tour-nostatus', data: {businessDate: '2026-05-25'}}],
          okibake: [
            {
              id: 'ok-1',
              tournamentId: 'tour-nostatus',
              data: {
                linkedUserId: uid,
                billLinkStatus: 'unlinked',
                entryStatus: 'registered',
              },
            },
          ],
        }),
      })
    ).rejects.toMatchObject({
      details: expect.objectContaining({errorKey: 'USER_HAS_PENDING_OKIBAKE_LINK'}),
    });
  });

  it('rejects unlinked okibake when parent status is unknown', async () => {
    await expect(
      assertUserFreeForMigration(uid, {
        db: makeDb({
          activeStay: null,
          user: {},
          tournaments: [{id: 'tour-weird', data: {status: 'weird_legacy'}}],
          okibake: [
            {
              id: 'ok-1',
              tournamentId: 'tour-weird',
              data: {
                linkedUserId: uid,
                billLinkStatus: 'unlinked',
                entryStatus: 'registered',
              },
            },
          ],
        }),
      })
    ).rejects.toMatchObject({
      details: expect.objectContaining({errorKey: 'USER_HAS_PENDING_OKIBAKE_LINK'}),
    });
  });

  it('tx recheck mode only evaluates stay and table/seat', async () => {
    await expect(
      assertUserFreeForMigration(uid, {
        db: makeDb({
          bills: [{id: 'b1', data: {partyUserId: uid, status: 'open'}}],
        }),
        includeRemoteScans: false,
        userSnapshot: {currentTable: null, currentSeat: null},
        activeStaySnapshot: {exists: false, data: () => undefined},
      })
    ).resolves.toBeUndefined();
  });

  it('throws HttpsError instances', async () => {
    try {
      await assertUserFreeForMigration(uid, {
        db: makeDb({activeStay: {isActive: true}, user: {}}),
      });
      fail('expected throw');
    } catch (e) {
      expect(e).toBeInstanceOf(HttpsError);
    }
  });
});
