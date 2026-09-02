import { initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { getTodayTournaments } from '../../src/domains/tournament_activeTournament/callables/getTodayTournaments';
import { getCurrentBusinessDateKeyOrThrow } from '../../src/domains/storeMeta/repos/getCurrentBusinessDateKeyOrThrow';
import * as liffTournamentDateUtils from '../../src/shared/tournament/liffTournamentDateUtils';
import { FunctionCustomError } from '../../src/shared/logging/functionCustomError';
import { formatBlindLevelDurationText } from '../../src/shared/tournament/formatBlindLevelDurationText';

const mockedGetCurrentBusinessDateKeyOrThrow =
  getCurrentBusinessDateKeyOrThrow as jest.MockedFunction<typeof getCurrentBusinessDateKeyOrThrow>;

describe('getTodayTournaments', () => {
  let testEnv: RulesTestEnvironment;
  let db: admin.firestore.Firestore;
  const projectId = 'test-project-get-today-tournaments';
  const CURRENT_BUSINESS_DATE = '2026-06-03';
  const OTHER_BUSINESS_DATE = '2026-06-04';

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

  async function setUpStoreMetaRunning(businessDateKey: string) {
    await db.collection('storeMeta').doc('currentBusinessDay').set({
      status: 'running',
      currentBusinessDateKey: businessDateKey,
      lastClosedBusinessDateKey: null,
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

  describe('店舗営業中', () => {
    beforeEach(async () => {
      await testEnv.clearFirestore();
      await setUpStoreMetaRunning(CURRENT_BUSINESS_DATE);
    });

    it('businessDate === currentBusinessDateKey のトーナメントを返す', async () => {
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
        businessDate: CURRENT_BUSINESS_DATE,
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
        businessDate: CURRENT_BUSINESS_DATE,
        startAt: jstTodayStartAt(18),
        snapshot: { name: '中止トナメ', entryFee: 1000, startStack: 10000 },
      });

      const result = await (getTodayTournaments as any).run({ auth: null, data: {} });

      expect(result.success).toBe(true);
      expect(result.count).toBe(1);
      expect(result.targetBusinessDate).toBe(CURRENT_BUSINESS_DATE);
      expect(result.todayDateSource).toBe('currentBusinessDateKey');
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

    it('businessDate !== currentBusinessDateKey のトーナメントは返さない', async () => {
      await db.collection('scheduledTournaments').doc('tour-other-day').set({
        templateId: 'tpl-other',
        status: 'scheduled',
        isArchived: false,
        businessDate: OTHER_BUSINESS_DATE,
        startAt: jstTodayStartAt(),
        snapshot: { name: '別営業日トナメ', entryFee: 1000, startStack: 10000 },
      });

      const result = await (getTodayTournaments as any).run({ auth: null, data: {} });

      expect(result.success).toBe(true);
      expect(result.count).toBe(0);
    });

    it('startAt のJST暦日が今日でも businessDate が違えば返さない', async () => {
      await db.collection('scheduledTournaments').doc('tour-wrong-bd').set({
        templateId: 'tpl-wrong-bd',
        status: 'scheduled',
        isArchived: false,
        businessDate: OTHER_BUSINESS_DATE,
        startAt: jstTodayStartAt(15),
        snapshot: { name: '暦日は今日', entryFee: 1000, startStack: 10000 },
      });

      const result = await (getTodayTournaments as any).run({ auth: null, data: {} });

      expect(result.success).toBe(true);
      expect(result.count).toBe(0);
    });

    it('startAt のJST暦日が今日でなくても businessDate が currentBusinessDateKey なら返す', async () => {
      const tomorrow = admin.firestore.Timestamp.fromDate(
        new Date(Date.now() + 24 * 60 * 60 * 1000)
      );

      await db.collection('scheduledTournaments').doc('tour-future-start').set({
        templateId: 'tpl-future',
        status: 'scheduled',
        isArchived: false,
        businessDate: CURRENT_BUSINESS_DATE,
        startAt: tomorrow,
        snapshot: { name: '営業日内・開始は明日', entryFee: 1000, startStack: 10000 },
      });

      const result = await (getTodayTournaments as any).run({ auth: null, data: {} });

      expect(result.success).toBe(true);
      expect(result.count).toBe(1);
      expect(result.data[0].name).toBe('営業日内・開始は明日');
    });
  });

  describe('店舗営業外', () => {
    beforeEach(async () => {
      await testEnv.clearFirestore();
      mockedGetCurrentBusinessDateKeyOrThrow.mockRejectedValueOnce(
        new FunctionCustomError({
          errorKey: 'STORE_BUSINESS_DATE_UNAVAILABLE',
          message: 'Store is not running',
        })
      );
    });

    it('JST暦日で businessDate 一致のトーナメントを返す', async () => {
      const jstCalendarDate = liffTournamentDateUtils.getJstCalendarDateKey();

      await db.collection('scheduledTournaments').doc('tour-jst-calendar').set({
        templateId: 'tpl-jst',
        status: 'scheduled',
        isArchived: false,
        businessDate: jstCalendarDate,
        startAt: jstTodayStartAt(),
        snapshot: { name: 'JST暦日本日トナメ', entryFee: 1000, startStack: 10000 },
      });

      await db.collection('scheduledTournaments').doc('tour-other-date').set({
        templateId: 'tpl-old',
        status: 'scheduled',
        isArchived: false,
        businessDate: OTHER_BUSINESS_DATE,
        startAt: jstTodayStartAt(),
        snapshot: { name: '別日付', entryFee: 1000, startStack: 10000 },
      });

      const result = await (getTodayTournaments as any).run({ auth: null, data: {} });

      expect(result.success).toBe(true);
      expect(result.count).toBe(1);
      expect(result.data[0].name).toBe('JST暦日本日トナメ');
      expect(result.targetBusinessDate).toBe(jstCalendarDate);
      expect(result.todayDateSource).toBe('jstCalendarDateKey');
    });

    it('該当トーナメントなし: success + data:[] + count:0', async () => {
      await db.collection('scheduledTournaments').doc('tour-unrelated').set({
        templateId: 'tpl-unrelated',
        status: 'scheduled',
        isArchived: false,
        businessDate: '1999-01-01',
        startAt: jstTodayStartAt(),
        snapshot: { name: '対象外', entryFee: 1000, startStack: 10000 },
      });

      const result = await (getTodayTournaments as any).run({ auth: null, data: {} });

      expect(result.success).toBe(true);
      expect(result.count).toBe(0);
      expect(result.data).toEqual([]);
    });
  });
});
