import { initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { getTodayTournaments } from '../../src/domains/tournament_activeTournament/callables/getTodayTournaments';
import { formatBlindLevelDurationText } from '../../src/shared/tournament/formatBlindLevelDurationText';

describe('getTodayTournaments', () => {
  let testEnv: RulesTestEnvironment;
  let db: admin.firestore.Firestore;
  const projectId = 'test-project-get-today-tournaments';

  function jstTodayStartAt(hour = 14): admin.firestore.Timestamp {
    const jstOffsetMs = 9 * 60 * 60 * 1000;
    const now = new Date();
    const jstNow = new Date(now.getTime() + jstOffsetMs);
    const jstToday = new Date(
      jstNow.getFullYear(),
      jstNow.getMonth(),
      jstNow.getDate(),
      hour,
      0,
      0,
      0
    );
    return admin.firestore.Timestamp.fromDate(new Date(jstToday.getTime() - jstOffsetMs));
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

  it('cancelled を除外し blindLevelDurationText と liffSettings を返す', async () => {
    await db.collection('blindTemplates').doc('blind-1').set({
      levels: [
        { level: 1, duration: 25 },
        { level: 2, duration: 20 },
      ],
    });

    await db.collection('scheduledTournaments').doc('tour-active').set({
      templateId: 'tpl-1',
      status: 'scheduled',
      isArchived: false,
      startAt: jstTodayStartAt(),
      regEndAt: jstTodayStartAt(16),
      snapshot: {
        name: '本日トナメ',
        entryFee: 3000,
        startStack: 20000,
        isReentry: true,
        reentryFee: 3000,
        isAddon: false,
        addonFee: 0,
        blindStructure: 'blind-1',
      },
    });

    await db.collection('scheduledTournaments').doc('tour-cancelled').set({
      templateId: 'tpl-2',
      status: 'cancelled',
      isArchived: false,
      startAt: jstTodayStartAt(18),
      snapshot: { name: '中止トナメ', entryFee: 1000, startStack: 10000 },
    });

    const result = await (getTodayTournaments as any).run({ auth: null, data: {} });

    expect(result.success).toBe(true);
    expect(result.count).toBe(1);
    expect(result.data[0].name).toBe('本日トナメ');
    expect(result.data[0].status).toBe('scheduled');
    expect(result.data[0].blindLevelDurationText).toBe(
      formatBlindLevelDurationText([
        { level: 1, duration: 25 },
        { level: 2, duration: 20 },
      ])
    );
    expect(result.liffSettings.liffRegistrationEnabled).toBe(true);
    expect(result.liffSettings.liffCalendarEnabled).toBe(true);
  });
});
