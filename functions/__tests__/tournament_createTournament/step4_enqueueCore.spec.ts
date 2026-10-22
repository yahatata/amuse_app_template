/**
 * Step 4 テスト: enqueue コアロジック
 *
 * - computePlanHash: 同一入力で同一ハッシュ
 * - computeRegEndAt: blindTemplate から regEndAt 算出、フォールバック
 *
 * 事前に Firestore Emulator を起動すること:
 *   firebase emulators:start --only firestore
 */

import {
  computePlanHash,
  computeRegEndAt,
} from '../../src/domains/tournament_createTournament/services/enqueueTournamentTasksCore';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';

const PROJECT_ID = 'test-project-step4';

describe('Step 4: enqueue コアロジック', () => {
  let testEnv: any;
  let emulatorAvailable = true;

  beforeAll(async () => {
    process.env.FIRESTORE_EMULATOR_HOST =
      process.env.FIRESTORE_EMULATOR_HOST || 'localhost:8081';
    testEnv = await initializeTestEnvironment({ projectId: PROJECT_ID });
    if (admin.apps.length > 0) {
      await Promise.all(admin.apps.map((a) => a?.delete()).filter(Boolean));
    }
    admin.initializeApp({ projectId: PROJECT_ID });
    try {
      await testEnv.clearFirestore();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('fetch failed') || msg.includes('ECONNREFUSED')) {
        emulatorAvailable = false;
      }
    }
  });

  afterAll(async () => {
    if (testEnv) await testEnv.cleanup();
    if (admin.apps.length) {
      await Promise.all(admin.apps.map((a) => a?.delete()).filter(Boolean));
    }
  });

  describe('computePlanHash', () => {
    it('同一入力で同一ハッシュを返す', () => {
      const h1 = computePlanHash(
        'startTournament',
        'tid1',
        new Date('2026-02-19T05:00:00.000Z'),
        1
      );
      const h2 = computePlanHash(
        'startTournament',
        'tid1',
        new Date('2026-02-19T05:00:00.000Z'),
        1
      );
      expect(h1).toBe(h2);
    });

    it('異なる入力で異なるハッシュを返す', () => {
      const h1 = computePlanHash(
        'startTournament',
        'tid1',
        new Date('2026-02-19T05:00:00.000Z'),
        1
      );
      const h2 = computePlanHash(
        'closeRegistration',
        'tid1',
        new Date('2026-02-19T05:00:00.000Z'),
        1
      );
      const h3 = computePlanHash(
        'startTournament',
        'tid2',
        new Date('2026-02-19T05:00:00.000Z'),
        1
      );
      expect(h1).not.toBe(h2);
      expect(h1).not.toBe(h3);
    });

    it('targetAt のミリ秒でハッシュが変わる', () => {
      const h1 = computePlanHash(
        'startTournament',
        'tid1',
        new Date('2026-02-19T05:00:00.000Z'),
        1
      );
      const h2 = computePlanHash(
        'startTournament',
        'tid1',
        new Date('2026-02-19T05:00:01.000Z'),
        1
      );
      expect(h1).not.toBe(h2);
    });
  });

  describe('computeRegEndAt', () => {
    it('blindTemplate あり → totalDurationSec から正しく算出', async () => {
      if (!emulatorAvailable) return;
      const db = getFirestore();
      const blindId = 'blind-step4-test';
      await db.collection('blindTemplates').doc(blindId).set({
        levels: [
          { level: 1, duration: 15, hasBreakAfter: false },
          { level: 2, duration: 20, hasBreakAfter: false },
        ],
        lateRegUntilLev: 1,
        breakDuration: 5,
      });

      const startAt = new Date('2026-02-19T05:00:00.000Z');
      const result = await computeRegEndAt(db, startAt, blindId);
      expect(result).not.toBeNull();
      expect(result!.getTime()).toBe(startAt.getTime() + 15 * 60 * 1000);
    });

    it('blindTemplate なし → null を返す（closeRegistration スキップ）', async () => {
      if (!emulatorAvailable) return;
      const db = getFirestore();
      const result = await computeRegEndAt(db, new Date(), 'nonexistent-blind');
      expect(result).toBeNull();
    });
  });
});
