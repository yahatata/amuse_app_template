import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import {
  ENQUEUE_TOURNAMENT_REPLAN_REQUEST_DOC_ID,
  ENQUEUE_TOURNAMENT_REPLAN_REQUESTS_COLLECTION,
  getEnqueueTournamentTasksReplanRequest,
  upsertEnqueueTournamentTasksReplanRequest,
} from '../../src/domains/scheduler/replan/enqueueTournamentTasksReplanRequest';

const PROJECT_ID = 'test-replan-request';

describe('enqueueTournamentTasksReplanRequest', () => {
  let testEnv: any;
  let db: admin.firestore.Firestore;
  let emulatorAvailable = true;

  beforeAll(async () => {
    process.env.FIRESTORE_EMULATOR_HOST =
      process.env.FIRESTORE_EMULATOR_HOST || 'localhost:8081';
    process.env.GCLOUD_PROJECT = PROJECT_ID;
    testEnv = await initializeTestEnvironment({ projectId: PROJECT_ID });
    if (admin.apps.length > 0) {
      await Promise.all(admin.apps.map((a) => a?.delete()).filter(Boolean));
    }
    admin.initializeApp({ projectId: PROJECT_ID });
    db = getFirestore();
  });

  afterAll(async () => {
    await testEnv.cleanup();
    if (admin.apps.length > 0) {
      await Promise.all(admin.apps.map((a) => a?.delete()).filter(Boolean));
    }
  });

  beforeEach(async () => {
    if (!emulatorAvailable) return;
    try {
      await testEnv.clearFirestore();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('fetch failed') || msg.includes('ECONNREFUSED')) {
        emulatorAvailable = false;
        return;
      }
      throw e;
    }
  });

  it('upsert 時に request を作成し、aggregateVersion をインクリメントする', async () => {
    if (!emulatorAvailable) return;

    await upsertEnqueueTournamentTasksReplanRequest({
      requestedBy: 'manual-callable',
      reason: 'manual',
      now: new Date('2026-04-01T00:00:00.000Z'),
    });

    let request = await getEnqueueTournamentTasksReplanRequest();
    expect(request).not.toBeNull();
    expect(request!.requestType).toBe('enqueueTournamentTasksByScheduler');
    expect(request!.requestedBy).toBe('manual-callable');
    expect(request!.reason).toBe('manual');
    expect(request!.aggregateVersion).toBe(1);
    expect(request!.projectId).toBe(PROJECT_ID);

    await upsertEnqueueTournamentTasksReplanRequest({
      requestedBy: 'firestore-trigger',
      reason: 'templateUpdated',
      now: new Date('2026-04-01T01:00:00.000Z'),
    });

    request = await getEnqueueTournamentTasksReplanRequest();
    expect(request).not.toBeNull();
    expect(request!.requestedBy).toBe('firestore-trigger');
    expect(request!.reason).toBe('templateUpdated');
    expect(request!.aggregateVersion).toBe(2);
  });

  it('request は固定IDドキュメントへ保存される', async () => {
    if (!emulatorAvailable) return;

    await upsertEnqueueTournamentTasksReplanRequest({
      requestedBy: 'manual-callable',
      reason: 'manual',
    });

    const snap = await db
      .collection(ENQUEUE_TOURNAMENT_REPLAN_REQUESTS_COLLECTION)
      .doc(ENQUEUE_TOURNAMENT_REPLAN_REQUEST_DOC_ID)
      .get();

    expect(snap.exists).toBe(true);
  });
});

