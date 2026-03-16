/**
 * Phase4 03: nightlyIntegrityCheck 改修 — 閉店処理用整合性チェックのテスト
 *
 * - getUnclockedStaffForClose: 未退勤スタッフ取得
 * - getUnclosedTournamentsForClose: 未 close トーナメント取得
 * - getCloseIntegrityData: 上記 + 未会計 bills を一括取得
 * - closeStoreTerminal: forceClose 時の markUnclockedAndForceEnd（closedStoreWithoutClockOut, force_ended）
 *
 * Firestore Emulator 使用。
 *
 * 注意: getCurrentBusinessDateKeyOrThrow が mockStoreConfig でモックされ、STORE_CLOSE_HOUR ベースの
 * 日付を返すため、テストデータの businessDate はその戻り値と一致させる必要がある。
 */

import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import * as admin from 'firebase-admin';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

const PROJECT_ID = 'test-project-phase4-03-integrity';

/** mockStoreConfig の getCurrentBusinessDateKeyOrThrow と同様の日付計算（テストデータ用） */
function getMockedBusinessDate(): string {
  const closeHour = parseInt(process.env.STORE_CLOSE_HOUR || '27', 10);
  const d = new Date();
  const jstMs = d.getTime() + 9 * 60 * 60 * 1000;
  const jst = new Date(jstMs);
  const jstHour = jst.getUTCHours();
  const isPreviousDay = closeHour >= 24 ? jstHour < (closeHour - 24) : jstHour < closeHour;
  const dateForKey = isPreviousDay ? new Date(jstMs - 24 * 60 * 60 * 1000) : jst;
  const y = dateForKey.getUTCFullYear();
  const m = String(dateForKey.getUTCMonth() + 1).padStart(2, '0');
  const day = String(dateForKey.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

describe('Phase4 03: nightlyIntegrityCheck 改修', () => {
  let testEnv: any;
  let db: admin.firestore.Firestore;
  let getUnclockedStaffForClose: typeof import('../../src/domains/storeMeta/services/getUnclockedStaffForClose').getUnclockedStaffForClose;
  let getUnclosedTournamentsForClose: typeof import('../../src/domains/storeMeta/services/getUnclosedTournamentsForClose').getUnclosedTournamentsForClose;
  let getCloseIntegrityData: typeof import('../../src/domains/storeMeta/services/getCloseIntegrityData').getCloseIntegrityData;
  let closeStoreTerminal: typeof import('../../src/domains/storeMeta/callables/closeStoreTerminal').closeStoreTerminal;

  let emulatorAvailable = true;
  let businessDate: string;

  beforeAll(async () => {
    process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || 'localhost:8081';
    testEnv = await initializeTestEnvironment({ projectId: PROJECT_ID });
    if (admin.apps.length > 0) {
      await Promise.all(admin.apps.map((a) => a?.delete()).filter(Boolean));
    }
    admin.initializeApp({ projectId: PROJECT_ID });
    db = getFirestore();

    const unclockedMod = await import('../../src/domains/storeMeta/services/getUnclockedStaffForClose');
    const unclosedMod = await import('../../src/domains/storeMeta/services/getUnclosedTournamentsForClose');
    const integrityMod = await import('../../src/domains/storeMeta/services/getCloseIntegrityData');
    const closeMod = await import('../../src/domains/storeMeta/callables/closeStoreTerminal');

    getUnclockedStaffForClose = unclockedMod.getUnclockedStaffForClose;
    getUnclosedTournamentsForClose = unclosedMod.getUnclosedTournamentsForClose;
    getCloseIntegrityData = integrityMod.getCloseIntegrityData;
    closeStoreTerminal = closeMod.closeStoreTerminal;
  });

  afterAll(async () => {
    await testEnv.cleanup();
    if (admin.apps.length) {
      await Promise.all(admin.apps.map((a) => a?.delete()).filter(Boolean));
    }
    delete process.env.FIRESTORE_EMULATOR_HOST;
  });

  beforeEach(async () => {
    businessDate = getMockedBusinessDate();
    if (!emulatorAvailable) return;
    try {
      await testEnv.clearFirestore();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('fetch failed') || msg.includes('ECONNREFUSED')) {
        emulatorAvailable = false;
        console.warn('Firestore Emulator 未起動のためスキップします。');
        return;
      }
      throw e;
    }
    await db.collection('devices').doc('admin-1').set({ uid: 'admin-uid-1', role: 'admin' });
    await db.collection('storeMeta').doc('currentBusinessDay').set({
      status: 'running',
      currentBusinessDateKey: businessDate,
      lastClosedBusinessDateKey: null,
      updatedAt: Timestamp.now(),
      source: 'test',
      lastError: null,
    });
  });

  describe('getUnclockedStaffForClose', () => {
    it('未認証時は unauthenticated', async () => {
      await expect(
        getUnclockedStaffForClose.run({ auth: null, data: {} } as any)
      ).rejects.toMatchObject({ code: 'unauthenticated' });
    });

    it('未退勤スタッフ（clockIn あり clockOut null）を返す', async () => {
      if (!emulatorAvailable) return;
      await db.collection('attendances').doc('att-1').set({
        date: businessDate,
        clockIn: Timestamp.now(),
        clockOut: null,
        staffsFullName: '山田太郎',
      });
      await db.collection('attendances').doc('att-2').set({
        date: businessDate,
        clockIn: Timestamp.now(),
        clockOut: Timestamp.now(), // 退勤済みは対象外
        staffsFullName: '鈴木花子',
      });

      const result = await getUnclockedStaffForClose.run({
        auth: { uid: 'admin-uid-1' },
        data: {},
      } as any);

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.data[0].staffName).toBe('山田太郎');
      expect(result.data[0].clockIn).toBeDefined();
      expect(result.hasNoTarget).toBe(false);
    });

    it('対象0件時は hasNoTarget: true', async () => {
      if (!emulatorAvailable) return;
      const result = await getUnclockedStaffForClose.run({
        auth: { uid: 'admin-uid-1' },
        data: {},
      } as any);
      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(0);
      expect(result.hasNoTarget).toBe(true);
    });
  });

  describe('getUnclosedTournamentsForClose', () => {
    it('未認証時は unauthenticated', async () => {
      await expect(
        getUnclosedTournamentsForClose.run({ auth: null, data: {} } as any)
      ).rejects.toMatchObject({ code: 'unauthenticated' });
    });

    it('status が running のトーナメントを返す（ended/cancelled は除外）', async () => {
      if (!emulatorAvailable) return;
      await db.collection('scheduledTournaments').doc('t1').set({
        businessDate,
        status: 'running',
        startAt: Timestamp.now(),
        snapshot: { name: 'Test Tournament' },
      });
      await db.collection('scheduledTournaments').doc('t1').collection('views').doc('main').set({
        reentries: 0,
        entries: 5,
        playersBusted: 3,
      });

      await db.collection('scheduledTournaments').doc('t2').set({
        businessDate,
        status: 'ended',
        startAt: Timestamp.now(),
        snapshot: { name: 'Ended Tournament' },
      });

      const result = await getUnclosedTournamentsForClose.run({
        auth: { uid: 'admin-uid-1' },
        data: {},
      } as any);

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.data[0].tournamentId).toBe('t1');
      expect(result.data[0].status).toBe('running');
      expect(result.data[0].snapshotName).toBe('Test Tournament');
      expect(result.data[0].displayMessage).toBeDefined();
      expect(typeof result.data[0].rankingConfirmed).toBe('boolean');
      expect(typeof result.data[0].prizeConfirmed).toBe('boolean');
      expect(typeof result.data[0].hasRemainingPlayers).toBe('boolean');
      expect(result.hasNoTarget).toBe(false);
    });

    it('対象0件時は hasNoTarget: true', async () => {
      if (!emulatorAvailable) return;
      const result = await getUnclosedTournamentsForClose.run({
        auth: { uid: 'admin-uid-1' },
        data: {},
      } as any);
      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(0);
      expect(result.hasNoTarget).toBe(true);
    });
  });

  describe('getCloseIntegrityData', () => {
    it('3項目を一括取得し、正しい形式で返す', async () => {
      if (!emulatorAvailable) return;
      const result = await getCloseIntegrityData.run({
        auth: { uid: 'admin-uid-1' },
        data: {},
      } as any);

      expect(result.success).toBe(true);
      expect(result).toHaveProperty('unsettledBills');
      expect(result).toHaveProperty('unsettledBillsReturnedCount');
      expect(result).toHaveProperty('unsettledBillsTruncated');
      expect(result).toHaveProperty('unclockedStaff');
      expect(result).toHaveProperty('unclosedTournaments');
      expect(result).toHaveProperty('hasNoTarget');
      expect(Array.isArray(result.unsettledBills)).toBe(true);
      expect(Array.isArray(result.unclockedStaff)).toBe(true);
      expect(Array.isArray(result.unclosedTournaments)).toBe(true);
    });

    it('全0件時は hasNoTarget: true', async () => {
      if (!emulatorAvailable) return;
      const result = await getCloseIntegrityData.run({
        auth: { uid: 'admin-uid-1' },
        data: {},
      } as any);
      expect(result.success).toBe(true);
      expect(result.unsettledBills).toHaveLength(0);
      expect(result.unclockedStaff).toHaveLength(0);
      expect(result.unclosedTournaments).toHaveLength(0);
      expect(result.hasNoTarget).toBe(true);
    });
  });

  describe('closeStoreTerminal: forceClose と markUnclockedAndForceEnd', () => {
    it('forceClose: true で未 close トーナメントが force_ended になる', async () => {
      if (!emulatorAvailable) return;
      await db.collection('scheduledTournaments').doc('t-force').set({
        businessDate,
        status: 'running',
        startAt: Timestamp.now(),
        snapshot: { name: 'Force End Target' },
      });
      await db.collection('scheduledTournaments').doc('t-force').collection('views').doc('main').set({
        reentries: 0,
        entries: 2,
        playersBusted: 1,
      });

      const result = await closeStoreTerminal.run({
        auth: { uid: 'admin-uid-1' },
        data: { forceClose: true },
      } as any);

      expect(result.success).toBe(true);

      const tournamentSnap = await db.collection('scheduledTournaments').doc('t-force').get();
      expect(tournamentSnap.data()?.status).toBe('force_ended');
    });

    it('閉店時、未退勤 attendance に closedStoreWithoutClockOut: true と closedAt が付与される', async () => {
      if (!emulatorAvailable) return;
      await db.collection('attendances').doc('att-unclocked').set({
        date: businessDate,
        clockIn: Timestamp.now(),
        clockOut: null,
        staffsFullName: '未退勤スタッフ',
      });

      await closeStoreTerminal.run({
        auth: { uid: 'admin-uid-1' },
        data: {},
      } as any);

      const attSnap = await db.collection('attendances').doc('att-unclocked').get();
      expect(attSnap.data()?.closedStoreWithoutClockOut).toBe(true);
      expect(attSnap.data()?.closedAt).toBeDefined();
    });
  });
});
