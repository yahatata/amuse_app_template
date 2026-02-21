/**
 * Step 6 テスト: controlHook 新 payload 対応
 *
 * changeSpec 9 確認観点に基づくテスト
 *
 * 事前に Firestore Emulator を起動すること:
 *   firebase emulators:start --only firestore
 */

import { controlHook } from '../../src/shared/http/controlHook';
import { Request, Response } from 'express';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import * as admin from 'firebase-admin';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { computePlanHash } from '../../src/domains/tournament_createTournament/services/enqueueTournamentTasksCore';

const PROJECT_ID = 'test-project-step6';

function mockReq(overrides: Partial<Request> = {}): Request {
  return {
    method: 'POST',
    body: {},
    headers: { authorization: 'Bearer dummy-token' },
    ...overrides,
  } as unknown as Request;
}

function mockRes(): Response & { statusCode: number; body: unknown } {
  let statusCode = 0;
  let body: unknown;
  const res = {
    status(code: number) {
      statusCode = code;
      return res;
    },
    json(obj: unknown) {
      body = obj;
      return res;
    },
    get statusCode() {
      return statusCode;
    },
    get body() {
      return body;
    },
  } as unknown as Response & { statusCode: number; body: unknown };
  return res;
}

async function callControlHook(
  req: Request,
  res: Response
): Promise<{ statusCode: number; body: unknown }> {
  await controlHook(req, res);
  return {
    statusCode: (res as { statusCode?: number }).statusCode ?? 0,
    body: (res as { body?: unknown }).body,
  };
}

describe('Step 6: controlHook 新 payload 対応', () => {
  let testEnv: unknown;
  let emulatorAvailable = true;

  beforeAll(async () => {
    process.env.FIRESTORE_EMULATOR_HOST =
      process.env.FIRESTORE_EMULATOR_HOST || 'localhost:8081';
    testEnv = await initializeTestEnvironment({ projectId: PROJECT_ID });
    if (!admin.apps.length) {
      admin.initializeApp({ projectId: PROJECT_ID });
    }
    try {
      await (testEnv as { clearFirestore: () => Promise<void> }).clearFirestore();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('fetch failed') || msg.includes('ECONNREFUSED')) {
        emulatorAvailable = false;
      }
    }
  });

  afterAll(async () => {
    if (testEnv) await (testEnv as { cleanup: () => Promise<void> }).cleanup();
    if (admin.apps.length) {
      await Promise.all(admin.apps.map((a) => a?.delete()).filter(Boolean));
    }
  });

  async function setupTournament(
    tournamentId: string,
    opts: {
      status?: string;
      schedulePlanVersion?: number;
      startedAt?: FirebaseFirestore.Timestamp | null;
      registAt?: FirebaseFirestore.Timestamp | null;
      taskIndex?: { planHash: string; enqueueState?: string };
      taskIndexCloseReg?: { planHash: string; enqueueState?: string };
    } = {}
  ) {
    const db = getFirestore();
    const now = Timestamp.now();
    const tRef = db.collection('scheduledTournaments').doc(tournamentId);
    const rRef = tRef.collection('views').doc('runtime');
    await tRef.set({
      status: opts.status ?? 'scheduled',
      schedulePlanVersion: opts.schedulePlanVersion ?? 1,
      startAt: now,
      updatedAt: now,
    });
    await rRef.set({
      status: opts.status ?? 'scheduled',
      startRev: 1,
      registRev: 1,
      startedAt: opts.startedAt ?? null,
      registAt: opts.registAt ?? null,
      updatedAt: now,
    });
    if (opts.taskIndex) {
      const tiRef = tRef.collection('taskIndex').doc('startTournament');
      await tiRef.set({
        taskType: 'startTournament',
        planHash: opts.taskIndex.planHash,
        enqueueState: opts.taskIndex.enqueueState ?? 'enqueued',
        targetAt: now,
        enqueueDueAt: now,
        planVersion: opts.schedulePlanVersion ?? 1,
      });
    }
    if (opts.taskIndexCloseReg) {
      const tiRef = tRef.collection('taskIndex').doc('closeRegistration');
      await tiRef.set({
        taskType: 'closeRegistration',
        planHash: opts.taskIndexCloseReg.planHash,
        enqueueState: opts.taskIndexCloseReg.enqueueState ?? 'enqueued',
        targetAt: now,
        enqueueDueAt: now,
        planVersion: opts.schedulePlanVersion ?? 1,
      });
    }
  }

  describe('観点1: 新 payload 受付', () => {
    it('taskType, planVersion, planHash を含む payload で 200 が返る', async () => {
      if (!emulatorAvailable) return;
      const tid = 't-new-1';
      const planHash = computePlanHash(
        'startTournament',
        tid,
        new Date(),
        1
      );
      await setupTournament(tid, {
        taskIndex: { planHash },
      });

      const req = mockReq({
        body: {
          tournamentId: tid,
          taskType: 'startTournament',
          planVersion: 1,
          planHash,
        },
      });
      const res = mockRes();
      const result = await callControlHook(req, res);

      expect(result.statusCode).toBe(200);
    });
  });

  describe('観点2: no-op (version 不一致)', () => {
    it('planVersion が schedulePlanVersion と異なる場合、status は更新されず 200', async () => {
      if (!emulatorAvailable) return;
      const tid = 't-noop-ver';
      const planHash = computePlanHash('startTournament', tid, new Date(), 99);
      await setupTournament(tid, {
        schedulePlanVersion: 1,
        taskIndex: { planHash: planHash },
      });

      const req = mockReq({
        body: {
          tournamentId: tid,
          taskType: 'startTournament',
          planVersion: 99,
          planHash,
        },
      });
      const res = mockRes();
      const result = await callControlHook(req, res);

      expect(result.statusCode).toBe(200);

      const db = getFirestore();
      const tDoc = await db.collection('scheduledTournaments').doc(tid).get();
      expect(tDoc.data()?.status).toBe('scheduled');

      const tiDoc = await db
        .collection('scheduledTournaments')
        .doc(tid)
        .collection('taskIndex')
        .doc('startTournament')
        .get();
      expect(tiDoc.data()?.lastRunResult).toBe('noop');
      expect(tiDoc.data()?.enqueueState).toBe('executed');
    });
  });

  describe('観点3: no-op (hash 不一致)', () => {
    it('planHash が taskIndex と異なる場合、同上', async () => {
      if (!emulatorAvailable) return;
      const tid = 't-noop-hash';
      await setupTournament(tid, {
        schedulePlanVersion: 1,
        taskIndex: { planHash: 'old-hash-value' },
      });

      const req = mockReq({
        body: {
          tournamentId: tid,
          taskType: 'startTournament',
          planVersion: 1,
          planHash: 'new-hash-value',
        },
      });
      const res = mockRes();
      const result = await callControlHook(req, res);

      expect(result.statusCode).toBe(200);

      const db = getFirestore();
      const tDoc = await db.collection('scheduledTournaments').doc(tid).get();
      expect(tDoc.data()?.status).toBe('scheduled');

      const tiDoc = await db
        .collection('scheduledTournaments')
        .doc(tid)
        .collection('taskIndex')
        .doc('startTournament')
        .get();
      expect(tiDoc.data()?.lastRunResult).toBe('noop');
    });
  });

  describe('観点4: taskIndex が存在しない場合', () => {
    it('200 no-op。status は変わらない。taskIndex 更新なし', async () => {
      if (!emulatorAvailable) return;
      const tid = 't-no-taskindex';
      await setupTournament(tid, {});

      const req = mockReq({
        body: {
          tournamentId: tid,
          taskType: 'startTournament',
          planVersion: 1,
          planHash: 'any-hash',
        },
      });
      const res = mockRes();
      const result = await callControlHook(req, res);

      expect(result.statusCode).toBe(200);

      const db = getFirestore();
      const tiSnap = await db
        .collection('scheduledTournaments')
        .doc(tid)
        .collection('taskIndex')
        .doc('startTournament')
        .get();
      expect(tiSnap.exists).toBe(false);
    });
  });

  describe('観点5: 本処理 (startTournament)', () => {
    it('条件を満たせば scheduled→running、taskIndex に success 記録', async () => {
      if (!emulatorAvailable) return;
      const tid = 't-start-ok';
      const planHash = computePlanHash('startTournament', tid, new Date(), 1);
      await setupTournament(tid, {
        status: 'scheduled',
        schedulePlanVersion: 1,
        startedAt: null,
        taskIndex: { planHash },
      });

      const req = mockReq({
        body: {
          tournamentId: tid,
          taskType: 'startTournament',
          planVersion: 1,
          planHash,
        },
      });
      const res = mockRes();
      const result = await callControlHook(req, res);

      expect(result.statusCode).toBe(200);

      const db = getFirestore();
      const tDoc = await db.collection('scheduledTournaments').doc(tid).get();
      expect(tDoc.data()?.status).toBe('running');

      const rDoc = await db
        .collection('scheduledTournaments')
        .doc(tid)
        .collection('views')
        .doc('runtime')
        .get();
      expect(rDoc.data()?.startedAt).toBeDefined();

      const tiDoc = await db
        .collection('scheduledTournaments')
        .doc(tid)
        .collection('taskIndex')
        .doc('startTournament')
        .get();
      expect(tiDoc.data()?.lastRunResult).toBe('success');
    });
  });

  describe('観点6: 本処理 (closeRegistration)', () => {
    it('条件を満たせば running→registered、taskIndex に success 記録', async () => {
      if (!emulatorAvailable) return;
      const tid = 't-close-ok';
      const planHash = computePlanHash('closeRegistration', tid, new Date(), 1);
      await setupTournament(tid, {
        status: 'running',
        schedulePlanVersion: 1,
        startedAt: Timestamp.now(),
        registAt: null,
        taskIndexCloseReg: { planHash },
      });

      const req = mockReq({
        body: {
          tournamentId: tid,
          taskType: 'closeRegistration',
          planVersion: 1,
          planHash,
        },
      });
      const res = mockRes();
      const result = await callControlHook(req, res);

      expect(result.statusCode).toBe(200);

      const db = getFirestore();
      const tDoc = await db.collection('scheduledTournaments').doc(tid).get();
      expect(tDoc.data()?.status).toBe('registered');

      const rDoc = await db
        .collection('scheduledTournaments')
        .doc(tid)
        .collection('views')
        .doc('runtime')
        .get();
      expect(rDoc.data()?.registAt).toBeDefined();

      const tiDoc = await db
        .collection('scheduledTournaments')
        .doc(tid)
        .collection('taskIndex')
        .doc('closeRegistration')
        .get();
      expect(tiDoc.data()?.lastRunResult).toBe('success');
    });
  });

  describe('観点7: 旧 payload 後方互換', () => {
    it('action, tournamentId, rev の payload で現行どおり動作', async () => {
      if (!emulatorAvailable) return;
      const tid = 't-legacy-1';
      await setupTournament(tid, { status: 'scheduled', startedAt: null });

      const req = mockReq({
        body: {
          action: 'start',
          tournamentId: tid,
          rev: 1,
        },
      });
      const res = mockRes();
      const result = await callControlHook(req, res);

      expect(result.statusCode).toBe(200);

      const db = getFirestore();
      const tDoc = await db.collection('scheduledTournaments').doc(tid).get();
      expect(tDoc.data()?.status).toBe('running');
    });
  });

  describe('観点8: 不正 payload', () => {
    it('必須項目欠如で 400', async () => {
      const req = mockReq({
        body: { tournamentId: 't1' },
      });
      const res = mockRes();
      const result = await callControlHook(req, res);
      expect(result.statusCode).toBe(400);
    });

    it('taskType が不正で 400', async () => {
      const req = mockReq({
        body: {
          tournamentId: 't1',
          taskType: 'invalidType',
          planVersion: 1,
          planHash: 'h',
        },
      });
      const res = mockRes();
      const result = await callControlHook(req, res);
      expect(result.statusCode).toBe(400);
    });
  });

  describe('観点9: tournament/runtime 不在', () => {
    it('404 を返す。taskIndex があれば failed に更新', async () => {
      if (!emulatorAvailable) return;
      const tid = 't-notfound-1';
      const db = getFirestore();
      const planHash = 'ph1';
      await db
        .collection('scheduledTournaments')
        .doc(tid)
        .collection('taskIndex')
        .doc('startTournament')
        .set({
          taskType: 'startTournament',
          planHash,
          enqueueState: 'enqueued',
          planVersion: 1,
          targetAt: Timestamp.now(),
          enqueueDueAt: Timestamp.now(),
        });

      const req = mockReq({
        body: {
          tournamentId: tid,
          taskType: 'startTournament',
          planVersion: 1,
          planHash,
        },
      });
      const res = mockRes();
      const result = await callControlHook(req, res);

      expect(result.statusCode).toBe(404);

      const tiDoc = await db
        .collection('scheduledTournaments')
        .doc(tid)
        .collection('taskIndex')
        .doc('startTournament')
        .get();
      expect(tiDoc.data()?.enqueueState).toBe('failed');
      expect(tiDoc.data()?.error?.code).toMatch(/TOURNAMENT_NOT_FOUND|RUNTIME_NOT_FOUND/);
    });
  });

  describe('認証・メソッド', () => {
    it('POST 以外で 405', async () => {
      const req = mockReq({ method: 'GET' });
      const res = mockRes();
      const result = await callControlHook(req, res);
      expect(result.statusCode).toBe(405);
    });

    it('Bearer 無しで 401', async () => {
      const req = mockReq({
        headers: {},
        body: { taskType: 'startTournament', tournamentId: 't', planVersion: 1, planHash: 'h' },
      });
      const res = mockRes();
      const result = await callControlHook(req, res);
      expect(result.statusCode).toBe(401);
    });
  });
});
