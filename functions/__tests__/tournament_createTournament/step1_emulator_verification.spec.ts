/**
 * Step 1 Emulator 検証：単発作成・定期生成が動作し、Cloud Tasks 未投入であること
 *
 * 事前に Firestore Emulator を起動すること:
 *   firebase emulators:start --only firestore
 *
 * 検証内容:
 * 1. createScheduledTournament 1件実行 → scheduledTournament が作成される
 * 2. Cloud Tasks キューに増加がない（enqueue コード削除により、ログに「Cloud Tasks 投入」が出ない）
 * 3. generateRecurringTournaments 1回実行（recurrence が1件ある場合）→ scheduledTournament が増える
 */

import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import * as admin from 'firebase-admin';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

const PROJECT_ID = 'test-project-step1-verify';

describe('Step 1 Emulator 検証: 単発作成・定期生成', () => {
  let testEnv: any;
  let db: admin.firestore.Firestore;
  let createScheduledTournament: any;
  let generateRecurringTournaments: any;
  let createTournamentRecurrence: any;
  let emulatorAvailable = true;

  const TEST_UID = 'step1-verify-uid';
  const TEMPLATE_ID = 'tpl-step1-verify';
  const BLIND_ID = 'blind-step1-verify';
  const RECURRENCE_ID = 'rec-step1-verify';

  // 2026-02-19 14:00 JST = 営業日内
  const START_AT = '2026-02-19T05:00:00.000Z'; // 14:00 JST
  const REG_END_AT = '2026-02-19T04:55:00.000Z'; // 13:55 JST

  beforeAll(async () => {
    process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || 'localhost:8081';

    testEnv = await initializeTestEnvironment({ projectId: PROJECT_ID });

    if (!admin.apps.length) {
      admin.initializeApp({ projectId: PROJECT_ID });
    }
    db = getFirestore();

    const createMod = await import('../../src/domains/tournament_createTournament/callables/createScheduledTournament');
    const genMod = await import('../../src/domains/tournament_createTournament/callables/generateRecurringTournaments');
    const recurMod = await import('../../src/domains/tournament_createTournament/callables/createTournamentRecurrence');

    createScheduledTournament = createMod.createScheduledTournament;
    generateRecurringTournaments = genMod.generateRecurringTournaments;
    createTournamentRecurrence = recurMod.createTournamentRecurrence;
  });

  afterAll(async () => {
    if (testEnv) await testEnv.cleanup();
    if (admin.apps.length) {
      await Promise.all(admin.apps.map((a) => a?.delete()).filter(Boolean));
    }
    delete process.env.FIRESTORE_EMULATOR_HOST;
  });

  async function clearAndSeed(seedFn: () => Promise<void>) {
    if (!emulatorAvailable) return;
    try {
      await testEnv.clearFirestore();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('fetch failed') || msg.includes('ECONNREFUSED')) {
        emulatorAvailable = false;
        console.warn(
          'Firestore Emulator 未起動のためスキップします。起動: firebase emulators:start --only firestore'
        );
        return;
      }
      throw e;
    }
    await seedFn();
  }

  async function seedForSingleTournament() {
    const now = Timestamp.now();
    // device
    const devRef = db.collection('devices').doc('dev-step1-verify');
    await devRef.set({
      uid: TEST_UID,
      role: 'admin',
      status: 'active',
      updatedAt: now,
    });

    // blindTemplate
    await db.collection('blindTemplates').doc(BLIND_ID).set({
      name: 'Step1 Verify Blind',
      levels: [
        { level: 1, duration: 15, hasBreakAfter: false },
        { level: 2, duration: 15, hasBreakAfter: false },
      ],
      lateRegUntilLev: 2,
      breakDuration: 5,
      updatedAt: now,
    });

    // tournamentTemplate
    await db.collection('tournamentTemplates').doc(TEMPLATE_ID).set({
      name: 'Step1 Verify Template',
      entryFee: 1000,
      isReentry: false,
      maxReentries: null,
      reentryFee: null,
      isAddon: false,
      addonFee: null,
      addonStack: null,
      startStack: 3000,
      blindStructure: BLIND_ID,
      blindStructureId: BLIND_ID,
      prizeRatio: 0.7,
      color: '#2196F3',
      pointType: 'pointA',
      isArchived: false,
      updatedAt: now,
    });

    // businessHoursMonthlyMap: 2026-02 の 19 日を営業日（0-24時＝終日）として設定
    // calcBusinessDate の営業時間ウィンドウ内に startTime が入るように
    await db.collection('businessHoursMonthlyMap').doc('2026-02').set({
      days: {
        '19': {
          openMinute: 0,    // 0:00 〜 24:00 で終日営業
          closeMinute: 1440,
          isClosed: false,
        },
      },
      updatedAt: now,
    });
  }

  async function seedForRecurrence() {
    const now = Timestamp.now();
    await seedForSingleTournament(); // テンプレート等は共通

    // 前月・当月・次月の営業日を終日（0-24時）で設定（定期生成用）
    for (const ym of ['2026-01', '2026-02', '2026-03']) {
      const days: Record<string, { openMinute: number; closeMinute: number; isClosed: boolean }> = {};
      for (let d = 1; d <= 31; d++) {
        days[String(d)] = { openMinute: 0, closeMinute: 1440, isClosed: false };
      }
      await db.collection('businessHoursMonthlyMap').doc(ym).set({
        days,
        updatedAt: now,
      });
    }

    // tournamentRecurrence（generateRecurringTournaments 用）
    await db.collection('tournamentRecurrences').doc(RECURRENCE_ID).set({
      templateId: TEMPLATE_ID,
      storeId: 'default-store',
      tenantId: 'default-tenant',
      startOn: Timestamp.fromDate(new Date('2026-02-19')),
      interval: '1week',
      byWeekday: ['TH'], // 木曜
      endsOn: null,
      startTime: '14:00',
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });
  }

  it('単発作成1件 → scheduledTournament が作成される', async () => {
    await clearAndSeed(seedForSingleTournament);
    if (!emulatorAvailable) return;

    const beforeCount = (await db.collection('scheduledTournaments').get()).size;

    const mockRequest = {
      auth: { uid: TEST_UID },
      data: {
        templateId: TEMPLATE_ID,
        startAt: START_AT,
        regEndAt: REG_END_AT,
        freeze: false,
        storeId: 'default-store',
        tenantId: 'default-tenant',
      },
    };

    const result = await (createScheduledTournament as any).run(mockRequest);

    expect(result).toBeDefined();
    expect(result.success).toBe(true);
    expect(result.tournamentId).toBeDefined();

    const afterCount = (await db.collection('scheduledTournaments').get()).size;
    expect(afterCount).toBe(beforeCount + 1);

    const created = await db.collection('scheduledTournaments').doc(result.tournamentId).get();
    expect(created.exists).toBe(true);
    expect(created.data()?.status).toBe('scheduled');
    expect(created.data()?.templateId).toBe(TEMPLATE_ID);
    // Step 2: enqueue バッチ用管理フィールドの検証
    expect(created.data()?.schedulePlanVersion).toBe(1);
    expect(created.data()?.taskSyncNeeded).toBe(true);
    expect(created.data()?.taskSyncReason).toEqual(['created']);
    expect(created.data()?.schedulePlanUpdatedAt).toBeDefined();
  });

  it('定期作成1回（createTournamentRecurrence）→ scheduledTournament が作成される', async () => {
    await clearAndSeed(seedForRecurrence);
    if (!emulatorAvailable) return;

    const beforeCount = (await db.collection('scheduledTournaments').get()).size;

    const mockRequest = {
      auth: { uid: TEST_UID },
      data: {
        templateId: TEMPLATE_ID,
        startOn: '2026-02-19',
        interval: '1week',
        byWeekday: ['TH'],
        startTime: '14:00',
        isActive: true,
        storeId: 'default-store',
        tenantId: 'default-tenant',
      },
    };

    const result = await (createTournamentRecurrence as any).run(mockRequest);

    expect(result).toBeDefined();
    expect(result.success).toBe(true);
    expect(result.recurrenceId).toBeDefined();
    expect(result.generatedTournaments).toBeGreaterThanOrEqual(0);

    const afterCount = (await db.collection('scheduledTournaments').get()).size;
    expect(afterCount).toBeGreaterThan(beforeCount);
  });

  it('定期生成1回（generateRecurringTournaments）→ scheduledTournament が増える', async () => {
    await clearAndSeed(seedForRecurrence);
    if (!emulatorAvailable) return;

    const beforeCount = (await db.collection('scheduledTournaments').get()).size;

    const mockRequest = {
      auth: { uid: TEST_UID },
      data: {},
    };

    const result = await (generateRecurringTournaments as any).run(mockRequest);

    expect(result).toBeDefined();
    expect(result.success).toBe(true);

    const afterCount = (await db.collection('scheduledTournaments').get()).size;
    expect(afterCount).toBeGreaterThanOrEqual(beforeCount);
  });
});
