import { initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { mapScheduledTournamentsForLiff } from '../../src/shared/tournament/mapScheduledTournamentForLiff';

describe('mapScheduledTournamentsForLiff', () => {
  let testEnv: RulesTestEnvironment;
  let db: admin.firestore.Firestore;
  const projectId = 'test-project-map-scheduled-tournament-for-liff';

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

  it('snapshot から maxReentries / addonLimitPerPlayer を返す', async () => {
    await db.collection('scheduledTournaments').doc('tour-1').set({
      templateId: 'tpl-1',
      status: 'scheduled',
      startAt: admin.firestore.Timestamp.fromDate(new Date('2026-06-03T05:00:00.000Z')),
      regEndAt: admin.firestore.Timestamp.fromDate(new Date('2026-06-03T07:00:00.000Z')),
      snapshot: {
        name: '上限ありトナメ',
        entryFee: 3000,
        startStack: 20000,
        isReentry: true,
        maxReentries: 2,
        reentryFee: 3000,
        isAddon: true,
        addonLimitPerPlayer: 1,
        addonFee: 2000,
      },
    });

    const docs = (await db.collection('scheduledTournaments').get()).docs;
    const items = await mapScheduledTournamentsForLiff({
      docs,
      db,
      templateById: new Map(),
      includeRegistrationStatus: false,
    });

    expect(items).toHaveLength(1);
    expect(items[0].maxReentries).toBe(2);
    expect(items[0].addonLimitPerPlayer).toBe(1);
  });

  it('snapshot に無い場合は template から maxReentries / addonLimitPerPlayer を返す', async () => {
    await db.collection('scheduledTournaments').doc('tour-2').set({
      templateId: 'tpl-2',
      status: 'scheduled',
      startAt: admin.firestore.Timestamp.fromDate(new Date('2026-06-03T05:00:00.000Z')),
      regEndAt: admin.firestore.Timestamp.fromDate(new Date('2026-06-03T07:00:00.000Z')),
      snapshot: {
        name: 'テンプレート参照トナメ',
        entryFee: 1000,
        startStack: 10000,
        isReentry: true,
        isAddon: true,
      },
    });

    const docs = (await db.collection('scheduledTournaments').get()).docs;
    const items = await mapScheduledTournamentsForLiff({
      docs,
      db,
      templateById: new Map([
        [
          'tpl-2',
          {
            maxReentries: 3,
            addonLimitPerPlayer: 2,
            reentryFee: 1000,
            addonFee: 500,
          },
        ],
      ]),
      includeRegistrationStatus: false,
    });

    expect(items[0].maxReentries).toBe(3);
    expect(items[0].addonLimitPerPlayer).toBe(2);
    expect(items[0].reentryFee).toBe(1000);
    expect(items[0].addonFee).toBe(500);
  });

  it('上限未設定の場合は null を返す', async () => {
    await db.collection('scheduledTournaments').doc('tour-3').set({
      templateId: 'tpl-3',
      status: 'scheduled',
      startAt: admin.firestore.Timestamp.fromDate(new Date('2026-06-03T05:00:00.000Z')),
      regEndAt: admin.firestore.Timestamp.fromDate(new Date('2026-06-03T07:00:00.000Z')),
      snapshot: {
        name: '上限なしトナメ',
        entryFee: 1000,
        startStack: 10000,
        isReentry: true,
        maxReentries: null,
        isAddon: true,
        addonLimitPerPlayer: null,
      },
    });

    const docs = (await db.collection('scheduledTournaments').get()).docs;
    const items = await mapScheduledTournamentsForLiff({
      docs,
      db,
      templateById: new Map(),
      includeRegistrationStatus: false,
    });

    expect(items[0].maxReentries).toBeNull();
    expect(items[0].addonLimitPerPlayer).toBeNull();
  });

  it('maxReentriesPerPlayer を maxReentries のフォールバックとして読む', async () => {
    await db.collection('scheduledTournaments').doc('tour-4').set({
      templateId: 'tpl-4',
      status: 'scheduled',
      startAt: admin.firestore.Timestamp.fromDate(new Date('2026-06-03T05:00:00.000Z')),
      regEndAt: admin.firestore.Timestamp.fromDate(new Date('2026-06-03T07:00:00.000Z')),
      snapshot: {
        name: '旧フィールド名トナメ',
        entryFee: 1000,
        startStack: 10000,
        isReentry: true,
        maxReentriesPerPlayer: 4,
      },
    });

    const docs = (await db.collection('scheduledTournaments').get()).docs;
    const items = await mapScheduledTournamentsForLiff({
      docs,
      db,
      templateById: new Map(),
      includeRegistrationStatus: false,
    });

    expect(items[0].maxReentries).toBe(4);
  });
});
