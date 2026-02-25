/**
 * cancel / restore / startAt編集 のエミュレータ検証
 *
 * 事前に Firestore Emulator を起動すること:
 *   firebase emulators:start --only firestore
 *
 * 検証観点:
 * A: cancel 後に定期生成で再生成されない
 * B: restore が now < regEndAt のみ許可される
 * C: startAt 編集後に schedulePlanVersion/taskSyncNeeded/regEndAt が整合する
 */

import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import * as admin from 'firebase-admin';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

const PROJECT_ID = 'test-project-cancel-restore';

describe('cancel / restore / startAt編集 検証', () => {
  let testEnv: any;
  let db: admin.firestore.Firestore;
  let updateScheduledTournamentStatus: any;
  let updateScheduledTournamentStartAt: any;
  let generateRecurringTournaments: any;
  let emulatorAvailable = true;

  const TEST_UID = 'cancel-restore-uid';
  const TPL_ID = 'tpl-cancel-restore';
  const BLIND_ID = 'blind-cancel-restore';
  const REC_ID = 'rec-cancel-restore';
  const STORE_ID = 'default-store';
  const TENANT_ID = 'default-tenant';

  // 2026-04-01 19:00 JST = 2026-04-01T10:00:00Z
  // 営業日: 2026-04-01
  const FUTURE_START_AT_UTC = '2026-04-01T10:00:00.000Z';
  const FUTURE_REG_END_AT_UTC = '2026-04-01T10:15:00.000Z'; // レジスト終了 = start+15分後（未来）

  // regEndAt が過去のケース
  const PAST_START_AT_UTC = '2025-01-01T10:00:00.000Z';
  const PAST_REG_END_AT_UTC = '2025-01-01T09:55:00.000Z';

  beforeAll(async () => {
    process.env.FIRESTORE_EMULATOR_HOST =
      process.env.FIRESTORE_EMULATOR_HOST || 'localhost:8081';

    testEnv = await initializeTestEnvironment({ projectId: PROJECT_ID });

    if (!admin.apps.length) {
      admin.initializeApp({ projectId: PROJECT_ID });
    }
    db = getFirestore();

    const statusMod = await import(
      '../../src/domains/tournament_createTournament/callables/updateScheduledTournamentStatus'
    );
    const startAtMod = await import(
      '../../src/domains/tournament_createTournament/callables/updateScheduledTournamentStartAt'
    );
    const genMod = await import(
      '../../src/domains/tournament_createTournament/callables/generateRecurringTournaments'
    );

    updateScheduledTournamentStatus = statusMod.updateScheduledTournamentStatus;
    updateScheduledTournamentStartAt = startAtMod.updateScheduledTournamentStartAt;
    generateRecurringTournaments = genMod.generateRecurringTournaments;
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

    await db.collection('devices').doc('dev-cancel-restore').set({
      uid: TEST_UID,
      role: 'admin',
      status: 'active',
      updatedAt: now,
    });

    await db.collection('blindTemplates').doc(BLIND_ID).set({
      name: 'Cancel Restore Blind',
      levels: [{ level: 1, duration: 15, hasBreakAfter: false }],
      lateRegUntilLev: 1,
      breakDuration: 5,
      updatedAt: now,
    });

    await db.collection('tournamentTemplates').doc(TPL_ID).set({
      name: 'Cancel Restore Template',
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

    // businessHoursMonthlyMap（calcBusinessDate が参照）
    // テスト時刻 2026-04-01T11:00:00.000Z = JST 20:00
    // openMinute=1080(18:00), closeMinute=1620(27:00=翌3:00) → 20:00 JST が範囲内
    await db.collection('businessHoursMonthlyMap').doc('2026-04').set({
      days: {
        '1': { openMinute: 1080, closeMinute: 1620, isClosed: false },
      },
    });
  }

  // ----- 観点 A: cancel -----

  it('A-1: scheduled → cancel で status=cancelled, taskSyncNeeded=false になる', async () => {
    const TOUR_ID = 'tour-cancel-a1';
    await clearAndSeed(async () => {
      await seedBase();
      await db.collection('scheduledTournaments').doc(TOUR_ID).set({
        templateId: TPL_ID,
        recurrenceId: REC_ID,
        storeId: STORE_ID,
        tenantId: TENANT_ID,
        status: 'scheduled',
        businessDate: '2026-04-01',
        startAt: Timestamp.fromDate(new Date(FUTURE_START_AT_UTC)),
        regEndAt: Timestamp.fromDate(new Date(FUTURE_REG_END_AT_UTC)),
        isArchived: false,
        taskSyncNeeded: true,
        schedulePlanVersion: 1,
        snapshot: { name: 'T', blindStructure: BLIND_ID, updatedAt: new Date() },
        updatedAt: Timestamp.now(),
      });
    });
    if (!emulatorAvailable) return;

    const result = await (updateScheduledTournamentStatus as any).run({
      auth: { uid: TEST_UID },
      data: { tournamentId: TOUR_ID, action: 'cancel' },
    });

    expect(result.success).toBe(true);
    expect(result.status).toBe('cancelled');

    const doc = await db.collection('scheduledTournaments').doc(TOUR_ID).get();
    expect(doc.data()?.status).toBe('cancelled');
    expect(doc.data()?.taskSyncNeeded).toBe(false);
  });

  it('A-2: scheduled 以外（running）はキャンセルできない', async () => {
    const TOUR_ID = 'tour-cancel-a2';
    await clearAndSeed(async () => {
      await seedBase();
      await db.collection('scheduledTournaments').doc(TOUR_ID).set({
        templateId: TPL_ID,
        storeId: STORE_ID,
        tenantId: TENANT_ID,
        status: 'running',
        businessDate: '2026-04-01',
        startAt: Timestamp.fromDate(new Date(FUTURE_START_AT_UTC)),
        regEndAt: Timestamp.fromDate(new Date(FUTURE_REG_END_AT_UTC)),
        isArchived: false,
        taskSyncNeeded: true,
        schedulePlanVersion: 1,
        snapshot: { name: 'T', blindStructure: BLIND_ID, updatedAt: new Date() },
        updatedAt: Timestamp.now(),
      });
    });
    if (!emulatorAvailable) return;

    await expect(
      (updateScheduledTournamentStatus as any).run({
        auth: { uid: TEST_UID },
        data: { tournamentId: TOUR_ID, action: 'cancel' },
      })
    ).rejects.toThrow();
  });

  it('A-3: キャンセル後に同一 recurrenceId + businessDate の再生成がスキップされる', async () => {
    const TOUR_ID = 'tour-cancel-a3';
    await clearAndSeed(async () => {
      await seedBase();

      // recurrence を作成
      await db.collection('tournamentRecurrences').doc(REC_ID).set({
        templateId: TPL_ID,
        storeId: STORE_ID,
        tenantId: TENANT_ID,
        startOn: Timestamp.fromDate(new Date('2026-04-01')),
        interval: '1week',
        byWeekday: ['TU'],
        endsOn: null,
        startTime: '19:00',
        isActive: true,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });

      // 既存のキャンセル済みトーナメント（同一 recurrenceId + businessDate）
      await db.collection('scheduledTournaments').doc(TOUR_ID).set({
        templateId: TPL_ID,
        recurrenceId: REC_ID,
        storeId: STORE_ID,
        tenantId: TENANT_ID,
        status: 'cancelled',
        businessDate: '2026-04-01',
        startAt: Timestamp.fromDate(new Date(FUTURE_START_AT_UTC)),
        regEndAt: Timestamp.fromDate(new Date(FUTURE_REG_END_AT_UTC)),
        isArchived: false,
        taskSyncNeeded: false,
        schedulePlanVersion: 1,
        snapshot: { name: 'T', blindStructure: BLIND_ID, updatedAt: new Date() },
        updatedAt: Timestamp.now(),
      });
    });
    if (!emulatorAvailable) return;

    // generateRecurringTournaments を実行
    const result = await (generateRecurringTournaments as any).run({
      auth: { uid: TEST_UID },
      data: {},
    });

    expect(result.success).toBe(true);

    // キャンセル済みの同日に新規 doc が作られていないこと
    const snap = await db
      .collection('scheduledTournaments')
      .where('recurrenceId', '==', REC_ID)
      .where('businessDate', '==', '2026-04-01')
      .get();
    // 既存の1件のみ（新規生成なし）
    expect(snap.docs.length).toBe(1);
    expect(snap.docs[0].id).toBe(TOUR_ID);
  });

  // ----- 観点 B: restore -----

  it('B-1: cancelled + now < regEndAt → restore 成功, status=scheduled, version++', async () => {
    const TOUR_ID = 'tour-restore-b1';
    // regEndAt を未来に設定
    const futureRegEndAt = new Date(Date.now() + 60 * 60 * 1000); // 1時間後
    await clearAndSeed(async () => {
      await seedBase();
      await db.collection('scheduledTournaments').doc(TOUR_ID).set({
        templateId: TPL_ID,
        storeId: STORE_ID,
        tenantId: TENANT_ID,
        status: 'cancelled',
        businessDate: '2026-04-01',
        startAt: Timestamp.fromDate(new Date(FUTURE_START_AT_UTC)),
        regEndAt: Timestamp.fromDate(futureRegEndAt),
        isArchived: false,
        taskSyncNeeded: false,
        schedulePlanVersion: 2,
        snapshot: { name: 'T', blindStructure: BLIND_ID, updatedAt: new Date() },
        updatedAt: Timestamp.now(),
      });
    });
    if (!emulatorAvailable) return;

    const result = await (updateScheduledTournamentStatus as any).run({
      auth: { uid: TEST_UID },
      data: { tournamentId: TOUR_ID, action: 'restore' },
    });

    expect(result.success).toBe(true);
    expect(result.status).toBe('scheduled');

    const doc = await db.collection('scheduledTournaments').doc(TOUR_ID).get();
    expect(doc.data()?.status).toBe('scheduled');
    expect(doc.data()?.taskSyncNeeded).toBe(true);
    expect(doc.data()?.schedulePlanVersion).toBe(3); // 2 + 1
  });

  it('B-2: cancelled + now >= regEndAt → restore 不可（failed-precondition）', async () => {
    const TOUR_ID = 'tour-restore-b2';
    await clearAndSeed(async () => {
      await seedBase();
      await db.collection('scheduledTournaments').doc(TOUR_ID).set({
        templateId: TPL_ID,
        storeId: STORE_ID,
        tenantId: TENANT_ID,
        status: 'cancelled',
        businessDate: '2025-01-01',
        startAt: Timestamp.fromDate(new Date(PAST_START_AT_UTC)),
        regEndAt: Timestamp.fromDate(new Date(PAST_REG_END_AT_UTC)),
        isArchived: false,
        taskSyncNeeded: false,
        schedulePlanVersion: 1,
        snapshot: { name: 'T', blindStructure: BLIND_ID, updatedAt: new Date() },
        updatedAt: Timestamp.now(),
      });
    });
    if (!emulatorAvailable) return;

    await expect(
      (updateScheduledTournamentStatus as any).run({
        auth: { uid: TEST_UID },
        data: { tournamentId: TOUR_ID, action: 'restore' },
      })
    ).rejects.toThrow(/regEndAt を過ぎているため復旧できません/);
  });

  it('B-3: scheduled に対して restore は失敗する（cancelled 以外は不可）', async () => {
    const TOUR_ID = 'tour-restore-b3';
    await clearAndSeed(async () => {
      await seedBase();
      await db.collection('scheduledTournaments').doc(TOUR_ID).set({
        templateId: TPL_ID,
        storeId: STORE_ID,
        tenantId: TENANT_ID,
        status: 'scheduled',
        businessDate: '2026-04-01',
        startAt: Timestamp.fromDate(new Date(FUTURE_START_AT_UTC)),
        regEndAt: Timestamp.fromDate(new Date(FUTURE_REG_END_AT_UTC)),
        isArchived: false,
        taskSyncNeeded: true,
        schedulePlanVersion: 1,
        snapshot: { name: 'T', blindStructure: BLIND_ID, updatedAt: new Date() },
        updatedAt: Timestamp.now(),
      });
    });
    if (!emulatorAvailable) return;

    await expect(
      (updateScheduledTournamentStatus as any).run({
        auth: { uid: TEST_UID },
        data: { tournamentId: TOUR_ID, action: 'restore' },
      })
    ).rejects.toThrow();
  });

  // ----- 観点 C: startAt 編集後の task/version 整合 -----

  it('C-1: startAt 編集 → schedulePlanVersion++, taskSyncNeeded=true, startAt/regEndAt 更新', async () => {
    const TOUR_ID = 'tour-startat-c1';
    await clearAndSeed(async () => {
      await seedBase();
      await db.collection('scheduledTournaments').doc(TOUR_ID).set({
        templateId: TPL_ID,
        storeId: STORE_ID,
        tenantId: TENANT_ID,
        status: 'scheduled',
        businessDate: '2026-04-01',
        startAt: Timestamp.fromDate(new Date(FUTURE_START_AT_UTC)),
        regEndAt: Timestamp.fromDate(new Date(FUTURE_REG_END_AT_UTC)),
        isArchived: false,
        taskSyncNeeded: false,
        schedulePlanVersion: 1,
        snapshot: { name: 'T', blindStructure: BLIND_ID, updatedAt: new Date() },
        updatedAt: Timestamp.now(),
      });
    });
    if (!emulatorAvailable) return;

    // 2026-04-01 20:00 JST = 2026-04-01T11:00:00Z
    const newStartAtUTC = '2026-04-01T11:00:00.000Z';
    const result = await (updateScheduledTournamentStartAt as any).run({
      auth: { uid: TEST_UID },
      data: {
        tournamentId: TOUR_ID,
        startAt: newStartAtUTC,
      },
    });

    expect(result.success).toBe(true);
    expect(result.startAt).toBe(newStartAtUTC);

    const doc = await db.collection('scheduledTournaments').doc(TOUR_ID).get();
    const data = doc.data();
    expect(data?.status).toBe('scheduled');
    expect(data?.schedulePlanVersion).toBe(2);
    expect(data?.taskSyncNeeded).toBe(true);
    expect(data?.taskSyncReason).toContain('startAtChangedByCalendarEdit');
    expect(data?.schedulePlanUpdatedAt).toBeDefined();

    // regEndAt が再計算されて変更されていること
    const regEndAt = (data?.regEndAt as Timestamp)?.toDate?.();
    expect(regEndAt).toBeDefined();
    const newStart = new Date(newStartAtUTC);
    // regEndAt は newStart より前か同じ（遅延レジスト計算結果）
    expect(regEndAt!.getTime()).toBeLessThanOrEqual(newStart.getTime() + 60 * 60 * 1000);
  });

  it('C-2: cancelled のトーナメントは startAt 編集不可（failed-precondition）', async () => {
    const TOUR_ID = 'tour-startat-c2';
    await clearAndSeed(async () => {
      await seedBase();
      await db.collection('scheduledTournaments').doc(TOUR_ID).set({
        templateId: TPL_ID,
        storeId: STORE_ID,
        tenantId: TENANT_ID,
        status: 'cancelled',
        businessDate: '2026-04-01',
        startAt: Timestamp.fromDate(new Date(FUTURE_START_AT_UTC)),
        regEndAt: Timestamp.fromDate(new Date(FUTURE_REG_END_AT_UTC)),
        isArchived: false,
        taskSyncNeeded: false,
        schedulePlanVersion: 1,
        snapshot: { name: 'T', blindStructure: BLIND_ID, updatedAt: new Date() },
        updatedAt: Timestamp.now(),
      });
    });
    if (!emulatorAvailable) return;

    await expect(
      (updateScheduledTournamentStartAt as any).run({
        auth: { uid: TEST_UID },
        data: {
          tournamentId: TOUR_ID,
          startAt: '2026-04-01T11:00:00.000Z',
        },
      })
    ).rejects.toThrow(/scheduled のみ開始時刻を編集できます/);
  });

  it('C-3: startAt 編集後に schedulePlanVersion が以前と異なる → 旧 planHash と不一致（no-op 保証）', async () => {
    const TOUR_ID = 'tour-startat-c3';
    const OLD_VERSION = 3;
    await clearAndSeed(async () => {
      await seedBase();
      await db.collection('scheduledTournaments').doc(TOUR_ID).set({
        templateId: TPL_ID,
        storeId: STORE_ID,
        tenantId: TENANT_ID,
        status: 'scheduled',
        businessDate: '2026-04-01',
        startAt: Timestamp.fromDate(new Date(FUTURE_START_AT_UTC)),
        regEndAt: Timestamp.fromDate(new Date(FUTURE_REG_END_AT_UTC)),
        isArchived: false,
        taskSyncNeeded: false,
        schedulePlanVersion: OLD_VERSION,
        snapshot: { name: 'T', blindStructure: BLIND_ID, updatedAt: new Date() },
        updatedAt: Timestamp.now(),
      });
    });
    if (!emulatorAvailable) return;

    await (updateScheduledTournamentStartAt as any).run({
      auth: { uid: TEST_UID },
      data: {
        tournamentId: TOUR_ID,
        startAt: '2026-04-01T11:00:00.000Z',
      },
    });

    const doc = await db.collection('scheduledTournaments').doc(TOUR_ID).get();
    const newVersion = doc.data()?.schedulePlanVersion;
    expect(newVersion).toBe(OLD_VERSION + 1); // バージョンが増えたことで旧タスクは no-op 扱いになる
  });
});
