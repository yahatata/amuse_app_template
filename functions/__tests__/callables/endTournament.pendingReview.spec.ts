import { initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';

const logOpsErrorMock = jest.fn();
jest.mock('../../src/shared/logging/logOpsError', () => ({
  logOpsError: (...args: unknown[]) => logOpsErrorMock(...args),
  logOpsSuccess: jest.fn(),
}));

describe('endTournament pending review block details', () => {
  let testEnv: RulesTestEnvironment;
  let db: admin.firestore.Firestore;
  let endTournament: { run: (req: unknown) => Promise<Record<string, unknown>> };
  const projectId = 'test-end-tournament-pending-review';

  beforeAll(async () => {
    process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8081';
    testEnv = await initializeTestEnvironment({ projectId });
    if (admin.apps.length > 0) {
      await Promise.all(admin.apps.map((a) => a?.delete()).filter(Boolean));
    }
    admin.initializeApp({ projectId });
    db = getFirestore();
    const mod = await import(
      '../../src/domains/tournament_activeTournament/callables/endTournament'
    );
    endTournament = mod.endTournament as typeof endTournament;
  });

  afterAll(async () => {
    await testEnv.cleanup();
    await Promise.all(admin.apps.map((a) => a?.delete()).filter(Boolean));
    delete process.env.FIRESTORE_EMULATOR_HOST;
  });

  beforeEach(async () => {
    await testEnv.clearFirestore();
    logOpsErrorMock.mockClear();
  });

  async function seedDevice(uid: string) {
    await db.collection('devices').add({
      uid,
      role: 'admin',
      status: 'active',
      name: 'Terminal End',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }

  async function seedTournament(tournamentId: string) {
    await db.collection('scheduledTournaments').doc(tournamentId).set({
      status: 'registered',
      templateId: 'tpl-end-pending',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
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
        temporaryDisplayName: '置きバケA',
        billLinkStatus: 'unlinked',
        entryStatus: 'registered',
        linkedUserId: null,
        linkedUserPokerName: null,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        ...data,
      });
  }

  function runEnd(uid: string, tournamentId: string) {
    return endTournament.run({
      data: { tournamentId, endType: 'normal' },
      auth: { uid },
    } as any);
  }

  it('linkedUserId 未設定の unlinked 置きバケがあると details.errorKey を返してブロック', async () => {
    const uid = 'u-end-block';
    const tid = 't-end-block';
    await seedDevice(uid);
    await seedTournament(tid);
    await seedOkibakeEntry(tid, 'ok-1', {
      entryStatus: 'seated',
      temporaryDisplayName: '未設定置きバケ',
    });

    await expect(runEnd(uid, tid)).rejects.toMatchObject({
      code: 'failed-precondition',
      details: {
        errorKey: 'TOURNAMENT_OKIBAKE_LINKED_USER_REQUIRED',
      },
    });
    expect(logOpsErrorMock).not.toHaveBeenCalled();

    try {
      await runEnd(uid, tid);
    } catch (e) {
      const err = e as HttpsError;
      const details = err.details as Record<string, unknown>;
      const entries = (details['blockingOkibakeEntries'] as Array<Record<string, unknown>>) ?? [];
      expect(entries.length).toBe(1);
      expect(entries[0].okibakeEntryId).toBe('ok-1');
      expect(entries[0].displayName).toBe('未設定置きバケ');
      expect(entries[0].entryStatus).toBe('seated');
    }
  });

  it('linkedUserId 設定済み unlinked は pending_review 化し、linked/voided は対象外', async () => {
    const uid = 'u-end-move';
    const tid = 't-end-move';
    await seedDevice(uid);
    await seedTournament(tid);
    await seedOkibakeEntry(tid, 'ok-move', {
      entryStatus: 'busted',
      linkedUserId: 'user-a',
      linkedUserPokerName: 'A',
    });
    await seedOkibakeEntry(tid, 'ok-linked', {
      billLinkStatus: 'linked',
      linkedUserId: 'user-b',
      linkedUserPokerName: 'B',
    });
    await seedOkibakeEntry(tid, 'ok-voided', {
      entryStatus: 'voided',
      billLinkStatus: 'unlinked',
    });

    const res = await runEnd(uid, tid);
    expect(res.success).toBe(true);

    const moveDoc = await db
      .collection('scheduledTournaments')
      .doc(tid)
      .collection('okibakeTemporaryEntries')
      .doc('ok-move')
      .get();
    expect(moveDoc.data()?.billLinkStatus).toBe('pending_review');
    expect(moveDoc.data()?.entryStatus).toBe('busted');

    const linkedDoc = await db
      .collection('scheduledTournaments')
      .doc(tid)
      .collection('okibakeTemporaryEntries')
      .doc('ok-linked')
      .get();
    expect(linkedDoc.data()?.billLinkStatus).toBe('linked');
  });
});

