import { initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { getUpcomingTournaments } from '../../src/domains/tournament_activeTournament/callables/getUpcomingTournaments';

describe('getUpcomingTournaments', () => {
  let testEnv: RulesTestEnvironment;
  let db: admin.firestore.Firestore;
  const projectId = 'test-project-get-upcoming-tournaments';

  function jstStartAtFromToday(daysOffset: number, hour = 14): admin.firestore.Timestamp {
    const jstOffsetMs = 9 * 60 * 60 * 1000;
    const now = new Date();
    const jstNow = new Date(now.getTime() + jstOffsetMs);
    const jstDay = new Date(
      jstNow.getFullYear(),
      jstNow.getMonth(),
      jstNow.getDate() + daysOffset,
      hour,
      0,
      0,
      0
    );
    return admin.firestore.Timestamp.fromDate(new Date(jstDay.getTime() - jstOffsetMs));
  }

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

  it('1週間先モードで cancelled を除外する', async () => {
    await db.collection('scheduledTournaments').doc('tour-upcoming').set({
      templateId: 'tpl-1',
      status: 'scheduled',
      isArchived: false,
      startAt: jstStartAtFromToday(1),
      snapshot: { name: '明日トナメ', entryFee: 2000, startStack: 15000 },
    });

    await db.collection('scheduledTournaments').doc('tour-cancelled').set({
      templateId: 'tpl-2',
      status: 'cancelled',
      isArchived: false,
      startAt: jstStartAtFromToday(2),
      snapshot: { name: '中止トナメ', entryFee: 1000, startStack: 10000 },
    });

    const result = await (getUpcomingTournaments as any).run({ auth: null, data: {} });

    expect(result.success).toBe(true);
    expect(result.count).toBe(1);
    expect(result.tournaments[0].name).toBe('明日トナメ');
    expect(result.tournaments[0].isRegisteredByCurrentUser).toBeUndefined();
    expect(result.liffSettings.liffCalendarEnabled).toBe(true);
  });

  it('includeAll=true でも cancelled を除外する', async () => {
    await db.collection('scheduledTournaments').doc('tour-future').set({
      templateId: 'tpl-3',
      status: 'scheduled',
      isArchived: false,
      startAt: jstStartAtFromToday(30),
      snapshot: { name: '来月トナメ', entryFee: 3000, startStack: 20000 },
    });

    await db.collection('scheduledTournaments').doc('tour-cancelled-future').set({
      templateId: 'tpl-4',
      status: 'canceled',
      isArchived: false,
      startAt: jstStartAtFromToday(31),
      snapshot: { name: '来月中止', entryFee: 1000, startStack: 10000 },
    });

    const result = await (getUpcomingTournaments as any).run({
      auth: null,
      data: { includeAll: true },
    });

    expect(result.success).toBe(true);
    expect(result.count).toBe(1);
    expect(result.tournaments[0].name).toBe('来月トナメ');
  });
});
