/**
 * Phase6 Step3: closeRuns / openRuns のパスが仕様どおり
 * storeMeta/closeRuns/{runId}, storeMeta/openRuns/{runId} であることを検証する。
 *
 * 仕様: storeMeta/closeRuns/{closeRunId}, storeMeta/openRuns/{openRunId}
 * 実装: Firestore の col/doc/col/doc のため storeMeta/closeRuns/runs/{runId}, storeMeta/openRuns/runs/{runId}
 *
 * Firestore Emulator 使用。事前に emulator 起動が必要。
 */

import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import * as admin from 'firebase-admin';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

const PROJECT_ID = 'test-project-close-open-runs-path';

describe('closeRuns / openRuns path (storeMeta/closeRuns, storeMeta/openRuns)', () => {
  let testEnv: any;
  let db: admin.firestore.Firestore;
  let closeStoreTerminal: typeof import('../../src/domains/storeMeta/callables/closeStoreTerminal').closeStoreTerminal;
  let openStoreTerminal: typeof import('../../src/domains/storeMeta/callables/openStoreTerminal').openStoreTerminal;

  beforeAll(async () => {
    process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || 'localhost:8081';

    testEnv = await initializeTestEnvironment({ projectId: PROJECT_ID });

    if (admin.apps.length > 0) {
      await Promise.all(admin.apps.map(a => a?.delete()).filter(Boolean));
    }
    admin.initializeApp({ projectId: PROJECT_ID });
    db = getFirestore();

    const closeMod = await import('../../src/domains/storeMeta/callables/closeStoreTerminal');
    const openMod = await import('../../src/domains/storeMeta/callables/openStoreTerminal');
    closeStoreTerminal = closeMod.closeStoreTerminal;
    openStoreTerminal = openMod.openStoreTerminal;
  });

  afterAll(async () => {
    await testEnv.cleanup();
    if (admin.apps.length) {
      await Promise.all(admin.apps.map((a) => a?.delete()).filter(Boolean));
    }
    delete process.env.FIRESTORE_EMULATOR_HOST;
  });

  let emulatorAvailable = true;

  beforeEach(async () => {
    if (!emulatorAvailable) return;
    try {
      await testEnv.clearFirestore();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('fetch failed') || msg.includes('ECONNREFUSED')) {
        emulatorAvailable = false;
        console.warn('Firestore Emulator 未起動のためスキップします。起動: firebase emulators:start --only firestore');
        return;
      }
      throw e;
    }

    await db.collection('devices').doc('admin-device-1').set({
      uid: 'admin-uid-1',
      role: 'admin',
    });
  });

  describe('closeStoreTerminal: run が storeMeta/closeRuns/runs/{runId} に作成される', () => {
    it('閉店完了後、run は storeMeta/closeRuns/runs/{runId} に存在し、currentBusinessDay 配下にない', async () => {
      if (!emulatorAvailable) return;
      const businessDate = '2026-02-09';
      await db.collection('storeMeta').doc('currentBusinessDay').set({
        status: 'running',
        currentBusinessDateKey: businessDate,
        lastClosedBusinessDateKey: null,
        updatedAt: Timestamp.now(),
        source: 'test',
        lastError: null,
      });

      const req = { auth: { uid: 'admin-uid-1' }, data: {} };
      const result = await closeStoreTerminal.run(req as any);

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.runId).toBeDefined();
      const runId = result.runId as string;
      expect(runId.startsWith('close_')).toBe(true);

      // 仕様どおり storeMeta/closeRuns 直下（実装は runs サブコレ）に run が存在する
      const runAtSpecPath = db.collection('storeMeta').doc('closeRuns').collection('runs').doc(runId);
      const runSnap = await runAtSpecPath.get();
      expect(runSnap.exists).toBe(true);
      expect(runSnap.data()?.status).toBe('completed');
      expect(runSnap.data()?.closedBusinessDate).toBe(businessDate);

      // currentBusinessDay 配下に closeRuns を作っていない（run が存在しない）
      const runAtOldPath = db.collection('storeMeta').doc('currentBusinessDay').collection('closeRuns').doc(runId);
      const oldPathSnap = await runAtOldPath.get();
      expect(oldPathSnap.exists).toBe(false);
    });

    it('閉店時 openAssessment.blockers に already_running_different_date がある場合のみ result を ready_to_open にしブロッカーを削除する', async () => {
      if (!emulatorAvailable) return;
      const businessDate = '2026-02-09';
      await db.collection('storeMeta').doc('currentBusinessDay').set({
        status: 'running',
        currentBusinessDateKey: businessDate,
        lastClosedBusinessDateKey: null,
        updatedAt: Timestamp.now(),
        source: 'test',
        lastError: null,
        openAssessment: {
          idempotencyKey: 'open_assessment_2026-02-10_2026-02-09T19:30:00.000Z',
          intendedBusinessDateKey: '2026-02-10',
          decidedAt: Timestamp.now(),
          result: 'skipped',
          blockers: ['already_running_different_date'],
          source: 'task',
          scheduledAt: '2026-02-09T19:30:00.000Z',
        },
      });

      const req = { auth: { uid: 'admin-uid-1' }, data: {} };
      const result = await closeStoreTerminal.run(req as any);
      expect(result?.success).toBe(true);

      const stateSnap = await db.collection('storeMeta').doc('currentBusinessDay').get();
      const state = stateSnap.data();
      expect(state?.status).toBe('closed');
      expect(state?.closeAssessment).toBeNull();
      const open = state?.openAssessment;
      expect(open).toBeDefined();
      expect(open?.result).toBe('ready_to_open');
      expect(Array.isArray(open?.blockers)).toBe(true);
      expect((open?.blockers as string[]).includes('already_running_different_date')).toBe(false);
    });
  });

  describe('openStoreTerminal: run が storeMeta/openRuns/runs/{runId} に作成される', () => {
    it('開店完了後、run は storeMeta/openRuns/runs/{runId} に存在し、currentBusinessDay 配下にない', async () => {
      if (!emulatorAvailable) return;
      const businessDate = '2026-02-10';
      await db.collection('storeMeta').doc('currentBusinessDay').set({
        status: 'closed',
        currentBusinessDateKey: null,
        lastClosedBusinessDateKey: '2026-02-09',
        updatedAt: Timestamp.now(),
        source: 'test',
        lastError: null,
      });

      const req = { auth: { uid: 'admin-uid-1' }, data: { businessDateKey: businessDate } };
      const result = await openStoreTerminal.run(req as any);

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.runId).toBeDefined();
      const runId = result.runId as string;
      expect(runId.startsWith('open_')).toBe(true);

      // 仕様どおり storeMeta/openRuns 直下（実装は runs サブコレ）に run が存在する
      const runAtSpecPath = db.collection('storeMeta').doc('openRuns').collection('runs').doc(runId);
      const runSnap = await runAtSpecPath.get();
      expect(runSnap.exists).toBe(true);
      expect(runSnap.data()?.status).toBe('completed');
      expect(runSnap.data()?.openedBusinessDate).toBe(businessDate);

      // currentBusinessDay 配下に openRuns を作っていない（run が存在しない）
      const runAtOldPath = db.collection('storeMeta').doc('currentBusinessDay').collection('openRuns').doc(runId);
      const oldPathSnap = await runAtOldPath.get();
      expect(oldPathSnap.exists).toBe(false);
    });
  });
});

describe('closeRuns/openRuns path: 実装が仕様パスを使用している（エミュレータ不要）', () => {
  it('closeStoreTerminal が storeMeta/closeRuns/runs を使用し currentBusinessDay/closeRuns を使っていない', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(
      path.join(__dirname, '../../src/domains/storeMeta/callables/closeStoreTerminal.ts'),
      'utf8'
    );
    expect(src).toContain("doc('closeRuns').collection('runs').doc(runId)");
    // run の親が currentBusinessDay 配下でないこと（.collection('closeRuns') の直前が currentBusinessDay のパスでない）
    expect(src).not.toContain("doc('currentBusinessDay').collection('closeRuns')");
  });

  it('openStoreTerminal が storeMeta/openRuns/runs を使用し currentBusinessDay/openRuns を使っていない', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(
      path.join(__dirname, '../../src/domains/storeMeta/callables/openStoreTerminal.ts'),
      'utf8'
    );
    expect(src).toContain("doc('openRuns').collection('runs').doc(runId)");
    expect(src).not.toContain("doc('currentBusinessDay').collection('openRuns')");
  });

  it('processingLease の stale 記録が storeMeta/closeRuns|openRuns/runs を使用している', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(
      path.join(__dirname, '../../src/domains/storeMeta/services/processingLease.ts'),
      'utf8'
    );
    expect(src).toContain("doc(runDocId).collection('runs').doc(oldRunId)");
    expect(src).not.toContain("doc('currentBusinessDay')");
  });
});
