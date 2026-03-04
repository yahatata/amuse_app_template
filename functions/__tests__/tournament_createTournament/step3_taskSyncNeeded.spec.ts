/**
 * Step 3 テスト: taskSyncNeeded / version++ の条件付き設定
 *
 * changeSpec Step 3 に準拠。テスト観点:
 * - updateTournamentTemplate: blindStructure 変更時 → taskSyncNeeded=true
 * - updateTournamentTemplate: blindStructure 変更なし（名前等のみ）→ taskSyncNeeded は更新されない
 * - updateTournamentRecurrence: startAt 変更時 → version++, taskSyncNeeded=true, taskSyncReason: startAtChanged
 * - updateTournamentRecurrence: cancelled のみ → taskSyncNeeded=false
 * - updateTournamentRecurrence: template 変更時 → taskSyncNeeded=true（version++ なし）
 *
 * 事前に Firestore Emulator を起動すること:
 *   firebase emulators:start --only firestore
 */

import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import * as admin from 'firebase-admin';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

const PROJECT_ID = 'test-project-step3';

describe('Step 3: taskSyncNeeded / version++ 条件付き設定', () => {
  let testEnv: any;
  let db: admin.firestore.Firestore;
  let updateTournamentTemplate: any;
  let updateTournamentRecurrence: any;
  let emulatorAvailable = true;

  const TEST_UID = 'step3-verify-uid';
  const TPL_ID = 'tpl-step3';
  const TPL_ID_ALT = 'tpl-step3-alt';
  const BLIND_ID = 'blind-step3';
  const REC_ID = 'rec-step3';

  beforeAll(async () => {
    process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || 'localhost:8081';

    testEnv = await initializeTestEnvironment({ projectId: PROJECT_ID });

    if (!admin.apps.length) {
      admin.initializeApp({ projectId: PROJECT_ID });
    }
    db = getFirestore();

    const tplMod = await import('../../src/domains/tournament_createTournament/callables/updateTournamentTemplate');
    const recMod = await import('../../src/domains/tournament_createTournament/callables/updateTournamentRecurrence');

    updateTournamentTemplate = tplMod.updateTournamentTemplate;
    updateTournamentRecurrence = recMod.updateTournamentRecurrence;
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

  async function seedBase() {
    const now = Timestamp.now();

    await db.collection('devices').doc('dev-step3').set({
      uid: TEST_UID,
      role: 'admin',
      status: 'active',
      updatedAt: now,
    });

    await db.collection('blindTemplates').doc(BLIND_ID).set({
      name: 'Step3 Blind',
      levels: [{ level: 1, duration: 15, hasBreakAfter: false }],
      lateRegUntilLev: 1,
      breakDuration: 5,
      updatedAt: now,
    });

    await db.collection('tournamentTemplates').doc(TPL_ID).set({
      name: 'Step3 Template',
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

    await db.collection('tournamentTemplates').doc(TPL_ID_ALT).set({
      name: 'Step3 Template Alt',
      entryFee: 2000,
      isReentry: false,
      maxReentries: null,
      reentryFee: null,
      isAddon: false,
      addonFee: null,
      addonStack: null,
      startStack: 5000,
      blindStructure: BLIND_ID,
      blindStructureId: BLIND_ID,
      prizeRatio: 0.7,
      color: '#FF5722',
      pointType: 'pointA',
      isArchived: false,
      updatedAt: now,
    });
  }

  // --- updateTournamentTemplate 用 ---

  it('観点1: blindStructure 変更時 → taskSyncNeeded=true が設定される', async () => {
    await clearAndSeed(async () => {
      await seedBase();
      const tRef = db.collection('scheduledTournaments').doc('tour-tpl-1');
      await tRef.set({
        templateId: TPL_ID,
        startAt: Timestamp.fromDate(new Date('2026-02-19T05:00:00.000Z')),
        regEndAt: Timestamp.fromDate(new Date('2026-02-19T04:55:00.000Z')),
        status: 'scheduled',
        storeId: 'test-store',
        tenantId: 'test-tenant',
        snapshot: { name: 'Old', blindStructure: BLIND_ID, updatedAt: new Date() },
        taskSyncNeeded: false,
        updatedAt: Timestamp.now(),
      });
    });
    if (!emulatorAvailable) return;

    const result = await (updateTournamentTemplate as any).run({
      auth: { uid: TEST_UID },
      data: {
        templateId: TPL_ID,
        selectedTournamentIds: ['tour-tpl-1'],
        blindStructure: 'blind-updated',
      },
    });

    expect(result.success).toBe(true);

    const doc = await db.collection('scheduledTournaments').doc('tour-tpl-1').get();
    expect(doc.data()?.taskSyncNeeded).toBe(true);
  });

  it('観点2: blindStructure 変更なし（名前等のみ）→ taskSyncNeeded は更新されない', async () => {
    await clearAndSeed(async () => {
      await seedBase();
      const tRef = db.collection('scheduledTournaments').doc('tour-tpl-2');
      await tRef.set({
        templateId: TPL_ID,
        startAt: Timestamp.fromDate(new Date('2026-02-19T05:00:00.000Z')),
        regEndAt: Timestamp.fromDate(new Date('2026-02-19T04:55:00.000Z')),
        status: 'scheduled',
        storeId: 'test-store',
        tenantId: 'test-tenant',
        snapshot: { name: 'Old', blindStructure: BLIND_ID, updatedAt: new Date() },
        taskSyncNeeded: false,
        updatedAt: Timestamp.now(),
      });
    });
    if (!emulatorAvailable) return;

    await (updateTournamentTemplate as any).run({
      auth: { uid: TEST_UID },
      data: {
        templateId: TPL_ID,
        selectedTournamentIds: ['tour-tpl-2'],
        name: 'Updated Name Only',
      },
    });

    const doc = await db.collection('scheduledTournaments').doc('tour-tpl-2').get();
    expect(doc.data()?.taskSyncNeeded).toBe(false);
  });

  // --- updateTournamentRecurrence 用 ---

  it('観点3: startAt 変更時 → schedulePlanVersion++, taskSyncNeeded=true, taskSyncReason: startAtChanged', async () => {
    await clearAndSeed(async () => {
      await seedBase();
      await db.collection('tournamentRecurrences').doc(REC_ID).set({
        templateId: TPL_ID,
        storeId: 'test-store',
        tenantId: 'test-tenant',
        startOn: Timestamp.fromDate(new Date('2026-02-19')),
        interval: '1week',
        byWeekday: ['TH'],
        endsOn: null,
        startTime: '14:00',
        isActive: true,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });

      const tRef = db.collection('scheduledTournaments').doc('tour-rec-1');
      await tRef.set({
        templateId: TPL_ID,
        recurrenceId: REC_ID,
        startAt: Timestamp.fromDate(new Date('2026-02-19T05:00:00.000Z')),
        regEndAt: Timestamp.fromDate(new Date('2026-02-19T04:55:00.000Z')),
        status: 'scheduled',
        storeId: 'test-store',
        tenantId: 'test-tenant',
        snapshot: { name: 'Rec', blindStructure: BLIND_ID, updatedAt: new Date() },
        schedulePlanVersion: 1,
        taskSyncNeeded: false,
        updatedAt: Timestamp.now(),
      });
    });
    if (!emulatorAvailable) return;

    const result = await (updateTournamentRecurrence as any).run({
      auth: { uid: TEST_UID },
      data: {
        recurrenceId: REC_ID,
        selectedTournamentIds: ['tour-rec-1'],
        startTime: '15:30',
      },
    });

    expect(result.success).toBe(true);

    const doc = await db.collection('scheduledTournaments').doc('tour-rec-1').get();
    const data = doc.data();
    expect(data?.taskSyncNeeded).toBe(true);
    expect(data?.taskSyncReason).toEqual(['startAtChanged']);
    expect(data?.schedulePlanVersion).toBe(2);
    expect(data?.schedulePlanUpdatedAt).toBeDefined();
  });

  it('観点4: cancelled のみ（isActive=false、他変更なし）→ taskSyncNeeded=false が明示的に設定される', async () => {
    await clearAndSeed(async () => {
      await seedBase();
      await db.collection('tournamentRecurrences').doc(REC_ID).set({
        templateId: TPL_ID,
        storeId: 'test-store',
        tenantId: 'test-tenant',
        startOn: Timestamp.fromDate(new Date('2026-02-19')),
        interval: '1week',
        byWeekday: ['TH'],
        endsOn: null,
        startTime: '14:00',
        isActive: true,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });

      const tRef = db.collection('scheduledTournaments').doc('tour-rec-2');
      await tRef.set({
        templateId: TPL_ID,
        recurrenceId: REC_ID,
        startAt: Timestamp.fromDate(new Date('2026-02-19T05:00:00.000Z')),
        status: 'scheduled',
        storeId: 'test-store',
        tenantId: 'test-tenant',
        snapshot: { name: 'Rec', blindStructure: BLIND_ID, updatedAt: new Date() },
        taskSyncNeeded: true,
        updatedAt: Timestamp.now(),
      });
    });
    if (!emulatorAvailable) return;

    await (updateTournamentRecurrence as any).run({
      auth: { uid: TEST_UID },
      data: {
        recurrenceId: REC_ID,
        selectedTournamentIds: ['tour-rec-2'],
        isActive: false,
      },
    });

    const doc = await db.collection('scheduledTournaments').doc('tour-rec-2').get();
    expect(doc.data()?.taskSyncNeeded).toBe(false);
    expect(doc.data()?.status).toBe('cancelled');
  });

  it('観点5: template 変更時 → taskSyncNeeded=true（version++, schedulePlanUpdatedAt は更新しない）', async () => {
    await clearAndSeed(async () => {
      await seedBase();
      await db.collection('tournamentRecurrences').doc(REC_ID).set({
        templateId: TPL_ID,
        storeId: 'test-store',
        tenantId: 'test-tenant',
        startOn: Timestamp.fromDate(new Date('2026-02-19')),
        interval: '1week',
        byWeekday: ['TH'],
        endsOn: null,
        startTime: '14:00',
        isActive: true,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });

      const tRef = db.collection('scheduledTournaments').doc('tour-rec-3');
      const initialVersion = 5;
      const initialUpdatedAt = Timestamp.fromDate(new Date('2026-01-01T00:00:00.000Z'));
      await tRef.set({
        templateId: TPL_ID,
        recurrenceId: REC_ID,
        startAt: Timestamp.fromDate(new Date('2026-02-19T05:00:00.000Z')),
        status: 'scheduled',
        storeId: 'test-store',
        tenantId: 'test-tenant',
        snapshot: { name: 'Rec', blindStructure: BLIND_ID, updatedAt: new Date() },
        schedulePlanVersion: initialVersion,
        schedulePlanUpdatedAt: initialUpdatedAt,
        taskSyncNeeded: false,
        updatedAt: Timestamp.now(),
      });
    });
    if (!emulatorAvailable) return;

    await (updateTournamentRecurrence as any).run({
      auth: { uid: TEST_UID },
      data: {
        recurrenceId: REC_ID,
        selectedTournamentIds: ['tour-rec-3'],
        templateId: TPL_ID_ALT,
      },
    });

    const doc = await db.collection('scheduledTournaments').doc('tour-rec-3').get();
    const data = doc.data();
    expect(data?.taskSyncNeeded).toBe(true);
    expect(data?.taskSyncReason).toEqual(['regEndAtChangedByTemplate']);
    expect(data?.templateId).toBe(TPL_ID_ALT);
    expect(data?.schedulePlanVersion).toBe(5);
    expect(data?.schedulePlanUpdatedAt?.toMillis?.()).toBe(
      new Date('2026-01-01T00:00:00.000Z').getTime()
    );
  });
});
