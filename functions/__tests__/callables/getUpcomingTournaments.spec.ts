import { initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { getUpcomingTournaments } from '../../src/domains/tournament_activeTournament/callables/getUpcomingTournaments';
import { getJstCalendarDateKey } from '../../src/shared/tournament/liffTournamentDateUtils';

describe('getUpcomingTournaments', () => {
  let testEnv: RulesTestEnvironment;
  let db: admin.firestore.Firestore;
  const projectId = 'test-project-get-upcoming-tournaments';
  const CURRENT_BUSINESS_DATE = '2026-08-20';
  const NEXT_BUSINESS_DATE = '2026-08-21';

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

  async function setUpStoreMetaRunning(businessDateKey: string) {
    await db.collection('storeMeta').doc('currentBusinessDay').set({
      status: 'running',
      currentBusinessDateKey: businessDateKey,
      lastClosedBusinessDateKey: null,
    });
  }

  async function setUpStoreMetaClosed() {
    await db.collection('storeMeta').doc('currentBusinessDay').set({
      status: 'closed',
      currentBusinessDateKey: null,
      lastClosedBusinessDateKey: CURRENT_BUSINESS_DATE,
    });
  }

  async function seedTournament(
    id: string,
    fields: {
      businessDate?: string;
      startAt: admin.firestore.Timestamp;
      status?: string;
      name: string;
    }
  ) {
    await db.collection('scheduledTournaments').doc(id).set({
      templateId: `tpl-${id}`,
      status: fields.status ?? 'scheduled',
      isArchived: false,
      ...(fields.businessDate ? { businessDate: fields.businessDate } : {}),
      startAt: fields.startAt,
      snapshot: { name: fields.name, entryFee: 2000, startStack: 15000 },
    });
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

  it('Case1: 本日営業日 businessDate を今後から除外する', async () => {
    await setUpStoreMetaRunning(CURRENT_BUSINESS_DATE);

    await seedTournament('tour-today', {
      businessDate: CURRENT_BUSINESS_DATE,
      startAt: jstStartAtFromToday(0),
      name: '本日トナメ',
    });
    await seedTournament('tour-tomorrow', {
      businessDate: NEXT_BUSINESS_DATE,
      startAt: jstStartAtFromToday(1),
      name: '翌営業日トナメ',
    });

    const result = await (getUpcomingTournaments as any).run({ auth: null, data: {} });

    expect(result.success).toBe(true);
    expect(result.count).toBe(1);
    expect(result.tournaments.map((t: { name: string }) => t.name)).toEqual(['翌営業日トナメ']);
  });

  it('Case2: 翌営業日 businessDate は今後に含まれる', async () => {
    await setUpStoreMetaRunning(CURRENT_BUSINESS_DATE);

    await seedTournament('tour-next-day', {
      businessDate: NEXT_BUSINESS_DATE,
      startAt: jstStartAtFromToday(1),
      name: '翌営業日トナメ',
    });

    const result = await (getUpcomingTournaments as any).run({ auth: null, data: {} });

    expect(result.success).toBe(true);
    expect(result.count).toBe(1);
    expect(result.tournaments[0].name).toBe('翌営業日トナメ');
  });

  it('Case3: 7日範囲内の非本日営業日TNは含まれる', async () => {
    await setUpStoreMetaRunning(CURRENT_BUSINESS_DATE);

    await seedTournament('tour-in-range', {
      businessDate: '2026-08-25',
      startAt: jstStartAtFromToday(3),
      name: '範囲内トナメ',
    });

    const result = await (getUpcomingTournaments as any).run({ auth: null, data: {} });

    expect(result.success).toBe(true);
    expect(result.count).toBe(1);
    expect(result.tournaments[0].name).toBe('範囲内トナメ');
  });

  it('Case4: startAt が7日範囲外のTNは含まれない', async () => {
    await setUpStoreMetaRunning(CURRENT_BUSINESS_DATE);

    await seedTournament('tour-out-of-range', {
      businessDate: '2026-08-30',
      startAt: jstStartAtFromToday(7),
      name: '範囲外トナメ',
    });
    await seedTournament('tour-in-range', {
      businessDate: NEXT_BUSINESS_DATE,
      startAt: jstStartAtFromToday(1),
      name: '範囲内トナメ',
    });

    const result = await (getUpcomingTournaments as any).run({ auth: null, data: {} });

    expect(result.success).toBe(true);
    expect(result.count).toBe(1);
    expect(result.tournaments[0].name).toBe('範囲内トナメ');
  });

  it('Case5: includeAll=true では本日営業日 businessDate も除外しない', async () => {
    await setUpStoreMetaRunning(CURRENT_BUSINESS_DATE);

    await seedTournament('tour-today', {
      businessDate: CURRENT_BUSINESS_DATE,
      startAt: jstStartAtFromToday(0),
      name: '本日トナメ',
    });
    await seedTournament('tour-far-future', {
      businessDate: '2026-09-20',
      startAt: jstStartAtFromToday(30),
      name: '来月トナメ',
    });

    const result = await (getUpcomingTournaments as any).run({
      auth: null,
      data: { includeAll: true },
    });

    expect(result.success).toBe(true);
    expect(result.count).toBe(2);
    expect(result.tournaments.map((t: { name: string }) => t.name)).toEqual(
      expect.arrayContaining(['本日トナメ', '来月トナメ'])
    );
  });

  it('Case6: cancelled / canceled は引き続き除外される', async () => {
    await setUpStoreMetaRunning(CURRENT_BUSINESS_DATE);

    await seedTournament('tour-upcoming', {
      businessDate: NEXT_BUSINESS_DATE,
      startAt: jstStartAtFromToday(1),
      name: '明日トナメ',
    });
    await seedTournament('tour-cancelled', {
      businessDate: NEXT_BUSINESS_DATE,
      startAt: jstStartAtFromToday(2),
      status: 'cancelled',
      name: '中止トナメ',
    });
    await seedTournament('tour-canceled', {
      businessDate: NEXT_BUSINESS_DATE,
      startAt: jstStartAtFromToday(3),
      status: 'canceled',
      name: '取消トナメ',
    });

    const result = await (getUpcomingTournaments as any).run({ auth: null, data: {} });

    expect(result.success).toBe(true);
    expect(result.count).toBe(1);
    expect(result.tournaments[0].name).toBe('明日トナメ');
    expect(result.tournaments[0].isRegisteredByCurrentUser).toBeUndefined();
    expect(result.liffSettings.liffCalendarEnabled).toBe(true);
  });

  it('営業中は currentBusinessDateKey を基準に本日 businessDate を除外する', async () => {
    await setUpStoreMetaRunning(CURRENT_BUSINESS_DATE);

    await seedTournament('tour-today', {
      businessDate: CURRENT_BUSINESS_DATE,
      startAt: jstStartAtFromToday(1),
      name: '開始は翌暦日でも本日営業日',
    });
    await seedTournament('tour-next', {
      businessDate: NEXT_BUSINESS_DATE,
      startAt: jstStartAtFromToday(1),
      name: '翌営業日トナメ',
    });

    const result = await (getUpcomingTournaments as any).run({ auth: null, data: {} });

    expect(result.success).toBe(true);
    expect(result.count).toBe(1);
    expect(result.tournaments[0].name).toBe('翌営業日トナメ');
  });

  it('店舗営業外は JST 暦日を基準に本日 businessDate を除外する', async () => {
    await setUpStoreMetaClosed();
    const jstCalendarDate = getJstCalendarDateKey();

    await seedTournament('tour-jst-today', {
      businessDate: jstCalendarDate,
      startAt: jstStartAtFromToday(0),
      name: 'JST暦日本日トナメ',
    });
    await seedTournament('tour-jst-tomorrow', {
      businessDate: NEXT_BUSINESS_DATE,
      startAt: jstStartAtFromToday(1),
      name: '翌日トナメ',
    });

    const result = await (getUpcomingTournaments as any).run({ auth: null, data: {} });

    expect(result.success).toBe(true);
    expect(result.tournaments.map((t: { name: string }) => t.name)).not.toContain(
      'JST暦日本日トナメ'
    );
    expect(result.tournaments.map((t: { name: string }) => t.name)).toContain('翌日トナメ');
  });
});
