/**
 * P1: openStoreTerminal / closeStoreTerminal 認可マトリクス
 *
 * requireAdmin 現行契約:
 * - admin OR terminal+store_management
 * - operational device がちょうど1件かつ active
 *
 * 認可拒否は logOpsError 対象外（HttpsError permission-denied / unauthenticated）。
 *
 * 前提: Firestore Emulator
 */

import { initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import * as admin from 'firebase-admin';
import { getFirestore, Timestamp, FieldValue } from 'firebase-admin/firestore';

import { closeStoreTerminal } from '../../src/domains/storeMeta/callables/closeStoreTerminal';
import { openStoreTerminal } from '../../src/domains/storeMeta/callables/openStoreTerminal';
import { a7E2EFlowStoreConfigDocument } from '../helpers/a7StoreConfig';
import { __setMockConfig, __resetMockConfig } from '../helpers/mockStoreConfig';

const PROJECT_ID = 'test-default';
const BUSINESS_DATE = '2026-07-25';
const NEXT_BUSINESS_DATE = '2026-07-26';
const PERMISSION_DENIED_MESSAGE = '営業管理の権限がありません';

describe('close/open StoreTerminal auth matrix', () => {
  let testEnv: RulesTestEnvironment;
  let db: admin.firestore.Firestore;

  beforeAll(async () => {
    process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8081';
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
    await Promise.all(admin.apps.map((a) => a?.delete()).filter(Boolean));
    delete process.env.FIRESTORE_EMULATOR_HOST;
  });

  beforeEach(async () => {
    await testEnv.clearFirestore();
    __setMockConfig(a7E2EFlowStoreConfigDocument());
  });

  afterEach(() => {
    __resetMockConfig();
  });

  async function seedRunning() {
    await db.collection('storeMeta').doc('currentBusinessDay').set({
      status: 'running',
      currentBusinessDateKey: BUSINESS_DATE,
      lastClosedBusinessDateKey: null,
      updatedAt: Timestamp.now(),
      source: 'test',
      lastError: null,
    });
  }

  async function seedClosed() {
    await db.collection('storeMeta').doc('currentBusinessDay').set({
      status: 'closed',
      currentBusinessDateKey: null,
      lastClosedBusinessDateKey: BUSINESS_DATE,
      updatedAt: Timestamp.now(),
      source: 'test',
      lastError: null,
    });
  }

  async function seedSideEffectsMarkers() {
    await db.collection('tables').doc('table_auth_1').set({
      status: 'in_use',
      updatedAt: FieldValue.serverTimestamp(),
    });
    await db.collection('sideGame').doc('table_auth_1').set({
      active: true,
      gameName: 'NLH',
      updatedAt: new Date(),
    });
    await db.collection('activeStays').doc('user_auth_stay').set({
      uid: 'user_auth_stay',
      billId: 'bill_auth_stay',
      isActive: true,
      startedAt: FieldValue.serverTimestamp(),
    });
    await db.collection('attendances').doc('att_auth').set({
      staffId: 'staff_auth',
      businessDate: BUSINESS_DATE,
      clockIn: Timestamp.now(),
      clockOut: null,
    });
    await db.collection('scheduledTournaments').doc('tn_auth').set({
      status: 'registered',
      businessDate: BUSINESS_DATE,
      updatedAt: FieldValue.serverTimestamp(),
    });
  }

  async function assertNoCloseSideEffects(expectedStatus: string, expectedDateKey: string | null) {
    const state = (await db.collection('storeMeta').doc('currentBusinessDay').get()).data()!;
    expect(state.status).toBe(expectedStatus);
    expect(state.currentBusinessDateKey ?? null).toBe(expectedDateKey);

    const runs = await db.collection('storeMeta').doc('closeRuns').collection('runs').get();
    expect(runs.empty).toBe(true);

    expect((await db.collection('tables').doc('table_auth_1').get()).data()?.status).toBe('in_use');
    expect((await db.collection('sideGame').doc('table_auth_1').get()).data()?.active).toBe(true);
    expect((await db.collection('activeStays').doc('user_auth_stay').get()).data()?.isActive).toBe(
      true,
    );
    expect((await db.collection('attendances').doc('att_auth').get()).data()?.clockOut ?? null).toBe(
      null,
    );
    expect((await db.collection('scheduledTournaments').doc('tn_auth').get()).data()?.status).toBe(
      'registered',
    );
  }

  describe('closeStoreTerminal', () => {
    it('unauthenticated → unauthenticated（閉店開始しない）', async () => {
      await seedRunning();
      await seedSideEffectsMarkers();

      await expect(
        (closeStoreTerminal as any).run({
          auth: undefined,
          data: { forceClose: true },
        }),
      ).rejects.toMatchObject({
        code: 'unauthenticated',
        message: '認証が必要です',
      });

      await assertNoCloseSideEffects('running', BUSINESS_DATE);
    });

    it('non-admin terminal → permission-denied', async () => {
      await seedRunning();
      await seedSideEffectsMarkers();
      await db.collection('devices').doc('dev_term_no_sm').set({
        uid: 'uid_term_no_sm',
        role: 'terminal',
        options: { order: true },
        status: 'active',
        name: 'No SM Terminal',
      });

      await expect(
        (closeStoreTerminal as any).run({
          auth: { uid: 'uid_term_no_sm' },
          data: { forceClose: true },
        }),
      ).rejects.toMatchObject({
        code: 'permission-denied',
        message: PERMISSION_DENIED_MESSAGE,
      });

      await assertNoCloseSideEffects('running', BUSINESS_DATE);
    });

    it('blocked admin → permission-denied', async () => {
      await seedRunning();
      await seedSideEffectsMarkers();
      await db.collection('devices').doc('dev_admin_blocked').set({
        uid: 'uid_admin_blocked',
        role: 'admin',
        status: 'blocked',
        name: 'Blocked Admin',
      });

      await expect(
        (closeStoreTerminal as any).run({
          auth: { uid: 'uid_admin_blocked' },
          data: { forceClose: true },
        }),
      ).rejects.toMatchObject({
        code: 'permission-denied',
        message: PERMISSION_DENIED_MESSAGE,
      });

      await assertNoCloseSideEffects('running', BUSINESS_DATE);
    });

    it('archived（非 active）admin → permission-denied', async () => {
      await seedRunning();
      await seedSideEffectsMarkers();
      await db.collection('devices').doc('dev_admin_archived').set({
        uid: 'uid_admin_archived',
        role: 'admin',
        status: 'archived',
        name: 'Archived Admin',
      });

      await expect(
        (closeStoreTerminal as any).run({
          auth: { uid: 'uid_admin_archived' },
          data: { forceClose: true },
        }),
      ).rejects.toMatchObject({
        code: 'permission-denied',
        message: PERMISSION_DENIED_MESSAGE,
      });

      await assertNoCloseSideEffects('running', BUSINESS_DATE);
    });

    it('active admin → close 成功', async () => {
      await seedRunning();
      await db.collection('devices').doc('dev_admin_active_close').set({
        uid: 'uid_admin_active_close',
        role: 'admin',
        status: 'active',
        name: 'Active Admin Close',
      });

      const result = await (closeStoreTerminal as any).run({
        auth: { uid: 'uid_admin_active_close' },
        data: { forceClose: true },
      });
      expect(result.success).toBe(true);

      const state = (await db.collection('storeMeta').doc('currentBusinessDay').get()).data()!;
      expect(state.status).toBe('closed');
      expect(state.currentBusinessDateKey).toBeNull();
      expect(result.runId).toBeDefined();
      const run = await db
        .collection('storeMeta')
        .doc('closeRuns')
        .collection('runs')
        .doc(result.runId)
        .get();
      expect(run.exists).toBe(true);
    });
  });

  describe('openStoreTerminal', () => {
    it('unauthenticated → unauthenticated', async () => {
      await seedClosed();

      await expect(
        (openStoreTerminal as any).run({
          auth: undefined,
          data: { businessDateKey: NEXT_BUSINESS_DATE },
        }),
      ).rejects.toMatchObject({
        code: 'unauthenticated',
        message: '認証が必要です',
      });

      const state = (await db.collection('storeMeta').doc('currentBusinessDay').get()).data()!;
      expect(state.status).toBe('closed');
      expect(state.currentBusinessDateKey).toBeNull();
    });

    it('non-admin terminal → permission-denied', async () => {
      await seedClosed();
      await db.collection('devices').doc('dev_term_open_no_sm').set({
        uid: 'uid_term_open_no_sm',
        role: 'terminal',
        options: {},
        status: 'active',
        name: 'No SM Open',
      });

      await expect(
        (openStoreTerminal as any).run({
          auth: { uid: 'uid_term_open_no_sm' },
          data: { businessDateKey: NEXT_BUSINESS_DATE },
        }),
      ).rejects.toMatchObject({
        code: 'permission-denied',
        message: PERMISSION_DENIED_MESSAGE,
      });

      const state = (await db.collection('storeMeta').doc('currentBusinessDay').get()).data()!;
      expect(state.status).toBe('closed');
    });

    it('blocked admin → permission-denied', async () => {
      await seedClosed();
      await db.collection('devices').doc('dev_admin_blocked_open').set({
        uid: 'uid_admin_blocked_open',
        role: 'admin',
        status: 'blocked',
        name: 'Blocked Admin Open',
      });

      await expect(
        (openStoreTerminal as any).run({
          auth: { uid: 'uid_admin_blocked_open' },
          data: { businessDateKey: NEXT_BUSINESS_DATE },
        }),
      ).rejects.toMatchObject({
        code: 'permission-denied',
        message: PERMISSION_DENIED_MESSAGE,
      });

      const state = (await db.collection('storeMeta').doc('currentBusinessDay').get()).data()!;
      expect(state.status).toBe('closed');
    });

    it('active admin → open 成功', async () => {
      await seedClosed();
      await db.collection('devices').doc('dev_admin_active_open').set({
        uid: 'uid_admin_active_open',
        role: 'admin',
        status: 'active',
        name: 'Active Admin Open',
      });

      const result = await (openStoreTerminal as any).run({
        auth: { uid: 'uid_admin_active_open' },
        data: { businessDateKey: NEXT_BUSINESS_DATE },
      });
      expect(result.success).toBe(true);

      const state = (await db.collection('storeMeta').doc('currentBusinessDay').get()).data()!;
      expect(state.status).toBe('running');
      expect(state.currentBusinessDateKey).toBe(NEXT_BUSINESS_DATE);
    });
  });
});
