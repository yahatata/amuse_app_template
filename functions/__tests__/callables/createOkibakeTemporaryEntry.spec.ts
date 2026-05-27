/**
 * Phase2 createOkibakeTemporaryEntry Callable（Firestore Emulator）
 */

import { initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';

describe('createOkibakeTemporaryEntry', () => {
  let testEnv: RulesTestEnvironment;
  let db: admin.firestore.Firestore;
  let createOkibakeTemporaryEntry: { run: (req: unknown) => Promise<Record<string, unknown>> };
  const projectId = 'test-okibake-phase2';

  beforeAll(async () => {
    process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8081';
    testEnv = await initializeTestEnvironment({ projectId });
    if (admin.apps.length > 0) {
      await Promise.all(admin.apps.map((a) => a?.delete()).filter(Boolean));
    }
    admin.initializeApp({ projectId });
    db = getFirestore();
    const mod = await import(
      '../../src/domains/tournament_activeTournament/callables/createOkibakeTemporaryEntry'
    );
    createOkibakeTemporaryEntry = mod.createOkibakeTemporaryEntry as {
      run: (req: unknown) => Promise<Record<string, unknown>>;
    };
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
      name: 'Terminal Okibake Test',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }

  async function seedTournament(tournamentId: string) {
    await db.collection('scheduledTournaments').doc(tournamentId).set({
      okibakeNextDisplayNumber: 1,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    await db
      .collection('scheduledTournaments')
      .doc(tournamentId)
      .collection('views')
      .doc('main')
      .set({
        playersIn: 0,
        entries: 0,
        waitingCount: 0,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
  }

  it('作成・views/main と okibakeNextDisplayNumber と operationLogs を同一トランザクションで更新すること', async () => {
    const uid = 'device-user-001';
    const tournamentId = 't-okibake-1';
    await seedDevice(uid);
    await seedTournament(tournamentId);

    const operationId = 'op-abc-001';
    const mockRequest = {
      data: {
        operationId,
        tournamentId,
        addonIntent: 'unknown',
        memo: '  メモ ',
      },
      auth: { uid },
    } as any;

    const res = await createOkibakeTemporaryEntry.run(mockRequest);
    expect(res.success).toBe(true);
    expect(res.replay).toBe(false);
    expect(typeof res.okibakeEntryId).toBe('string');
    expect(res.temporaryDisplayName).toBe('オキバケA');

    const tourDoc = await db.collection('scheduledTournaments').doc(tournamentId).get();
    expect(tourDoc.data()!.okibakeNextDisplayNumber).toBe(2);

    const main = await db
      .collection('scheduledTournaments')
      .doc(tournamentId)
      .collection('views')
      .doc('main')
      .get();
    expect(main.data()!.entries).toBe(1);
    expect(main.data()!.playersIn).toBe(1);
    expect(main.data()!.waitingCount).toBe(1);

    const op = await db.collection('operationLogs').doc(operationId).get();
    expect(op.exists).toBe(true);
    expect(op.data()!.status).toBe('succeeded');
    const pl = op.data()!.payload as Record<string, unknown>;
    expect(pl.okibakeEntryId).toBe(res.okibakeEntryId);
  });

  it('同一 operationId は冪等（トランザクション外のプリ読でもリプレイ）であること', async () => {
    const uid = 'device-user-002';
    const tournamentId = 't-okibake-2';
    await seedDevice(uid);
    await seedTournament(tournamentId);

    const operationId = 'op-replay-1';
    const mockRequest = {
      data: { operationId, tournamentId, addonIntent: 'yes' },
      auth: { uid },
    } as any;

    const first = await createOkibakeTemporaryEntry.run(mockRequest);
    expect(first.success).toBe(true);
    const second = await createOkibakeTemporaryEntry.run(mockRequest);
    expect(second.success).toBe(true);
    expect(second.replay).toBe(true);
    expect(second.okibakeEntryId).toBe(first.okibakeEntryId);

    const coll = db
      .collection('scheduledTournaments')
      .doc(tournamentId)
      .collection('okibakeTemporaryEntries');
    const snaps = await coll.get();
    expect(snaps.size).toBe(1);
  });
});
