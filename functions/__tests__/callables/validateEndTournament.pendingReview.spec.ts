import { initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';

describe('validateEndTournament pending review block details', () => {
  let testEnv: RulesTestEnvironment;
  let db: admin.firestore.Firestore;
  let validateEndTournament: { run: (req: unknown) => Promise<Record<string, unknown>> };
  const projectId = 'test-validate-end-pending-review';

  beforeAll(async () => {
    process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8081';
    testEnv = await initializeTestEnvironment({ projectId });
    if (admin.apps.length > 0) {
      await Promise.all(admin.apps.map((a) => a?.delete()).filter(Boolean));
    }
    admin.initializeApp({ projectId });
    db = getFirestore();
    const mod = await import(
      '../../src/domains/tournament_activeTournament/callables/validateEndTournament'
    );
    validateEndTournament = mod.validateEndTournament as typeof validateEndTournament;
  });

  afterAll(async () => {
    await testEnv.cleanup();
    await Promise.all(admin.apps.map((a) => a?.delete()).filter(Boolean));
    delete process.env.FIRESTORE_EMULATOR_HOST;
  });

  beforeEach(async () => {
    await testEnv.clearFirestore();
  });

  async function seedDevice(uid: string) {
    await db.collection('devices').add({
      uid,
      role: 'admin',
      status: 'active',
      name: 'Terminal Validate',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }

  async function seedTournament(tournamentId: string) {
    await db.collection('scheduledTournaments').doc(tournamentId).set({
      status: 'registered',
      templateId: 'tpl-validate-pending',
      snapshot: { pointType: 'pointA' },
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    await db
      .collection('scheduledTournaments')
      .doc(tournamentId)
      .collection('views')
      .doc('main')
      .set({
        prizePool: 10000,
        pointType: 'pointA',
        '1stPrize': 5000,
        '1stPlayerUid': 'u1',
        '1stPlayerName': 'P1',
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
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
      .set({
        okibakeEntryId: entryId,
        tournamentId,
        temporaryDisplayName: '置きバケB',
        billLinkStatus: 'unlinked',
        entryStatus: 'registered',
        linkedUserId: null,
        linkedUserPokerName: null,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        ...data,
      });
  }

  it('未設定ブロック時に errorKey と blockingOkibakeEntries を返す', async () => {
    const uid = 'u-validate-block';
    const tid = 't-validate-block';
    await seedDevice(uid);
    await seedTournament(tid);
    await seedOkibakeEntry(tid, 'ok-v-1', {
      entryStatus: 'registered',
      temporaryDisplayName: '未設定B',
    });

    const res = await validateEndTournament.run({
      data: { tournamentId: tid },
      auth: { uid },
    } as any);

    expect(res.success).toBe(false);
    expect(res.errorKey).toBe('TOURNAMENT_OKIBAKE_LINKED_USER_REQUIRED');
    const entries = res.blockingOkibakeEntries as Array<Record<string, unknown>>;
    expect(entries.length).toBe(1);
    expect(entries[0].okibakeEntryId).toBe('ok-v-1');
    expect(entries[0].entryStatus).toBe('registered');
  });
});

