/**
 * getRankingData（Firestore Emulator）
 */

import { initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';

describe('getRankingData', () => {
  let testEnv: RulesTestEnvironment;
  let db: admin.firestore.Firestore;
  let getRankingData: { run: (req: unknown) => Promise<Record<string, unknown>> };
  const projectId = 'test-get-ranking-data-fn';

  const ts = (seconds: number) => admin.firestore.Timestamp.fromMillis(seconds * 1000);

  beforeAll(async () => {
    process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8081';
    testEnv = await initializeTestEnvironment({ projectId });
    if (admin.apps.length > 0) {
      await Promise.all(admin.apps.map((a) => a?.delete()).filter(Boolean));
    }
    admin.initializeApp({ projectId });
    db = getFirestore();
    const mod = await import('../../src/domains/tournament_activeTournament/callables/getRankingData');
    getRankingData = mod.getRankingData as typeof getRankingData;
  });

  afterAll(async () => {
    await testEnv.cleanup();
    await Promise.all(admin.apps.map((a) => a?.delete()).filter(Boolean));
    delete process.env.FIRESTORE_EMULATOR_HOST;
  });

  beforeEach(async () => {
    await testEnv.clearFirestore();
  });

  async function seedMainView(tournamentId: string) {
    await db.collection('scheduledTournaments').doc(tournamentId).set({
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    await db
      .collection('scheduledTournaments')
      .doc(tournamentId)
      .collection('views')
      .doc('main')
      .set({
        prizePool: 10000,
        playersBusted: 0,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
  }

  async function seedBustedUser(
    tournamentId: string,
    bustedUser: Record<string, { pokerName: string; bustAt: admin.firestore.Timestamp }>
  ) {
    await db
      .collection('scheduledTournaments')
      .doc(tournamentId)
      .collection('tablesSeat')
      .doc('busted')
      .set({ bustedUser });
  }

  async function seedOkibakeEntry(
    tournamentId: string,
    entryId: string,
    data: Record<string, unknown>
  ) {
    await db
      .collection('scheduledTournaments')
      .doc(tournamentId)
      .collection('okibakeTemporaryEntries')
      .doc(entryId)
      .set(data);
  }

  async function runGetRanking(tournamentId: string) {
    const res = await getRankingData.run({ data: { tournamentId } } as any);
    expect(res.success).toBe(true);
    return res.bustedPlayers as Array<{
      uid: string;
      pokerName: string;
      bustAt: admin.firestore.Timestamp | null;
    }>;
  }

  it('通常 bustedUser のみの場合、既存通り bustedPlayers に出る', async () => {
    const tid = 't-regular-bust';
    await seedMainView(tid);
    await seedBustedUser(tid, {
      'user-regular': { pokerName: '通常太郎', bustAt: ts(500) },
    });

    const bustedPlayers = await runGetRanking(tid);

    expect(bustedPlayers).toHaveLength(1);
    expect(bustedPlayers[0]).toMatchObject({
      uid: 'user-regular',
      pokerName: '通常太郎',
    });
    expect(bustedPlayers[0].bustAt?.seconds).toBe(500);
  });

  it('linked + busted の okibakeTemporaryEntry が bustedPlayers に補完される', async () => {
    const tid = 't-okibake-linked-bust';
    await seedMainView(tid);
    await seedOkibakeEntry(tid, 'e-linked-bust', {
      okibakeEntryId: 'e-linked-bust',
      tournamentId: tid,
      entryStatus: 'busted',
      billLinkStatus: 'linked',
      linkedUserId: 'guest-linked',
      linkedUserPokerName: 'リンク太郎',
      temporaryDisplayName: 'オキバケA',
      bustedAt: ts(300),
    });

    const bustedPlayers = await runGetRanking(tid);

    expect(bustedPlayers).toHaveLength(1);
    expect(bustedPlayers[0]).toMatchObject({
      uid: 'guest-linked',
      pokerName: 'リンク太郎',
    });
    expect(bustedPlayers[0].bustAt?.seconds).toBe(300);
  });

  it('unlinked + busted は出ない', async () => {
    const tid = 't-unlinked-bust';
    await seedMainView(tid);
    await seedOkibakeEntry(tid, 'e-unlinked', {
      entryStatus: 'busted',
      billLinkStatus: 'unlinked',
      linkedUserId: null,
      temporaryDisplayName: 'オキバケB',
      bustedAt: ts(100),
    });

    const bustedPlayers = await runGetRanking(tid);
    expect(bustedPlayers).toHaveLength(0);
  });

  it('pending_review + busted は出ない', async () => {
    const tid = 't-pending-bust';
    await seedMainView(tid);
    await seedOkibakeEntry(tid, 'e-pending', {
      entryStatus: 'busted',
      billLinkStatus: 'pending_review',
      linkedUserId: 'guest-pending',
      linkedUserPokerName: '保留太郎',
      bustedAt: ts(100),
    });

    const bustedPlayers = await runGetRanking(tid);
    expect(bustedPlayers).toHaveLength(0);
  });

  it('linked + seated は出ない', async () => {
    const tid = 't-linked-seat';
    await seedMainView(tid);
    await seedOkibakeEntry(tid, 'e-seated', {
      entryStatus: 'seated',
      billLinkStatus: 'linked',
      linkedUserId: 'guest-seated',
      linkedUserPokerName: '着席太郎',
    });

    const bustedPlayers = await runGetRanking(tid);
    expect(bustedPlayers).toHaveLength(0);
  });

  it('linked + registered は出ない', async () => {
    const tid = 't-linked-reg';
    await seedMainView(tid);
    await seedOkibakeEntry(tid, 'e-reg', {
      entryStatus: 'registered',
      billLinkStatus: 'linked',
      linkedUserId: 'guest-reg',
      linkedUserPokerName: '登録太郎',
    });

    const bustedPlayers = await runGetRanking(tid);
    expect(bustedPlayers).toHaveLength(0);
  });

  it('linked + busted でも linkedUserId がなければ出ない', async () => {
    const tid = 't-no-uid';
    await seedMainView(tid);
    await seedOkibakeEntry(tid, 'e-no-uid', {
      entryStatus: 'busted',
      billLinkStatus: 'linked',
      linkedUserId: null,
      temporaryDisplayName: 'オキバケC',
      bustedAt: ts(100),
    });

    const bustedPlayers = await runGetRanking(tid);
    expect(bustedPlayers).toHaveLength(0);
  });

  it('既存 bustedUser に同一 uid がある場合、okibake 由来は重複追加しない', async () => {
    const tid = 't-dedupe';
    await seedMainView(tid);
    await seedBustedUser(tid, {
      'user-dup': { pokerName: '通常経路', bustAt: ts(900) },
    });
    await seedOkibakeEntry(tid, 'e-dup', {
      entryStatus: 'busted',
      billLinkStatus: 'linked',
      linkedUserId: 'user-dup',
      linkedUserPokerName: '置きバケ経路',
      bustedAt: ts(100),
    });

    const bustedPlayers = await runGetRanking(tid);

    expect(bustedPlayers).toHaveLength(1);
    expect(bustedPlayers[0]).toMatchObject({
      uid: 'user-dup',
      pokerName: '通常経路',
    });
  });

  it('linkedUserPokerName がなければ temporaryDisplayName に fallback する', async () => {
    const tid = 't-fallback-name';
    await seedMainView(tid);
    await seedOkibakeEntry(tid, 'e-fallback', {
      entryStatus: 'busted',
      billLinkStatus: 'linked',
      linkedUserId: 'guest-fallback',
      linkedUserPokerName: null,
      temporaryDisplayName: 'オキバケZ',
      bustedAt: ts(50),
    });

    const bustedPlayers = await runGetRanking(tid);

    expect(bustedPlayers[0].pokerName).toBe('オキバケZ');
  });

  it('bustedAt で既存 sort 方針どおり bustAt 降順で並ぶ', async () => {
    const tid = 't-sort';
    await seedMainView(tid);
    await seedBustedUser(tid, {
      'user-old': { pokerName: '古い', bustAt: ts(100) },
    });
    await seedOkibakeEntry(tid, 'e-new', {
      entryStatus: 'busted',
      billLinkStatus: 'linked',
      linkedUserId: 'guest-new',
      linkedUserPokerName: '新しい',
      bustedAt: ts(500),
    });

    const bustedPlayers = await runGetRanking(tid);

    expect(bustedPlayers.map((p) => p.uid)).toEqual(['guest-new', 'user-old']);
  });
});
