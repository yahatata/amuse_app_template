import { initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { collectOkibakeLoginPromptTargets } from '../../src/domains/user/services/okibakeLoginPrompt';

describe('collectOkibakeLoginPromptTargets', () => {
  let testEnv: RulesTestEnvironment;
  let db: admin.firestore.Firestore;
  const projectId = 'amuse-app-template';

  beforeAll(async () => {
    process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8081';
    testEnv = await initializeTestEnvironment({ projectId });

    if (admin.apps.length > 0) {
      await Promise.all(admin.apps.map((a) => a?.delete()).filter(Boolean));
    }
    admin.initializeApp({ projectId });
    db = getFirestore();
  });

  afterAll(async () => {
    await testEnv.cleanup();
    await Promise.all(admin.apps.map((a) => a?.delete()).filter(Boolean));
    delete process.env.FIRESTORE_EMULATOR_HOST;
  });

  beforeEach(async () => {
    await testEnv.clearFirestore();
  });

  it('pending_review は過去営業日でも対象、unlinked は当日営業日のみ対象', async () => {
    await db.collection('scheduledTournaments').doc('today-tour').set({
      businessDate: '2026-05-31',
    });
    await db.collection('scheduledTournaments').doc('past-tour').set({
      businessDate: '2026-05-30',
    });

    const colToday = db
      .collection('scheduledTournaments')
      .doc('today-tour')
      .collection('okibakeTemporaryEntries');
    const colPast = db
      .collection('scheduledTournaments')
      .doc('past-tour')
      .collection('okibakeTemporaryEntries');

    await colToday.doc('u-today').set({
      linkedUserId: 'user-1',
      entryStatus: 'registered',
      billLinkStatus: 'unlinked',
    });
    await colPast.doc('u-past').set({
      linkedUserId: 'user-1',
      entryStatus: 'registered',
      billLinkStatus: 'unlinked',
    });
    await colPast.doc('p-past').set({
      linkedUserId: 'user-1',
      entryStatus: 'registered',
      billLinkStatus: 'pending_review',
    });
    await colToday.doc('linked').set({
      linkedUserId: 'user-1',
      entryStatus: 'registered',
      billLinkStatus: 'linked',
    });
    await colToday.doc('voided').set({
      linkedUserId: 'user-1',
      entryStatus: 'voided',
      billLinkStatus: 'pending_review',
    });
    await colToday.doc('other-user').set({
      linkedUserId: 'user-2',
      entryStatus: 'registered',
      billLinkStatus: 'pending_review',
    });

    const rows = await collectOkibakeLoginPromptTargets({
      db,
      linkedUserId: 'user-1',
      currentBusinessDate: '2026-05-31',
    });
    const ids = rows.map((r) => r.okibakeEntryId).sort();

    expect(ids).toEqual(['p-past', 'u-today']);
  });
});

